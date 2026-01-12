import pandas as pd
import json
import datetime
import os

# --- CONFIGURAÇÕES ---
ARQUIVO_TXT = 'TBL_OCORRENCIA_2025.TXT'
ARQUIVO_SAIDA = 'historico_2025.js'
FILTRO_CONTRATADA = 'ABILITY_SJ'

# Mapeamento de Cidades
SJC_CITIES = ['SAO JOSE DOS CAMPOS', 'JACAREI', 'TAUBATE', 'CACAPAVA', 'PINDAMONHANGABA', 'GUARATINGUETA', 'APARECIDA', 'CAMPOS DO JORDAO', 'TREMEMBE', 'CRUZEIRO', 'LORENA', 'POTIM', 'ROSEIRA']
LITORAL_CITIES = ['SAO SEBASTIAO', 'ILHABELA', 'CARAGUATATUBA', 'UBATUBA', 'SANTOS', 'SAO VICENTE', 'GUARUJA', 'PRAIA GRANDE', 'MONGAGUA', 'ITANHAEM', 'PERUIBE', 'BERTIOGA', 'CUBATAO']

def get_region(city):
    city = str(city).upper().strip()
    if city in SJC_CITIES: return 'SJC'
    if city in LITORAL_CITIES: return 'LITORAL'
    return 'OUTROS'

