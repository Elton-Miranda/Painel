import schedule
import time
import requests
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime

# --- CONFIGURAÇÕES ---

# 1. Configurações da API
API_URL = 'https://ed6e25dfd9c38eb3-177-76-129-215.serveousercontent.com/api/dados'
API_USER = 'user'
API_PASS = 'visio'

# 2. Configurações de E-mail (Exemplo com Outlook/Office365 ou Gmail)
# Se for Gmail, precisa gerar uma "Senha de App". Se for corporativo, use os dados de TI.
SMTP_SERVER = 'smtp.office365.com' # Ex: smtp.gmail.com
SMTP_PORT = 587
EMAIL_REMETENTE = 'seu_email@empresa.com.br'
EMAIL_SENHA = 'sua_senha_ou_app_password'

# 3. Lista de Destinatários
DESTINATARIOS = [
    'gestor@empresa.com.br',
    'equipe@empresa.com.br'
]

# --- FUNÇÕES ---

def obter_dados_api():
    """Conecta na API e retorna o JSON."""
    try:
        print(f"[{datetime.now()}] Consultando API...")
        response = requests.get(API_URL, auth=(API_USER, API_PASS), timeout=10)
        if response.status_code == 200:
            return response.json()
        else:
            print(f"Erro API: {response.status_code}")
            return None
    except Exception as e:
        print(f"Erro na conexão: {e}")
        return None

def gerar_html_corpo(dados):
    """Cria o HTML do e-mail com a identidade visual #660099."""
    
    # Tratamento de erro caso dados venham vazios
    ref_date = dados.get('ref_date', datetime.now().strftime('%d/%m/%Y %H:%M'))
    
    # Extraindo dados (com proteção contra null)
    backlog_lit = dados.get('backlog_litoral', {}).get('total_backlog', 0)
    backlog_sjc = dados.get('backlog_sjc', {}).get('total_backlog', 0)
    
    criticos_lit = dados.get('criticos_lista_litoral', [])
    criticos_sjc = dados.get('criticos_lista_sjc', [])

    # Função auxiliar para gerar linhas da tabela
    def gerar_linhas_tabela(lista):
        if not lista:
            return '<tr><td colspan="3" style="padding:10px;text-align:center;color:#999;">Sem casos críticos</td></tr>'
        html = ""
        for item in lista:
            icon = "💎" if item.get('vip') else ("🎯" if item.get('hunter') else "")
            html += f"""
            <tr style="border-bottom:1px solid #eee;">
                <td style="padding:8px;">{item.get('id')}</td>
                <td style="padding:8px;color:#ef4444;font-weight:bold;">{item.get('aging_str', '-')}</td>
                <td style="padding:8px;text-align:center;">{icon}</td>
            </tr>
            """
        return html

    # HTML DO E-MAIL
    html = f"""
    <html>
    <body style="font-family: Arial, sans-serif; background-color: #f4f4f9; padding: 20px; margin: 0;">
        <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 5px rgba(0,0,0,0.1);">
            
            <div style="background-color: #660099; padding: 20px; text-align: center; color: white;">
                <h2 style="margin:0;">WAR ROOM - ABILITY_SJ</h2>
                <p style="margin:5px 0 0 0; font-size: 12px; opacity: 0.8;">Atualização: {ref_date}</p>
            </div>

            <div style="padding: 20px; display: flex; justify-content: space-between;">
                <div style="width: 48%; background: #f3e8ff; padding: 15px; border-radius: 8px; text-align: center;">
                    <h3 style="margin:0; color: #660099; font-size: 14px;">BACKLOG LITORAL</h3>
                    <p style="margin:10px 0 0 0; font-size: 24px; font-weight: bold; color: #333;">{backlog_lit}</p>
                </div>
                <div style="width: 48%; background: #f3e8ff; padding: 15px; border-radius: 8px; text-align: center;">
                    <h3 style="margin:0; color: #660099; font-size: 14px;">BACKLOG SJC</h3>
                    <p style="margin:10px 0 0 0; font-size: 24px; font-weight: bold; color: #333;">{backlog_sjc}</p>
                </div>
            </div>

            <div style="padding: 0 20px 20px 20px;">
                <h3 style="color: #be123c; border-bottom: 2px solid #be123c; padding-bottom: 5px;">🚨 Críticos > 24h (Litoral)</h3>
                <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
                    <tr style="background-color: #f9fafb; text-align: left;">
                        <th style="padding:8px;">Ocorrência</th>
                        <th style="padding:8px;">Tempo</th>
                        <th style="padding:8px;">VIP</th>
                    </tr>
                    {gerar_linhas_tabela(criticos_lit)}
                </table>

                <h3 style="color: #be123c; border-bottom: 2px solid #be123c; padding-bottom: 5px; margin-top: 20px;">🚨 Críticos > 24h (SJC)</h3>
                <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
                    <tr style="background-color: #f9fafb; text-align: left;">
                        <th style="padding:8px;">Ocorrência</th>
                        <th style="padding:8px;">Tempo</th>
                        <th style="padding:8px;">VIP</th>
                    </tr>
                    {gerar_linhas_tabela(criticos_sjc)}
                </table>
            </div>

            <div style="background-color: #eee; padding: 10px; text-align: center; font-size: 10px; color: #666;">
                E-mail automático. Não responda.
            </div>
        </div>
    </body>
    </html>
    """
    return html

def enviar_relatorio():
    """Função principal executada pelo agendador."""
    print(f"--- Iniciando rotina: {datetime.now()} ---")
    
    # 1. Pegar Dados
    dados = obter_dados_api()
    
    # Se a API falhar, não envia e-mail quebrado (ou envia aviso, opcional)
    if not dados:
        print("Abortando envio: Falha na obtenção de dados.")
        return

    # 2. Gerar HTML
    corpo_email = gerar_html_corpo(dados)

    # 3. Enviar E-mail
    msg = MIMEMultipart()
    msg['From'] = EMAIL_REMETENTE
    msg['To'] = ", ".join(DESTINATARIOS)
    msg['Subject'] = f"📊 War Room Ability - Status {datetime.now().strftime('%H:%M')}"
    msg.attach(MIMEText(corpo_email, 'html'))

    try:
        server = smtplib.SMTP(SMTP_SERVER, SMTP_PORT)
        server.starttls()
        server.login(EMAIL_REMETENTE, EMAIL_SENHA)
        server.sendmail(EMAIL_REMETENTE, DESTINATARIOS, msg.as_string())
        server.quit()
        print("✅ E-mail enviado com sucesso!")
    except Exception as e:
        print(f"❌ Erro ao enviar e-mail: {e}")

# --- AGENDAMENTO ---

# Horários solicitados
horarios = ["07:30", "11:30", "15:30", "17:30"]

print(f"🤖 Robô de Relatórios Iniciado.")
print(f"📅 Agendado para: {', '.join(horarios)} (Todos os dias)")

for h in horarios:
    schedule.every().day.at(h).do(enviar_relatorio)

# Loop infinito para manter o script rodando
while True:
    schedule.run_pending()
    time.sleep(30) # Verifica a cada 30 segundos