/* js/app.js */
const STATE = { charts: {}, currentYear: null };

document.addEventListener('DOMContentLoaded', () => {
    if(window.DADOS_PAINEL) init(window.DADOS_PAINEL);
    else alert("Dados ausentes.");
});

function init(data){
    setupButtons(data);
    const selYear = document.getElementById('yearSelect');
    if(data.years_available && data.years_available.length > 0){
        data.years_available.forEach(y => {
            const opt = document.createElement('option');
            opt.value = y; opt.textContent = y;
            selYear.appendChild(opt);
        });
        STATE.currentYear = data.years_available[data.years_available.length - 1];
        selYear.value = STATE.currentYear;
    }
    loadViewData('d0');
}

function setupButtons(data){
    const quickBtns = document.querySelectorAll('.filter-btn');
    quickBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            quickBtns.forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            document.getElementById('monthSelect').value = "0";
            loadViewData(e.target.getAttribute('data-view'));
        });
    });

    document.getElementById('btnLoadHistory').addEventListener('click', () => {
        quickBtns.forEach(b => b.classList.remove('active'));
        const y = document.getElementById('yearSelect').value;
        const m = document.getElementById('monthSelect').value;
        
        if(m === "0") {
            loadViewData('mes_atual');
            alert("Exibindo mês atual. Selecione um mês para histórico.");
        } else {
            loadHistoryData(y, m);
        }
        STATE.currentYear = y;
        renderGlobalTrends(data, y);
    });

    document.getElementById('yearSelect').addEventListener('change', (e) => {
        STATE.currentYear = e.target.value;
        renderGlobalTrends(data, STATE.currentYear);
    });
    
    document.getElementById('refreshBtn').addEventListener('click', () => window.location.reload());
    document.getElementById('exportPngBtn')?.addEventListener('click', exportPNG);
}

function loadViewData(view){
    const data = window.DADOS_PAINEL;
    if(!data.views[view]) return;
    updateLabel(`Visão: ${view.toUpperCase()} | Ref: ${data.ref_date}`);
    renderDash(data.views[view]);
    renderGlobalTrends(data, STATE.currentYear);
}

function loadHistoryData(y, m){
    const data = window.DADOS_PAINEL;
    if(data.history[y] && data.history[y][m]){
        updateLabel(`Histórico: ${m}/${y}`);
        renderDash(data.history[y][m]);
    } else alert("Sem dados.");
}

function renderGlobalTrends(allData, year){
    const yd = allData.trends_by_year[year];
    if(!yd) return;
    const months = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
    
    renderChart('tendenciaMensal', 'line', { labels:months, datasets:[{ data:yd.mensal, borderColor:'#2563eb', backgroundColor:'rgba(37,99,235,0.1)', fill:true, tension:0.4 }] });
    setText('valTendenciaMensal', yd.mensal.reduce((a,b)=>a+b,0));
    
    renderChart('tendenciaAfetacao', 'line', { labels:months, datasets:[{ data:yd.afetacao, borderColor:'#f59e0b', backgroundColor:'rgba(245,158,11,0.1)', fill:true, tension:0.4 }] });
    setText('valTendenciaAfetacao', yd.afetacao.reduce((a,b)=>a+b,0));
}

