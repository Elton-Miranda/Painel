import pandas as pd
import json
import datetime
import os
import glob

# --- CONFIGURAÇÕES ---
ARQUIVO_SAIDA = 'dados.js'
FILTRO_CONTRATADA = 'ABILITY_SJ'

# Mapeamento de Cidades
SJC_CITIES = ['SAO JOSE DOS CAMPOS', 'JACAREI', 'TAUBATE', 'CACAPAVA', 'PINDAMONHANGABA', 'GUARATINGUETA', 'APARECIDA', 'CAMPOS DO JORDAO', 'TREMEMBE', 'CRUZEIRO', 'LORENA', 'POTIM', 'ROSEIRA']
LITORAL_CITIES = ['SAO SEBASTIAO', 'ILHABELA', 'CARAGUATATUBA', 'UBATUBA', 'SANTOS', 'SAO VICENTE', 'GUARUJA', 'PRAIA GRANDE', 'MONGAGUA', 'ITANHAEM', 'PERUIBE', 'BERTIOGA', 'CUBATAO']

def detectar_arquivos_dados():
    arquivos = glob.glob('*.txt') + glob.glob('*.TXT') + glob.glob('*.csv') + glob.glob('*.CSV')
    validos = []
    print(f"Varrendo {len(arquivos)} arquivos...")
    for arq in arquivos:
        if arq == ARQUIVO_SAIDA: continue
        try:
            with open(arq, 'r', encoding='latin1') as f:
                header = f.readline()
            if 'MUNICIPIO' in header and 'CONTRATADA' in header:
                print(f"  [OK] Identificado: {arq}")
                validos.append(arq)
        except: pass
    return validos

def load_data():
    arquivos = detectar_arquivos_dados()
    if not arquivos: return pd.DataFrame()

    dfs = []
    for arq in arquivos:
        try:
            df = pd.read_csv(arq, sep='|', encoding='latin1', on_bad_lines='skip', low_memory=False)
            df.columns = df.columns.str.strip()
            dfs.append(df)
        except Exception as e:
            print(f"  [ERRO] {arq}: {e}")

    if not dfs: return pd.DataFrame()

    print("Consolidando bases...")
    df_final = pd.concat(dfs, ignore_index=True)

    if 'ID_OCORRENCIA' in df_final.columns:
        df_final.drop_duplicates(subset='ID_OCORRENCIA', keep='last', inplace=True)
    
    df_final['DATA_OCORRENCIA'] = pd.to_datetime(df_final['DATA_OCORRENCIA'], errors='coerce')
    df_final['DATA_OCORRENCIA_FINAL'] = pd.to_datetime(df_final['DATA_OCORRENCIA_FINAL'], errors='coerce')
    
    if 'CONTRATADA' in df_final.columns:
        df_final['CONTRATADA'] = df_final['CONTRATADA'].astype(str).str.strip().str.upper()
    
    df_final['REGION'] = df_final['MUNICIPIO'].apply(get_region)
    df_final['DASH_STATUS'] = df_final['STATUS'].apply(get_dashboard_status)

    return df_final

def get_region(city):
    city = str(city).upper().strip()
    if city in SJC_CITIES: return 'SJC'
    if city in LITORAL_CITIES: return 'LITORAL'
    return 'OUTROS'

def get_dashboard_status(status):
    status = str(status).upper().strip()
    if status in ['FECHADO', 'IMPROCEDIDO', 'CANCELADO', 'ENCERRADO']: return 'ENCERRADA'
    if status == 'ABERTO': return 'NÃO INICIADA'
    if status == 'ASSOCIADO': return 'EM ANDAMENTO'
    return 'NÃO INICIADA'

def get_bar_status(dash_status):
    if dash_status == 'EM ANDAMENTO': return 'EM EXECUÇÃO'
    if dash_status == 'NÃO INICIADA': return 'AGUARDANDO'
    return 'ENCERRADA'

