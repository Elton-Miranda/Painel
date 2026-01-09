
/* app.js — lógica de renderização e atualização */

const STATE = {
    charts: {}
  };
  
  // Altere este caminho para sua origem real (API/SharePoint/Excel via serviço)
  const DATA_URL = './data.json';
  
  // Atualização automática a cada 5 minutos
  const AUTO_REFRESH_MS = 5 * 60 * 1000;
  
  document.addEventListener('DOMContentLoaded', () => {
    // Botões
    document.getElementById('refreshBtn').addEventListener('click', loadAndRender);
    document.getElementById('exportPngBtn').addEventListener('click', exportPNG);
    document.getElementById('exportPdfBtn').addEventListener('click', exportPDF);
    document.getElementById('sendBtn').addEventListener('click', sendPanel);
  
    // Primeira carga
    loadAndRender();
  
    // Auto-refresh
    setInterval(loadAndRender, AUTO_REFRESH_MS);
  });
  
  async function loadAndRender(){
    try{
      const res = await fetch(DATA_URL, { cache: 'no-store' });
      const data = await res.json();
      renderDashboard(data);
      setLastUpdate();
    }catch(err){
      console.error('Falha ao carregar dados:', err);
      alert('Falha ao carregar dados. Verifique a origem.');
    }
  }
  
  function setLastUpdate(){
    const el = document.getElementById('lastUpdate');
    const now = new Date();
    const fmt = now.toLocaleString('pt-BR', { dateStyle:'short', timeStyle:'short' });
    el.textContent = `Última atualização: ${fmt}`;
  }
  
  function renderDashboard(data){
    // Tendência Mensal (barra)
    renderBar('tendenciaMensal', {
      labels: Array.from({length:data.tendencia_mensal.length}, (_,i)=>`M${i+1}`),
      datasets: [{ label:'Índice', data:data.tendencia_mensal, backgroundColor:'#2563eb' }]
    });
  
    // Tendência Afetação (barra)
    renderBar('tendenciaAfetacao', {
      labels: Array.from({length:data.tendencia_afetacao.length}, (_,i)=>`M${i+1}`),
      datasets: [{ label:'Afetação', data:data.tendencia_afetacao, backgroundColor:'#f59e0b' }]
    });
  
    // Status Litoral (donut)
    renderDoughnut('statusLitoral', {
      labels:['EM ANDAMENTO','NÃO INICIADA','ENCERRADA'],
      datasets:[{
        data:[
          data.status_litoral.em_andamento,
          data.status_litoral.nao_iniciada,
          data.status_litoral.encerrada
        ],
        backgroundColor:['#2563eb','#64748b','#16a34a']
      }]
    });
  
    // Status SJC (donut)
    renderDoughnut('statusSJC', {
      labels:['EM ANDAMENTO','NÃO INICIADA','ENCERRADA'],
      datasets:[{
        data:[
          data.status_sjc.em_andamento,
          data.status_sjc.nao_iniciada,
          data.status_sjc.encerrada
        ],
        backgroundColor:['#2563eb','#64748b','#16a34a']
      }]
    });
  
    // OCs por AT - Litoral (barra horizontal)
    renderHorizontalBar('ocPorAtLitoral', {
      labels:data.oc_por_at_litoral.map(x=>x.at),
      datasets:[{ label:'Quantidade', data:data.oc_por_at_litoral.map(x=>x.qtd), backgroundColor:'#0ea5e9' }]
    });
  
    // OCs por AT - SJC (barra horizontal)
    renderHorizontalBar('ocPorAtSJC', {
      labels:data.oc_por_at_sjc.map(x=>x.at),
      datasets:[{ label:'Quantidade', data:data.oc_por_at_sjc.map(x=>x.qtd), backgroundColor:'#10b981' }]
    });
  
    // KPIs
    setText('oc24hLitoral', data.kpis_litoral.oc_24h);
    setText('ocAbertoLitoral', data.kpis_litoral.aberto);
    setText('encerradoLitoral', data.kpis_litoral.encerrado);
    setText('totalOcLitoral', data.kpis_litoral.total);
  
    setText('oc24hSJC', data.kpis_sjc.oc_24h);
    setText('ocAbertoSJC', data.kpis_sjc.aberto);
    setText('encerradoSJC', data.kpis_sjc.encerrado);
    setText('totalOcSJC', data.kpis_sjc.total);
  
    // Série temporal OCs diarizado (linhas)
    renderLine('ocsDiarizado', {
      labels: data.ocs_diarizado.map(x=>formatDate(x.data)),
      datasets: [
        {
          label: 'ABERTO',
          data: data.ocs_diarizado.map(x=>x.aberto),
          borderColor: '#f59e0b',
          backgroundColor: 'rgba(245,158,11,.15)',
          tension: .3
        },
        {
          label: 'FECHADO',
          data: data.ocs_diarizado.map(x=>x.fechado),
          borderColor: '#14b8a6',
          backgroundColor: 'rgba(20,184,166,.15)',
          tension: .3
        }
      ]
    });
  }
  
  /* Helpers de renderização Chart.js */
  function renderBar(canvasId, cfg){
    destroyIfExists(canvasId);
    const ctx = document.getElementById(canvasId);
    STATE.charts[canvasId] = new Chart(ctx, {
      type:'bar',
      data:cfg,
      options:{
        responsive:true,
        plugins:{ legend:{ display:false } },
        scales:{ y:{ beginAtZero:true } }
      }
    });
  }
  function renderHorizontalBar(canvasId, cfg){
    destroyIfExists(canvasId);
    const ctx = document.getElementById(canvasId);
    STATE.charts[canvasId] = new Chart(ctx, {
      type:'bar',
      data:cfg,
      options:{
        indexAxis:'y',
        responsive:true,
        plugins:{ legend:{ display:false } },
        scales:{ x:{ beginAtZero:true } }
      }
    });
  }
  function renderDoughnut(canvasId, cfg){
    destroyIfExists(canvasId);
    const ctx = document.getElementById(canvasId);
    STATE.charts[canvasId] = new Chart(ctx, {
      type:'doughnut',
      data:cfg,
      options:{
        responsive:true,
        plugins:{
          legend:{ position:'bottom' }
        },
        cutout:'60%'
      }
    });
  }
  function renderLine(canvasId, cfg){
    destroyIfExists(canvasId);
    const ctx = document.getElementById(canvasId);
    STATE.charts[canvasId] = new Chart(ctx, {
      type:'line',
      data:cfg,
      options:{
        responsive:true,
        plugins:{ legend:{ position:'bottom' } }
      }
    });
  }
  function destroyIfExists(id){
    const chart = STATE.charts[id];
    if(chart){ chart.destroy(); }
  }
  function setText(id, value){
    const el = document.getElementById(id);
    el.textContent = value ?? '—';
  }
  function formatDate(iso){
    const d = new Date(iso);
    return d.toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit' });
  }
  
  /* Exportações */
  async function exportPNG(){
    const dash = document.getElementById('dashboard');
    const canvas = await html2canvas(dash, { scale:2 });
    const dataURL = canvas.toDataURL('image/png');
    downloadDataURL(dataURL, `war-room-${dateSlug()}.png`);
  }
  async function exportPDF(){
    const dash = document.getElementById('dashboard');
    const canvas = await html2canvas(dash, { scale:2 });
    const dataURL = canvas.toDataURL('image/png');
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation:'landscape', unit:'pt', format:'a4' });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    // Ajusta imagem à página
    const imgProps = pdf.getImageProperties(dataURL);
    const ratio = Math.min(pageW/imgProps.width, pageH/imgProps.height);
    const w = imgProps.width * ratio;
    const h = imgProps.height * ratio;
    const x = (pageW - w)/2;
    const y = (pageH - h)/2;
    pdf.addImage(dataURL, 'PNG', x, y, w, h);
    pdf.save(`war-room-${dateSlug()}.pdf`);
  }
  function downloadDataURL(dataURL, filename){
    const a = document.createElement('a');
    a.href = dataURL;
    a.download = filename;
    a.click();
  }
  function dateSlug(){
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth()+1).padStart(2,'0');
    const dd = String(d.getDate()).padStart(2,'0');
    return `${yyyy}${mm}${dd}`;
  }
  
  /* Envio automático (via webhook do Power Automate) */
  async function sendPanel(){
    try{
      // 1) captura imagem do dashboard
      const dash = document.getElementById('dashboard');
      const canvas = await html2canvas(dash, { scale:2 });
      const pngBase64 = canvas.toDataURL('image/png'); // data:image/png;base64,...
  
      // 2) configura a chamada ao fluxo Power Automate com trigger HTTP
      // SUBSTITUA pela URL do seu fluxo (RequestBin/Power Automate)
      const flowUrl = 'https://prod-XX.azurewebsites.net/api/.../seuFluxo'; // exemplo
  
      // payload: imagem + metadados + lista de e-mails
      const payload = {
        title: 'WAR ROOM',
        date: new Date().toISOString(),
        imageBase64: pngBase64,
        recipients: [
          "pessoa1@empresa.com",
          "pessoa2@empresa.com"
        ]
      };
  
      const res = await fetch(flowUrl, {
        method:'POST',
        headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify(payload)
      });
  
      if(!res.ok){
        throw new Error(`Falha no envio: ${res.status}`);
      }
      alert('Painel enviado com sucesso!');
    }catch(err){
      console.error(err);
      alert('Não foi possível enviar o painel. Verifique a URL do fluxo e a rede.');
    }
  }
  