function renderDash(d){
    const donutC = ['#2563eb','#64748b','#16a34a'];
    const agC = ['#22c55e', '#f59e0b', '#ef4444'];
    
    renderChart('statusLitoral', 'doughnut', { labels:['AND','N/INI','FIM'], datasets:[{ data:[d.status_litoral.em_andamento, d.status_litoral.nao_iniciada, d.status_litoral.encerrada], backgroundColor:donutC }] });
    setText('valStatusLitoral', d.status_litoral.em_andamento + d.status_litoral.nao_iniciada + d.status_litoral.encerrada);
    
    renderChart('statusSJC', 'doughnut', { labels:['AND','N/INI','FIM'], datasets:[{ data:[d.status_sjc.em_andamento, d.status_sjc.nao_iniciada, d.status_sjc.encerrada], backgroundColor:donutC }] });
    setText('valStatusSJC', d.status_sjc.em_andamento + d.status_sjc.nao_iniciada + d.status_sjc.encerrada);

    setText('valBacklogD1Lit', d.backlog_d1_specific?.litoral || 0);
    setText('valBacklogD1SJC', d.backlog_d1_specific?.sjc || 0);

    renderChart('chartBacklogLit', 'doughnut', { labels:['<24h','24-72h','>72h'], datasets:[{ data:[d.backlog_litoral.ate_24h, d.backlog_litoral.de_24_72h, d.backlog_litoral.mais_72h], backgroundColor:agC }] });
    renderChart('chartBacklogSJC', 'doughnut', { labels:['<24h','24-72h','>72h'], datasets:[{ data:[d.backlog_sjc.ate_24h, d.backlog_sjc.de_24_72h, d.backlog_sjc.mais_72h], backgroundColor:agC }] });

    renderChart('chartFluxo', 'bar', { labels:['Vol'], datasets:[{ label:'Entrada', data:[d.fluxo.entrada], backgroundColor:'#6366f1'}, { label:'Saída', data:[d.fluxo.saida], backgroundColor:'#10b981'}] });
    const ef = d.fluxo.entrada>0 ? Math.round((d.fluxo.saida/d.fluxo.entrada)*100) : (d.fluxo.saida>0?100:0);
    setText('valEficiencia', `${ef}%`);

    renderChart('ocPorAtSJC', 'bar', { labels:d.oc_por_at_sjc.map(x=>x.at), datasets:[{ data:d.oc_por_at_sjc.map(x=>x.qtd), backgroundColor:'#10b981', borderRadius:4 }], indexAxis:'y' });

    setText('encerradoLitoral', d.kpis_litoral.encerrado); setText('totalOcLitoral', d.kpis_litoral.total);
    setText('oc24hLitoral', d.kpis_litoral.oc_24h); setText('ocAbertoLitoral', d.kpis_litoral.aberto);
    setText('encerradoSJC', d.kpis_sjc.encerrado); setText('totalOcSJC', d.kpis_sjc.total);
    setText('oc24hSJC', d.kpis_sjc.oc_24h); setText('ocAbertoSJC', d.kpis_sjc.aberto);

    renderChart('ocsDiarizado', 'line', { labels:d.ocs_diarizado.map(x=>x.data.slice(5).split('-').reverse().join('/')), datasets:[{ label:'ABERTO', data:d.ocs_diarizado.map(x=>x.aberto), borderColor:'#f59e0b', backgroundColor:'rgba(245,158,11,0.1)', fill:true }, { label:'FECHADO', data:d.ocs_diarizado.map(x=>x.fechado), borderColor:'#14b8a6', backgroundColor:'rgba(20,184,166,0.1)', fill:true }] });
}

function renderChart(id, type, cfg){
    if(STATE.charts[id]) { STATE.charts[id].destroy(); delete STATE.charts[id]; }
    const ctx = document.getElementById(id); if(!ctx) return;
    const opts = { responsive:true, maintainAspectRatio:false, plugins:{ legend:{ display:(type==='bar'&&cfg.datasets.length>1)||id==='ocsDiarizado', position:'bottom' } }, scales:{ y:{ beginAtZero:true } } };
    if(type==='doughnut'){ opts.scales={}; opts.cutout='65%'; opts.plugins.legend.display=false; }
    if(cfg.indexAxis==='y'){ opts.indexAxis='y'; opts.scales.y.grid={display:false}; opts.plugins.legend.display=false; }
    STATE.charts[id] = new Chart(ctx, { type:type, data:cfg, options:opts });
}
function setText(id, v){ const el=document.getElementById(id); if(el) el.textContent=v!==undefined?v:'-'; }
function updateLabel(t){ document.getElementById('lastUpdate').textContent=t; }
async function exportPNG(){ const el=document.getElementById('dashboard'); const c=await html2canvas(el,{scale:2,useCORS:true}); const a=document.createElement('a'); a.href=c.toDataURL(); a.download='painel.png'; a.click(); }