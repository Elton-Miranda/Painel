import pandas as pd
import json
import datetime
import os
import glob
import numpy as np

# --- CONFIGURAÇÕES ---
ARQUIVO_SAIDA = 'dados.js'
FILTRO_CONTRATADA = 'ABILITY_SJ'

# Mapeamento Geográfico
SJC_CITIES = ['SAO JOSE DOS CAMPOS', 'JACAREI', 'TAUBATE', 'CACAPAVA', 'PINDAMONHANGABA', 'GUARATINGUETA', 'APARECIDA', 'CAMPOS DO JORDAO', 'TREMEMBE', 'CRUZEIRO', 'LORENA', 'POTIM', 'ROSEIRA']
LITORAL_CITIES = ['SAO SEBASTIAO', 'ILHABELA', 'CARAGUATATUBA', 'UBATUBA', 'SANTOS', 'SAO VICENTE', 'GUARUJA', 'PRAIA GRANDE', 'MONGAGUA', 'ITANHAEM', 'PERUIBE', 'BERTIOGA', 'CUBATAO']

def load_data():
    dfs = []
    
    # Procura arquivos CSV e XLSX na pasta
    files = glob.glob('*.csv') + glob.glob('*.xlsx') + glob.glob('*.txt')
    
    print(f"Arquivos encontrados: {files}")
    
    for f in files:
        if f == ARQUIVO_SAIDA: continue
        try:
            print(f"Lendo: {f}...")
            # Detecta extensão para usar o leitor correto
            if f.lower().endswith('.xlsx'):
                df_temp = pd.read_excel(f, engine='openpyxl')
            elif f.lower().endswith('.csv'):
                # Tenta encoding latin1 para CSVs brasileiros
                df_temp = pd.read_csv(f, encoding='latin1', on_bad_lines='skip')
            else:
                # Tenta ler TXT com separador pipe
                df_temp = pd.read_csv(f, sep='|', encoding='latin1', on_bad_lines='skip', low_memory=False)

            # Normalização de Nomes de Coluna
            # Mapeia nomes possíveis para o padrão interno
            rename_map = {
                'ocorrencia': 'ID', 'ID_OCORRENCIA': 'ID',
                'abertura': 'DT_OPEN', 'DATA_OCORRENCIA': 'DT_OPEN',
                'encerramento': 'DT_CLOSE', 'DATA_OCORRENCIA_FINAL': 'DT_CLOSE', 'data_fim': 'DT_CLOSE',
                'status': 'STATUS', 'STATUS': 'STATUS',
                'municipio': 'CITY', 'MUNICIPIO': 'CITY',
                'contrato': 'CONTRACT', 'CONTRATADA': 'CONTRACT',
                'at': 'AT', 'AT': 'AT',
                'b2b_avancado': 'B2B', 'B2B_AVANCADO': 'B2B',
                'vip': 'VIP', 'CLIENTE_VIP': 'VIP',
                'cond_alto_valor': 'HUNTER', 'HUNTER': 'HUNTER',
                'propensos_anatel': 'INFLUENCER', 'INFLUENCIADOR': 'INFLUENCER'
            }
            df_temp.rename(columns=rename_map, inplace=True)
            
            # Valida se tem colunas mínimas
            if 'ID' in df_temp.columns and 'DT_OPEN' in df_temp.columns:
                # Garante colunas opcionais
                for col in ['B2B', 'VIP', 'HUNTER', 'INFLUENCER', 'DT_CLOSE']:
                    if col not in df_temp.columns: df_temp[col] = np.nan
                
                # Seleciona apenas colunas padrão para evitar erro de concatenação
                cols = ['ID', 'DT_OPEN', 'DT_CLOSE', 'STATUS', 'CITY', 'CONTRACT', 'AT', 'B2B', 'VIP', 'HUNTER', 'INFLUENCER']
                # Adiciona apenas as que existem
                cols_final = [c for c in cols if c in df_temp.columns]
                
                dfs.append(df_temp[cols_final])
                print(f"  -> {len(df_temp)} registros importados.")
            else:
                print("  -> Ignorado (Colunas obrigatórias ausentes).")
                
        except Exception as e:
            print(f"  [ERRO] Falha ao ler {f}: {e}")

    if not dfs: return pd.DataFrame()
    
    print("Consolidando bases...")
    df = pd.concat(dfs, ignore_index=True)
    
    # Limpeza e Tipagem
    df.drop_duplicates(subset='ID', keep='first', inplace=True)
    
    # Datas (Tenta vários formatos)
    df['DT_OPEN'] = pd.to_datetime(df['DT_OPEN'], dayfirst=True, errors='coerce')
    df['DT_CLOSE'] = pd.to_datetime(df['DT_CLOSE'], dayfirst=True, errors='coerce')
    
    # Remove sem data
    df.dropna(subset=['DT_OPEN'], inplace=True)
    
    # Strings
    df['CONTRACT'] = df['CONTRACT'].astype(str).str.strip().str.upper()
    df['STATUS'] = df['STATUS'].astype(str).str.strip().str.upper()
    df['CITY'] = df['CITY'].astype(str).str.strip().str.upper()
    
    # Região
    def get_region(city):
        if city in SJC_CITIES: return 'SJC'
        if city in LITORAL_CITIES: return 'LITORAL'
        return 'OUTROS'
    df['REGION'] = df['CITY'].apply(get_region)
    
    # Flag Aberto
    fechados = ['ENCERRADA', 'FECHADO', 'FINALIZADO', 'CANCELADO', 'IMPROCEDIDO', 'EXECUTADO', 'CONCLUIDO']
    df['IS_OPEN_NOW'] = df['STATUS'].apply(lambda x: 0 if any(s in x for s in fechados) else 1)
    
    # Numéricos
    for c in ['B2B', 'VIP', 'HUNTER']:
        df[c] = pd.to_numeric(df[c], errors='coerce').fillna(0)
        
    return df