# --- CÁLCULOS FILTRADOS ---
def calculate_metrics(df_filtrado, now_ref):
    """
    Calcula TODAS as métricas usando APENAS o dataframe filtrado pelo período.
    Isso garante que ao clicar em D-1, só vejamos dados de D-1.
    """
    data = {}
    
    # Separação Regional
    df_lit = df_filtrado[df_filtrado['REGION'] == 'LITORAL']
    df_sjc = df_filtrado[df_filtrado['REGION'] == 'SJC']

    # 1. Status (Donuts) - Só do período
    for k, d in [('status_litoral', df_lit), ('status_sjc', df_sjc)]:
        c = d['DASH_STATUS'].value_counts()
        data[k] = {
            "em_andamento": int(c.get('EM ANDAMENTO',0)), 
            "nao_iniciada": int(c.get('NÃO INICIADA',0)), 
            "encerrada": int(c.get('ENCERRADA',0))
        }
    
    # 2. Detalhe (Barras) - Só do período
    for k, d in [('oc_por_at_litoral', df_lit), ('oc_por_at_sjc', df_sjc)]:
        bc = d['DASH_STATUS'].apply(get_bar_status).value_counts()
        data[k] = [{"at": key, "qtd": int(val)} for key, val in bc.items()]

    # 3. KPIs Roxos - Só do período
    data['kpis_litoral'] = calculate_simple_kpis(df_lit, now_ref)
    data['kpis_sjc'] = calculate_simple_kpis(df_sjc, now_ref)

    # 4. Fluxo (Entrada/Saída) - Só do período
    data['fluxo'] = {
        "entrada": int(len(df_filtrado)), 
        "saida": int(len(df_filtrado[df_filtrado['DASH_STATUS'] == 'ENCERRADA']))
    }
    
    # 5. Diarizado - Só do período (mostra a evolução dentro do recorte)
    daily_open = df_filtrado.groupby(df_filtrado['DATA_OCORRENCIA'].dt.date).size()
    daily_close = df_filtrado.groupby(df_filtrado['DATA_OCORRENCIA_FINAL'].dt.date).size()
    all_dates = sorted(set(daily_open.index) | set(daily_close.index))
    ocs = []
    for d in all_dates:
        if pd.isna(d): continue
        ocs.append({"data": str(d), "aberto": int(daily_open.get(d,0)), "fechado": int(daily_close.get(d,0))})
    data['ocs_diarizado'] = sorted(ocs, key=lambda x: x['data'])

    # 6. Backlog Aging (Específico do Filtro)
    # Mostra a idade dos chamados DESTE PERÍODO que ainda estão abertos.
    # Ex: Em D-1, mostra quantos chamados de ontem ainda estão abertos hoje e sua idade.
    data['backlog_litoral'] = calculate_backlog_aging(df_lit, now_ref)
    data['backlog_sjc'] = calculate_backlog_aging(df_sjc, now_ref)
    
    # 7. Repasse D-1 (Só faz sentido se o filtro for D-1 ou maior, mas calculamos sempre)
    # Aqui vamos usar uma lógica genérica: Do que foi criado neste período, o que ainda está aberto?
    data['backlog_d1_specific'] = {
        "litoral": int(len(df_lit[df_lit['DASH_STATUS'] != 'ENCERRADA'])),
        "sjc": int(len(df_sjc[df_sjc['DASH_STATUS'] != 'ENCERRADA']))
    }

    return data

def calculate_simple_kpis(subset, now_ref):
    if subset.empty: return {"oc_24h": 0, "aberto": 0, "encerrado": 0, "total": 0}
    encerrado = len(subset[subset['DASH_STATUS'] == 'ENCERRADA'])
    abertos = subset[subset['DASH_STATUS'] != 'ENCERRADA']
    oc_24h = 0
    if not abertos.empty:
        duration = now_ref - abertos['DATA_OCORRENCIA']
        oc_24h = (duration > pd.Timedelta(hours=24)).sum()
    return {"oc_24h": int(oc_24h), "aberto": int(len(abertos)), "encerrado": int(encerrado), "total": int(len(subset))}

