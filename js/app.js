/* js/app.js - Sem Gráfico de Donut no Backlog */

const API_CONFIG = {
    url: 'https://ed6e25dfd9c38eb3-177-76-129-215.serveousercontent.com/api/dados',
    user: 'user',
    pass: 'visio'
};

const THEME = {
    primary: '#660099',
    primaryLight: '#a855f7',
    gray: '#cbd5e1',
    green: '#10b981',
    red: '#ef4444'
};

const STATE = { charts: {}, globalData: null, currentYear: null };

try { Chart.register(ChartDataLabels); } catch(e){}

document.addEventListener('DOMContentLoaded', () => {
    setupInteraction();
    if(typeof window.HISTORICO_STATIC !== 'undefined') console.log("Histórico local OK.");
    fetchApiData();
    setInterval(fetchApiData, 5 * 60 * 1000);
});

async function fetchApiData() {
    const lbl = document.getElementById('lastUpdate');
    lbl.textContent = "Sincronizando...";
    lbl.style.color = "#eab308";

    let apiData = { years_available: [], history: {}, views: {} };

    try {
        const headers = new Headers();
        headers.set('Authorization', 'Basic ' + btoa(`${API_CONFIG.user}:${API_CONFIG.pass}`));
        const response = await fetch(API_CONFIG.url, { method: 'GET', headers: headers });
        if (response.ok) {
            apiData = await response.json();
            lbl.textContent = `Ref: ${apiData.ref_date}`;
            lbl.style.color = "#660099";
        } else { throw new Error(response.status); }
    } catch (error) {
        console.error("Erro API:", error);
        lbl.textContent = "Modo Offline";
        lbl.style.color = "#ef4444";
    }

    if (typeof window.HISTORICO_STATIC !== 'undefined') {
        const local = window.HISTORICO_STATIC;
        if (!apiData.history) apiData.history = {};
        if (local.history) Object.assign(apiData.history, local.history);
        if (!apiData.years_available) apiData.years_available = [];
        if (local.history["2025"] && !apiData.years_available.includes("2025")) {
            apiData.years_available.unshift("2025");
        }
        apiData.years_available.sort();
    }

    STATE.globalData = apiData;
    initDashboard(apiData);
}

function initDashboard(data) {
    const selYear = document.getElementById('yearSelect');
    const currentVal = selYear.value;
    selYear.innerHTML = '';
    
    if (data.years_available) {
        data.years_available.forEach(y => selYear.add(new Option(y, y)));
        if (currentVal && data.years_available.includes(currentVal)) selYear.value = currentVal;
        else selYear.value = data.years_available[data.years_available.length - 1];
        STATE.currentYear = selYear.value;
    }

    const mSelect = document.getElementById('monthSelect');
    if (mSelect.value !== "0") loadHistoryData(STATE.currentYear, mSelect.value);
    else {
        const btn = document.querySelector('.filter-btn.active');
        const view = btn ? btn.getAttribute('data-view') : 'd0';
        loadViewData(view);
    }
}

function setupInteraction() {
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            document.getElementById('monthSelect').value = "0";
            loadViewData(e.target.getAttribute('data-view'));
        });
    });

    document.getElementById('btnHistory').addEventListener('click', () => {
        const y = document.getElementById('yearSelect').value;
        const m = document.getElementById('monthSelect').value;
        if(m === "0") return alert("Selecione um mês.");
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        STATE.currentYear = y;
        loadHistoryData(y, m);
    });

    document.getElementById('yearSelect').addEventListener('change', (e) => STATE.currentYear = e.target.value);
    document.getElementById('refreshBtn').addEventListener('click', fetchApiData);
    
    document.getElementById('exportPngBtn')?.addEventListener('click', async () => {
        const btn = document.getElementById('exportPngBtn');
        const originalText = btn.innerText;
        btn.innerText = "⏳ ...";
        try {
            const opts = { scale: 2, useCORS: true, backgroundColor: '#f1f5f9' };
            const time = new Date().toLocaleTimeString().replace(/:/g,'-');

            const c1 = await html2canvas(document.getElementById('print-section-charts'), opts);
            const a1 = document.createElement('a'); a1.href = c1.toDataURL('image/png'); a1.download = `Graficos_${time}.png`; a1.click();
            
            await new Promise(r => setTimeout(r, 800));

            const c2 = await html2canvas(document.getElementById('print-section-details'), opts);
            const a2 = document.createElement('a'); a2.href = c2.toDataURL('image/png'); a2.download = `Detalhes_${time}.png`; a2.click();
        } catch(e) { console.error(e); } 
        finally { btn.innerText = originalText; }
    });
}