def calc_aging_str(hours):
    if pd.isna(hours) or hours < 0: return "-"
    d, h = int(hours // 24), int(hours % 24)
    return f"{d}d {h}h" if d > 0 else f"{h}h"

def get_snapshot_metrics(df, start_date, end_date):
    """Gera o retrato fiel do período."""
    data = {}
    snapshot_point = end_date # Momento "Fim do Dia" para cálculo de status
    
    # 1. BACKLOG (Legado) - O que vinha de antes e ainda estava lá
    # Criados ANTES do início E (Fechados DEPOIS do início OU Abertos)
    mask_back = (df['DT_OPEN'] < start_date) & ((df['DT_CLOSE'] >= start_date) | (df['DT_CLOSE'].isna()))
    df_back = df[mask_back].copy()
    df_back['AGING'] = (snapshot_point - df_back['DT_OPEN']).dt.total_seconds() / 3600
    
    backlog = {"sjc": {"count":0, "cases":[]}, "litoral": {"count":0, "cases":[]}}
    for reg in ['SJC', 'LITORAL']:
        sub = df_back[df_back['REGION'] == reg].sort_values('AGING', ascending=False)
        backlog[reg.lower()]['count'] = len(sub)
        for _, r in sub.head(50).iterrows():
            backlog[reg.lower()]['cases'].append({
                "id": r['ID'], "at": str(r['AT']), "aging": calc_aging_str(r['AGING'])
            })
    data['backlog'] = backlog

    # 2. STATUS (Produção do Período)
    # Criados DENTRO do período
    mask_new = (df['DT_OPEN'] >= start_date) & (df['DT_OPEN'] <= end_date)
    df_new = df[mask_new].copy()
    
    # Fechado DENTRO do período?
    df_new['CLOSED_IN_PERIOD'] = df_new['DT_CLOSE'].apply(lambda x: 1 if pd.notna(x) and x <= end_date else 0)
    
    status = {"sjc": {}, "litoral": {}}
    for reg in ['SJC', 'LITORAL']:
        sub = df_new[df_new['REGION'] == reg]
        status[reg.lower()] = {
            "aberto": len(sub[sub['CLOSED_IN_PERIOD'] == 0]),
            "fechado": len(sub[sub['CLOSED_IN_PERIOD'] == 1])
        }
    data['status'] = status

    # 3. CRÍTICOS > 24H (Situação no Fim do Período)
    # Todo mundo que estava aberto em `end_date` com idade > 24h
    mask_active = (df['DT_OPEN'] <= end_date) & ((df['DT_CLOSE'] > end_date) | (df['DT_CLOSE'].isna()))
    df_active = df[mask_active].copy()
    df_active['AGING'] = (snapshot_point - df_active['DT_OPEN']).dt.total_seconds() / 3600
    
    criticos = {"sjc": [], "litoral": []}
    sub_crit = df_active[df_active['AGING'] > 24].sort_values('AGING', ascending=False)
    for reg in ['SJC', 'LITORAL']:
        rows = sub_crit[sub_crit['REGION'] == reg].head(50)
        for _, r in rows.iterrows():
            criticos[reg.lower()].append({
                "id": r['ID'], "at": str(r['AT']), "aging": calc_aging_str(r['AGING'])
            })
    data['criticos'] = criticos

    # 4. SLA FECHAMENTO (Quem fechou no período)
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

    # 5. VIPs (Ativos no momento)
    mask_vip = (df_active['VIP'] > 0) | (df_active['HUNTER'] > 0) | (df_active['INFLUENCER'].notna() & (df_active['INFLUENCER'] != 0))
    df_vip = df_active[mask_vip].copy()
    vips = {"sjc": [], "litoral": []}
    for reg in ['SJC', 'LITORAL']:
        sub = df_vip[df_vip['REGION'] == reg].sort_values('AGING', ascending=False)
        for _, r in sub.iterrows():
            tag = "HUNTER" if r['HUNTER']>0 else "VIP"
            vips[reg.lower()].append({
                "id": r['ID'], "at": str(r['AT']), "tag": tag, "aging": calc_aging_str(r['AGING'])
            })
    data['vips'] = vips

    return data

def main():
    print("--- GERANDO DADOS (MULTI-FORMATO) ---")
    df = load_data()
    
    if df.empty:
        print("ERRO: Nenhum dado carregado.")
        return

    # Filtro Contratada
    df = df[df['CONTRACT'] == FILTRO_CONTRATADA]
    print(f"Registros após filtro ({FILTRO_CONTRATADA}): {len(df)}")
    
    if len(df) == 0:
        print("AVISO: Nenhum registro encontrado para este contrato. Verifique o nome 'ABILITY_SJ' no arquivo.")
        return

    # Data de Referência (Hoje)
    ref_now = df['DT_OPEN'].max()
    # Se não tiver data de fechamento mais recente, usa a de abertura.
    if 'DT_CLOSE' in df.columns:
        last_close = df['DT_CLOSE'].max()
        if pd.notna(last_close) and last_close > ref_now:
            ref_now = last_close
            
    if pd.isna(ref_now): ref_now = datetime.datetime.now()
    
    print(f"Data Referência: {ref_now}")

    # --- VIEWS TEMPORAIS ---
    views = {}
    today_start = ref_now.replace(hour=0, minute=0, second=0, microsecond=0)
    
    # D-0
    views['d0'] = get_snapshot_metrics(df, today_start, ref_now)
    # D-1
    d1_start = today_start - datetime.timedelta(days=1)
    d1_end = today_start - datetime.timedelta(seconds=1)
    views['d1'] = get_snapshot_metrics(df, d1_start, d1_end)
    # D-2
    d2_start = today_start - datetime.timedelta(days=2)
    d2_end = d1_start - datetime.timedelta(seconds=1)
    views['d2'] = get_snapshot_metrics(df, d2_start, d2_end)
    # Semana
    week_start = today_start - datetime.timedelta(days=6)
    views['semana'] = get_snapshot_metrics(df, week_start, ref_now)
    # Quinzena
    quinz_start = today_start - datetime.timedelta(days=14)
    views['quinzena'] = get_snapshot_metrics(df, quinz_start, ref_now)

    # Histórico
    history = {}
    years = sorted(df['DT_OPEN'].dt.year.unique())
    for y in years:
        history[str(y)] = {}
        for m in range(1,13):
            try:
                m_start = datetime.datetime(y, m, 1)
                # Fim do mes
                if m == 12: m_end = datetime.datetime(y+1, 1, 1) - datetime.timedelta(seconds=1)
                else: m_end = datetime.datetime(y, m+1, 1) - datetime.timedelta(seconds=1)
                
                if m_start <= ref_now:
                    end = m_end if m_end < ref_now else ref_now
                    history[str(y)][str(m)] = get_snapshot_metrics(df, m_start, end)
            except: pass

    # Tendencias (Total Mensal)
    trends = {}
    for y in years:
        df_y = df[df['DT_OPEN'].dt.year == y]
        idx = df_y.groupby(df_y['DT_OPEN'].dt.month).size()
        trends[str(y)] = [int(idx.get(m,0)) for m in range(1,13)]

    payload = {
        "ref_date": ref_now.strftime('%d/%m/%Y %H:%M'),
        "years": [str(y) for y in years],
        "trends": trends,
        "views": views,
        "history": history
    }

    with open(ARQUIVO_SAIDA, 'w', encoding='utf-8') as f:
        f.write(f"window.DADOS_PAINEL = {json.dumps(payload, indent=2)};")
    print("SUCESSO!")

if __name__ == "__main__":
    main()