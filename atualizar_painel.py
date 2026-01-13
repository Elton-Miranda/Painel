import pandas as pd
import json
import datetime
import os

# --- CONFIGURAÇÕES ---
ARQUIVO_TXT = 'TBL_OCORRENCIA_2025.TXT'
ARQUIVO_SAIDA = 'historico_2025.js'
FILTRO_CONTRATADA = 'ABILITY_SJ'

SJC_CITIES = ['SAO JOSE DOS CAMPOS', 'JACAREI', 'TAUBATE', 'CACAPAVA', 'PINDAMONHANGABA', 'GUARATINGUETA', 'APARECIDA', 'CAMPOS DO JORDAO', 'TREMEMBE', 'CRUZEIRO', 'LORENA', 'POTIM', 'ROSEIRA']
LITORAL_CITIES = ['SAO SEBASTIAO', 'ILHABELA', 'CARAGUATATUBA', 'UBATUBA', 'SANTOS', 'SAO VICENTE', 'GUARUJA', 'PRAIA GRANDE', 'MONGAGUA', 'ITANHAEM', 'PERUIBE', 'BERTIOGA', 'CUBATAO']

def get_region(city):
    city = str(city).upper().strip()
    if city in SJC_CITIES: return 'SJC'
    if city in LITORAL_CITIES: return 'LITORAL'
    return 'OUTROS'