function loadViewData(viewKey) {
    if(!STATE.globalData) return;
    if(STATE.currentYear === "2025" && ['d0','d1','d2','semana'].includes(viewKey)) return alert("2025: Use o histórico mensal.");
    const viewData = STATE.globalData.views ? STATE.globalData.views[viewKey] : null;
    if(viewData) renderDash(viewData);
}

function loadHistoryData(y, m) {
    if(!STATE.globalData) return;
    if(STATE.globalData.history[y] && STATE.globalData.history[y][m]) renderDash(STATE.globalData.history[y][m]);
    else alert("Sem dados.");
}

function renderDash(d) {
    // --- BACKLOG (ALTERADO PARA NÚMERO GRANDE) ---
    const bLit = d.backlog_litoral ? d.backlog_litoral.total_backlog : 0;
    setText('valBackLitLarge', bLit); // Usa a nova DIV grande
    renderOfensoresList('listBackLit', d.oc_por_at_litoral);
    // setText('valBackLit', bLit); // Removido o pequeno do header

    const bSJC = d.backlog_sjc ? d.backlog_sjc.total_backlog : 0;
    setText('valBackSJCLarge', bSJC); // Usa a nova DIV grande
    renderOfensoresList('listBackSJC', d.oc_por_at_sjc);
    // setText('valBackSJC', bSJC); // Removido o pequeno do header

    // Status
    const stLit = d.status_litoral || {em_andamento:0, nao_iniciada:0, encerrada:0};
    renderDonutMulti('statusLit', 
        [stLit.em_andamento, stLit.nao_iniciada, stLit.encerrada], 
        ['EXEC', 'Prox', 'Encerrado'], 
        [THEME.primaryLight, THEME.gray, THEME.primary]
    );
    
    const stSJC = d.status_sjc || {em_andamento:0, nao_iniciada:0, encerrada:0};
    renderDonutMulti('statusSJC', 
        [stSJC.em_andamento, stSJC.nao_iniciada, stSJC.encerrada], 
        ['EXEC', 'Prox', 'Encerrado'], 
        [THEME.primaryLight, THEME.gray, THEME.primary]
    );

    // SLA
    let slaLit = d.sla ? [d.sla.litoral.in, d.sla.litoral.out] : [0,0];
    let slaSJC = d.sla ? [d.sla.sjc.in, d.sla.sjc.out] : [0,0];
    renderDonutMulti('slaLit', slaLit, ['OK','NOK'], [THEME.green, THEME.red]);
    renderDonutMulti('slaSJC', slaSJC, ['OK','NOK'], [THEME.green, THEME.red]);

    // Críticos & VIPs
    renderCriticalTableDetail('tableCritLit', d.criticos_lista_litoral || []);
    renderCriticalTableDetail('tableCritSJC', d.criticos_lista_sjc || []);
    renderSimpleList('listVipLit', d.vips_litoral || []);
    renderSimpleList('listVipSJC', d.vips_sjc || []);

    // Evolução
    renderTimelineSLA('chartTimelineSLA', d.ocs_diarizado || []);
}