def calculate_backlog_aging(df, now_ref):
    # Calcula aging apenas para o subset passado (respeitando o filtro de data)
    abertos = df[df['DASH_STATUS'] != 'ENCERRADA'].copy()
    metrics = {"ate_24h": 0, "de_24_72h": 0, "mais_72h": 0, "total_backlog": 0}
    if abertos.empty: return metrics
    
    abertos['IDADE_HORAS'] = (now_ref - abertos['DATA_OCORRENCIA']).dt.total_seconds() / 3600
    metrics['ate_24h'] = int((abertos['IDADE_HORAS'] <= 24).sum())
    metrics['de_24_72h'] = int(((abertos['IDADE_HORAS'] > 24) & (abertos['IDADE_HORAS'] <= 72)).sum())
    metrics['mais_72h'] = int((abertos['IDADE_HORAS'] > 72).sum())
    metrics['total_backlog'] = int(len(abertos))
    return metrics

def main():
    print("--- PROCESSAMENTO WAR ROOM (FILTRO TOTAL) ---")
    
    df = load_data()
    if df.empty: return

    df = df[df['CONTRATADA'] == FILTRO_CONTRATADA]
    print(f"Registros filtrados ({FILTRO_CONTRATADA}): {len(df)}")
    if len(df) == 0: return

    ref_date = df['DATA_OCORRENCIA'].max()
    print(f"Data Referência: {ref_date}")
    
    years = sorted(df['DATA_OCORRENCIA'].dt.year.unique())
    print(f"Anos: {years}")

    # Tendências Anuais (Global - não muda com botões rápidos)
    trends_by_year = {}
    for year in years:
        df_year = df[df['DATA_OCORRENCIA'].dt.year == year]
        idx_mensal = df_year.groupby(df_year['DATA_OCORRENCIA'].dt.month).size()
        mensal_list = [int(idx_mensal.get(m, 0)) for m in range(1, 13)]
        
        idx_afetacao = df_year.groupby(df_year['DATA_OCORRENCIA'].dt.month)['AFETACAO'].sum()
        afetacao_list = [int(idx_afetacao.get(m, 0)) for m in range(1, 13)]
        trends_by_year[str(year)] = {"mensal": mensal_list, "afetacao": afetacao_list}

    # Views Rápidas (FILTRO RESTRITIVO)
    # Cada view recebe APENAS os dados daquela data/periodo
    df['DT_DATE'] = df['DATA_OCORRENCIA'].dt.date
    ref_day = ref_date.date()
    views = {}
    
    # D-0 (Apenas hoje)
    views['d0'] = calculate_metrics(df[df['DT_DATE'] == ref_day], ref_date)
    
    # D-1 (Apenas ontem)
    views['d1'] = calculate_metrics(df[df['DT_DATE'] == (ref_day - datetime.timedelta(days=1))], ref_date)
    
    # D-2 (Apenas anteontem)
    views['d2'] = calculate_metrics(df[df['DT_DATE'] == (ref_day - datetime.timedelta(days=2))], ref_date)
    
    # Semana (Últimos 7 dias ou Semana corrente)
    # Vamos usar Rolling 7 Days para ser útil
    views['semana'] = calculate_metrics(df[df['DT_DATE'] >= (ref_day - datetime.timedelta(days=6))], ref_date)
    
    # Quinzena
    views['quinzena'] = calculate_metrics(df[df['DT_DATE'] >= (ref_day - datetime.timedelta(days=14))], ref_date)
    
    # Mês Atual
    views['mes_atual'] = calculate_metrics(
        df[(df['DATA_OCORRENCIA'].dt.month == ref_date.month) & (df['DATA_OCORRENCIA'].dt.year == ref_date.year)], 
        ref_date
    )

    # Histórico (Ano > Mês)
    history = {}
    for year in years:
        history[str(year)] = {}
        for month in range(1, 13):
            df_month = df[(df['DATA_OCORRENCIA'].dt.year == year) & (df['DATA_OCORRENCIA'].dt.month == month)]
            history[str(year)][str(month)] = calculate_metrics(df_month, ref_date)

    payload = {
        "years_available": [str(y) for y in years],
        "trends_by_year": trends_by_year,
        "views": views,
        "history": history,
        "ref_date": ref_date.strftime('%d/%m/%Y')
    }

    with open(ARQUIVO_SAIDA, 'w', encoding='utf-8') as f:
        f.write(f"window.DADOS_PAINEL = {json.dumps(payload, indent=2)};")
    
    print("SUCESSO! Dados gerados com filtro restritivo.")

if __name__ == "__main__":
    main()