def get_snapshot_metrics(df, start_date, end_date):
    """Gera métricas consolidadas para um mês histórico."""
    snapshot_point = end_date
    data = {}

    # 1. BACKLOG (Ativos no fim do mês)
    # Definição: Abertos antes do fim do mês E (Não fechados OU Fechados depois do fim do mês)
    mask_active = (df['DT_OPEN'] <= end_date) & ((df['DT_CLOSE'] > end_date) | (df['DT_CLOSE'].isna()))
    df_active = df[mask_active].copy()
    df_active['AGING'] = (snapshot_point - df_active['DT_OPEN']).dt.total_seconds() / 3600

    backlog = {"sjc": {"total_backlog": 0}, "litoral": {"total_backlog": 0}}
    criticos_lista = {"sjc": [], "litoral": []}
    oc_por_at = {"sjc": [], "litoral": []}

    for reg in ['SJC', 'LITORAL']:
        key = reg.lower()
        sub = df_active[df_active['REGION'] == reg]
        if sub.empty: continue
        
        backlog[key]['total_backlog'] = int(len(sub))
        
        # Lista Detalhada
        criticos = sub[sub['AGING'] > 24].sort_values('AGING', ascending=False).head(50)
        criticos_lista[key] = []
        for _, row in criticos.iterrows():
            d = int(row['AGING'] // 24)
            h = int(row['AGING'] % 24)
            criticos_lista[key].append({
                "id": str(row['ID']),
                "aging_str": f"{d}d {h}h",
                "afetacao": str(row['AT']),
                "vip": bool(row['B2B'] > 0),
                "hunter": False
            })

        # Top Ofensores
        at_counts = sub['AT'].value_counts().head(20)
        oc_por_at[key] = [{"at": k, "qtd": int(v)} for k, v in at_counts.items()]

    data['backlog_litoral'] = backlog['litoral']
    data['backlog_sjc'] = backlog['sjc']
    data['criticos_lista_litoral'] = criticos_lista['litoral']
    data['criticos_lista_sjc'] = criticos_lista['sjc']
    data['oc_por_at_litoral'] = oc_por_at['litoral']
    data['oc_por_at_sjc'] = oc_por_at['sjc']

    # 2. STATUS (Correção: Entrantes vs O que foi baixado DENTRO do mês)
    # Filtro: Tudo que abriu neste mês
    mask_month_open = (df['DT_OPEN'] >= start_date) & (df['DT_OPEN'] <= end_date)
    df_opened_period = df[mask_month_open].copy()
    
    status = {"sjc": {}, "litoral": {}}
    for reg in ['SJC', 'LITORAL']:
        # Subconjunto: Chamados abertos na região neste mês
        sub_open = df_opened_period[df_opened_period['REGION'] == reg]
        total_entrante = int(len(sub_open))
        
        # Desses que abriram, quantos fecharam até o fim do mês?
        # Lógica: Tem data fim E data fim <= fim do mês
        encerrados_no_periodo = int(len(sub_open[
            (sub_open['DT_CLOSE'].notna()) & 
            (sub_open['DT_CLOSE'] <= end_date)
        ]))
        
        # O resto é saldo (Execução/Pendência gerada no mês)
        em_execucao = total_entrante - encerrados_no_periodo
        
        status[reg.lower()] = {
            "em_andamento": em_execucao,  # EXEC (Saldo do mês)
            "nao_iniciada": 0,            # Prox (Mantido 0 por enquanto)
            "encerrada": encerrados_no_periodo # Encerrado
        }
    
    data['status_litoral'] = status['litoral']
    data['status_sjc'] = status['sjc']

    # 3. SLA (Baseado apenas nos fechados do período)
    mask_month_closed = (df['DT_CLOSE'] >= start_date) & (df['DT_CLOSE'] <= end_date)
    df_closed = df[mask_month_closed].copy()
    
    df_closed['SLA_VAL'] = (df_closed['DT_CLOSE'] - df_closed['DT_OPEN']).dt.total_seconds() / 3600
    df_closed['TARGET'] = df_closed['B2B'].apply(lambda x: 4 if x > 0 else 8)
    df_closed['IS_NOK'] = df_closed['SLA_VAL'] > df_closed['TARGET']

    sla = {"sjc": {"in":0, "out":0}, "litoral": {"in":0, "out":0}}
    for reg in ['SJC', 'LITORAL']:
        sub = df_closed[df_closed['REGION'] == reg]
        sla[reg.lower()]['out'] = int(sub['IS_NOK'].sum())
        sla[reg.lower()]['in'] = int(len(sub) - sla[reg.lower()]['out'])
    
    data['sla'] = sla

    # 4. EVOLUÇÃO DIÁRIA (Entrada vs Fora SLA)
    # Linha Verde: Total de Abertos no dia
    # Linha Vermelha: Total de Fechados fora do prazo no dia
    
    df_opened_period['DT_DIA'] = df_opened_period['DT_OPEN'].dt.date
    series_entrantes = df_opened_period.groupby('DT_DIA').size()

    df_closed['DT_DIA'] = df_closed['DT_CLOSE'].dt.date
    series_nok = df_closed[df_closed['IS_NOK']].groupby('DT_DIA').size()

    all_dates = sorted(list(set(series_entrantes.index) | set(series_nok.index)))
    
    diarizado = []
    for dia in all_dates:
        diarizado.append({
            "data": str(dia),
            "sla_ok": int(series_entrantes.get(dia, 0)), 
            "sla_nok": int(series_nok.get(dia, 0))
        })
    
    diarizado.sort(key=lambda x: x['data'])
    data['ocs_diarizado'] = diarizado

    return data

def main():
    print(f"--- ATUALIZANDO HISTÓRICO: STATUS CORRIGIDO ---")
    if not os.path.exists(ARQUIVO_TXT):
        print(f"Arquivo {ARQUIVO_TXT} não encontrado.")
        return

    try:
        cols = ['ID_OCORRENCIA', 'DATA_OCORRENCIA', 'DATA_OCORRENCIA_FINAL', 'STATUS', 'MUNICIPIO', 'CONTRATADA', 'AT', 'B2B_AVANCADO']
        df = pd.read_csv(ARQUIVO_TXT, sep='|', encoding='latin1', on_bad_lines='skip', usecols=lambda c: c in cols, low_memory=False)
    except Exception as e:
        print(f"Erro leitura: {e}")
        return

    df.columns = df.columns.str.strip()
    df.rename(columns={
        'ID_OCORRENCIA': 'ID', 'DATA_OCORRENCIA': 'DT_OPEN', 'DATA_OCORRENCIA_FINAL': 'DT_CLOSE',
        'B2B_AVANCADO': 'B2B', 'CONTRATADA': 'CONTRACT', 'MUNICIPIO': 'CITY'
    }, inplace=True)

    df = df[df['CONTRACT'].str.strip().str.upper() == FILTRO_CONTRATADA]
    
    df['DT_OPEN'] = pd.to_datetime(df['DT_OPEN'], errors='coerce')
    df['DT_CLOSE'] = pd.to_datetime(df['DT_CLOSE'], errors='coerce')
    df.dropna(subset=['DT_OPEN'], inplace=True)
    
    df['REGION'] = df['CITY'].apply(get_region)
    df['B2B'] = pd.to_numeric(df['B2B'], errors='coerce').fillna(0)

    history = {}
    
    for m in range(1, 13):
        print(f"Processando Mês {m}...")
        start = datetime.datetime(2025, m, 1)
        if m == 12: end = datetime.datetime(2026, 1, 1) - datetime.timedelta(seconds=1)
        else: end = datetime.datetime(2025, m+1, 1) - datetime.timedelta(seconds=1)
        
        history[str(m)] = get_snapshot_metrics(df, start, end)

    js_content = f"window.HISTORICO_STATIC = {json.dumps({'history': {'2025': history}})};"
    
    with open(ARQUIVO_SAIDA, 'w', encoding='utf-8') as f:
        f.write(js_content)
    
    print(f"Sucesso! Recarregue a página.")

if __name__ == "__main__":
    main()