function renderTimelineSLA(canvasId, items) {
    destroy(canvasId);
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;

    let chartLabels = [], dataOk = [], dataNok = [];
    if (items && items.length > 0) {
        items.sort((a, b) => new Date(a.data) - new Date(b.data));
        chartLabels = items.map(i => { const p = i.data.split('-'); return p.length===3 ? `${p[2]}/${p[1]}` : i.data; });
        dataOk = items.map(i => i.sla_ok ?? 0);
        dataNok = items.map(i => i.sla_nok ?? 0);
    } else { chartLabels = ['-']; dataOk = [0]; dataNok = [0]; }

    STATE.charts[canvasId] = new Chart(ctx, {
        type: 'line',
        data: {
            labels: chartLabels,
            datasets: [
                { 
                    label: 'Total Entrantes (Dia)', 
                    data: dataOk, 
                    borderColor: THEME.green, 
                    backgroundColor: 'rgba(16, 185, 129, 0.1)', 
                    tension: 0.3, fill: true, pointRadius: 4 
                },
                { 
                    label: 'Fechados Fora do Prazo', 
                    data: dataNok, 
                    borderColor: THEME.red, 
                    backgroundColor: 'rgba(239, 68, 68, 0.1)', 
                    tension: 0.3, fill: true, pointRadius: 4 
                }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { 
                legend: { position: 'top' },
                datalabels: { 
                    display: true, align: 'top', anchor: 'end', offset: 4,
                    color: function(context) { return context.dataset.borderColor; },
                    font: { weight: 'bold', size: 11 },
                    formatter: (v) => v > 0 ? v : ''
                }
            },
            layout: { padding: { top: 20 } },
            scales: { y: { beginAtZero: true, grid: { borderDash: [5,5] } }, x: { grid: { display: false } } }
        }
    });
}

/* HELPERS */
function setText(id, v) { const el = document.getElementById(id); if(el) el.textContent = v; }
function renderOfensoresList(id, items) {
    const el = document.getElementById(id); if(!el) return;
    if(!items || !items.length) { el.innerHTML='<div style="color:#ccc;text-align:center;padding:20px">Sem dados</div>'; return; }
    el.innerHTML = items.slice(0,50).map(i=>`<div class="list-item"><div><b>${i.at}</b></div><div style="font-weight:bold;color:#660099">${i.qtd}</div></div>`).join('');
}
function renderCriticalTableDetail(id, items) {
    const tbody = document.querySelector(`#${id} tbody`);
    if (!tbody) return;
    const validItems = items.filter(i => !i.dt_close);
    if (!validItems || validItems.length === 0) { tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:#ccc;padding:10px;">Sem pendências críticas</td></tr>'; return; }
    tbody.innerHTML = validItems.map(item => {
        let tempoTexto = item.aging_str || (item.dt_open ? calculateDuration(item.dt_open) : '-');
        let icon = item.hunter ? '<span title="Hunter">🎯</span>' : (item.vip ? '<span title="VIP">💎</span>' : '-');
        return `<tr><td style="font-weight:bold">${item.id||'N/D'}</td><td style="color:#ef4444;font-weight:bold">${tempoTexto}</td><td style="font-size:0.8em">${item.afetacao||'Normal'}</td><td class="col-icon">${icon}</td></tr>`;
    }).join('');
}
function calculateDuration(dtOpenStr) { try { const start = new Date(dtOpenStr); const diffMs = new Date() - start; const totalMinutes = Math.floor(diffMs / 60000); const hours = Math.floor(totalMinutes / 60); const minutes = totalMinutes % 60; return `${hours}h ${minutes}m`; } catch(e) { return "-"; } }
function renderSimpleList(id, items) { const el = document.getElementById(id); if (!items || !items.length) { el.innerHTML='<div style="color:#ccc;text-align:center;padding:20px">Nenhum Caso</div>'; return; } el.innerHTML = items.map(i => `<div class="list-item"><div><b>${i.id}</b></div><div>${i.vip?'💎':'🎯'}</div></div>`).join(''); }
function destroy(id) { if(STATE.charts[id]) { STATE.charts[id].destroy(); delete STATE.charts[id]; } }

// FUNÇÃO renderDonutSingle REMOVIDA POIS NÃO É MAIS USADA

function renderDonutMulti(id, vals, lbls, colors) {
    destroy(id);
    const total = vals.reduce((a,b)=>a+b,0);
    if(total===0) { vals=[1]; colors=['#f1f5f9']; lbls=['']; }
    STATE.charts[id] = new Chart(document.getElementById(id), {
        type: 'doughnut', data: { labels:lbls, datasets:[{ data:vals, backgroundColor:colors, borderWidth:0 }] },
        options: { cutout:'60%', maintainAspectRatio:false, plugins:{ legend:{position:'bottom', labels:{boxWidth:10, font:{size:10}}}, datalabels:{color:'#fff', formatter:(v)=>(v>0 && total>0)?v:''} } }
    });
}