def calc_aging_str(hours):
    if pd.isna(hours) or hours < 0: return "-"
    d, h = int(hours // 24), int(hours % 24)
    return f"{d}d {h}h" if d > 0 else f"{h}h"

def get_snapshot_metrics(df, start_date, end_date):
    """Gera métricas consolidadas para um mês histórico."""
    snapshot_point = end_date
    data = {}

    # 1. BACKLOG & AGING (Retrato do fim do mês)
    # Definição: Criados antes do fim do mês E (Fechados depois do fim ou Ainda Abertos)
    mask_active = (df['DT_OPEN'] <= end_date) & ((df['DT_CLOSE'] > end_date) | (df['DT_CLOSE'].isna()))
    df_active = df[mask_active].copy()
    df_active['AGING'] = (snapshot_point - df_active['DT_OPEN']).dt.total_seconds() / 3600

    backlog = {"sjc": {"total_backlog": 0, "ate_24h": 0, "de_24_72h": 0, "mais_72h": 0}, 
               "litoral": {"total_backlog": 0, "ate_24h": 0, "de_24_72h": 0, "mais_72h": 0}}
    
    # Listas de "Ofensores" (Top ATs com mais casos)
    oc_por_at = {"sjc": [], "litoral": []}

    for reg in ['SJC', 'LITORAL']:
        sub = df_active[df_active['REGION'] == reg]
        if sub.empty: continue
        
        # Dados para Donut de Aging
        key = reg.lower()
        backlog[key]['total_backlog'] = len(sub)
        backlog[key]['ate_24h'] = len(sub[sub['AGING'] <= 24])
        backlog[key]['de_24_72h'] = len(sub[(sub['AGING'] > 24) & (sub['AGING'] <= 72)])
        backlog[key]['mais_72h'] = len(sub[sub['AGING'] > 72])

        # Top 10 ATs
        at_counts = sub['AT'].value_counts().head(20)
        oc_por_at[key] = [{"at": k, "qtd": int(v)} for k, v in at_counts.items()]

    data['backlog_litoral'] = backlog['litoral']
    data['backlog_sjc'] = backlog['sjc']
    data['oc_por_at_litoral'] = oc_por_at['litoral']
    data['oc_por_at_sjc'] = oc_por_at['sjc']

    # 2. STATUS (Produção DENTRO do mês)
    mask_month = (df['DT_OPEN'] >= start_date) & (df['DT_OPEN'] <= end_date)
    df_month = df[mask_month].copy()
    
    status = {"sjc": {"em_andamento":0, "nao_iniciada":0, "encerrada":0}, 
              "litoral": {"em_andamento":0, "nao_iniciada":0, "encerrada":0}}
    
    for reg in ['SJC', 'LITORAL']:
        sub = df_month[df_month['REGION'] == reg]
        # Simplificação para histórico: Se tem data fim, é encerrado
        encerrados = len(sub[sub['DT_CLOSE'].notna()])
        abertos = len(sub) - encerrados
        status[reg.lower()] = {"em_andamento": abertos, "nao_iniciada": 0, "encerrada": encerrados}
    
    data['status_litoral'] = status['litoral']
    data['status_sjc'] = status['sjc']

    # 3. SLA (Fechados DENTRO do mês)
    mask_closed = (df['DT_CLOSE'] >= start_date) & (df['DT_CLOSE'] <= end_date)
    df_closed = df[mask_closed].copy()
    df_closed['SLA_VAL'] = (df_closed['DT_CLOSE'] - df_closed['DT_OPEN']).dt.total_seconds() / 3600
    
    sla = {"sjc": {"in":0, "out":0}, "litoral": {"in":0, "out":0}}
    for _, r in df_closed.iterrows():
        reg = r['REGION'].lower()
        if reg not in sla: continue
        target = 4 if r['B2B'] > 0 else 8
        if r['SLA_VAL'] <= target: sla[reg]['in'] += 1
        else: sla[reg]['out'] += 1
    
    data['sla'] = sla

    return data

def main():
    print(f"--- LENDO {ARQUIVO_TXT} ---")
    
    if not os.path.exists(ARQUIVO_TXT):
        print(f"[ERRO] Arquivo '{ARQUIVO_TXT}' não encontrado na pasta.")
        return

    try:
        # Lê apenas colunas necessárias para economizar memória
        cols = ['ID_OCORRENCIA', 'DATA_OCORRENCIA', 'DATA_OCORRENCIA_FINAL', 'STATUS', 'MUNICIPIO', 'CONTRATADA', 'AT', 'B2B_AVANCADO']
        df = pd.read_csv(ARQUIVO_TXT, sep='|', encoding='latin1', on_bad_lines='skip', usecols=lambda c: c in cols, low_memory=False)
    except Exception as e:
        print(f"[ERRO] Falha na leitura: {e}")
        return

    # Normalização
    df.columns = df.columns.str.strip()
    df.rename(columns={
        'ID_OCORRENCIA': 'ID', 'DATA_OCORRENCIA': 'DT_OPEN', 'DATA_OCORRENCIA_FINAL': 'DT_CLOSE',
        'B2B_AVANCADO': 'B2B', 'CONTRATADA': 'CONTRACT', 'MUNICIPIO': 'CITY'
    }, inplace=True)

    # Filtros e Conversões
    df = df[df['CONTRACT'].str.strip().str.upper() == FILTRO_CONTRATADA]
    print(f"Registros da {FILTRO_CONTRATADA}: {len(df)}")

    df['DT_OPEN'] = pd.to_datetime(df['DT_OPEN'], errors='coerce')
    df['DT_CLOSE'] = pd.to_datetime(df['DT_CLOSE'], errors='coerce')
    df.dropna(subset=['DT_OPEN'], inplace=True)
    
    df['REGION'] = df['CITY'].apply(get_region)
    df['B2B'] = pd.to_numeric(df['B2B'], errors='coerce').fillna(0)

    # Processamento Mês a Mês
    history = {}
    trends_mensal = [0] * 12
    trends_afetacao = [0] * 12 # Volume simples se não tiver campo afetação
    
    for m in range(1, 13):
        # Datas de corte
        start = datetime.datetime(2025, m, 1)
        if m == 12: end = datetime.datetime(2026, 1, 1) - datetime.timedelta(seconds=1)
        else: end = datetime.datetime(2025, m+1, 1) - datetime.timedelta(seconds=1)
        
        # 1. Gera detalhe do mês
        print(f"Processando Mês {m}/2025...")
        history[str(m)] = get_snapshot_metrics(df, start, end)
        
        # 2. Gera tendência (Volume de aberturas no mês)
        vol = len(df[(df['DT_OPEN'] >= start) & (df['DT_OPEN'] <= end)])
        trends_mensal[m-1] = vol
        trends_afetacao[m-1] = vol # Placeholder

    # Estrutura final para o JS
    final_data = {
        "history": {"2025": history},
        "trends": {"2025": {"mensal": trends_mensal, "afetacao": trends_afetacao}}
    }

    # Salva como arquivo JS variável global
    js_content = f"window.HISTORICO_STATIC = {json.dumps(final_data)};"
    
    with open(ARQUIVO_SAIDA, 'w', encoding='utf-8') as f:
        f.write(js_content)
    
    print(f"\nSUCESSO! Arquivo '{ARQUIVO_SAIDA}' gerado.")
    print("Agora abra o index.html e o ano de 2025 estará disponível.")

if __name__ == "__main__":
    main()