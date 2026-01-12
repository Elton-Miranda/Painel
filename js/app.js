/* js/app.js - Versão Definitiva (Fusão Robusta) */

const API_CONFIG = {
    url: 'https://ed6e25dfd9c38eb3-177-76-129-215.serveousercontent.com/api/dados',
    user: 'user',
    pass: 'visio'
};

const STATE = { charts: {}, globalData: null, currentYear: null };

try { Chart.register(ChartDataLabels); } catch(e){}

document.addEventListener('DOMContentLoaded', () => {
    setupInteraction();
    
    // Verifica se o histórico local foi carregado
    if (typeof window.HISTORICO_STATIC !== 'undefined') {
        console.log("✅ Arquivo historico_2025.js detectado com sucesso.");
    } else {
        console.warn("⚠️ Arquivo historico_2025.js NÃO DETECTADO. Verifique o HTML.");
    }

    fetchApiData();
    setInterval(fetchApiData, 5 * 60 * 1000);
});

async function fetchApiData() {
    const lbl = document.getElementById('lastUpdate');
    lbl.textContent = "Sincronizando...";
    lbl.style.color = "#eab308";

    let apiData = {};

    try {
        // 1. Tenta buscar API
        const headers = new Headers();
        headers.set('Authorization', 'Basic ' + btoa(`${API_CONFIG.user}:${API_CONFIG.pass}`));
        
        const response = await fetch(API_CONFIG.url, { method: 'GET', headers: headers });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        apiData = await response.json();
        console.log("Dados API (2026) recebidos.");
        lbl.textContent = `Ref: ${apiData.ref_date}`;
        lbl.style.color = "#64748b";

    } catch (error) {
        console.error("Erro na API:", error);
        lbl.textContent = "Modo Offline (Histórico)";
        lbl.style.color = "#ef4444";
        // Se a API falhar, cria estrutura vazia para permitir carregar o histórico
        apiData = { years_available: [], history: {}, views: {} };
    }

    // 2. FUSÃO COM HISTÓRICO LOCAL (Se existir)
    if (typeof window.HISTORICO_STATIC !== 'undefined') {
        console.log("Iniciando fusão de dados...");
        const local = window.HISTORICO_STATIC;

        // Mescla Histórico Detalhado
        if (!apiData.history) apiData.history = {};
        if (local.history) {
            Object.keys(local.history).forEach(year => {
                apiData.history[year] = local.history[year];
            });
        }

        // Mescla Tendências
        if (!apiData.trends_by_year) apiData.trends_by_year = {};
        if (local.trends) {
            Object.keys(local.trends).forEach(year => {
                apiData.trends_by_year[year] = local.trends[year];
            });
        }

        // Atualiza Lista de Anos
        if (!apiData.years_available) apiData.years_available = [];
        // Adiciona 2025 se não estiver lá
        if (local.history && local.history["2025"] && !apiData.years_available.includes("2025")) {
            apiData.years_available.unshift("2025");
        }
        apiData.years_available.sort(); 
    }

    // Salva e Renderiza
    STATE.globalData = apiData;
    initDashboard(apiData);
}

function initDashboard(data) {
    const selYear = document.getElementById('yearSelect');
    const currentVal = selYear.value; 
    
    selYear.innerHTML = '';
    
    // Se não tiver anos disponíveis (nem API nem local), erro.
    if (!data.years_available || data.years_available.length === 0) {
        console.warn("Nenhum ano disponível para exibição.");
        return;
    }

    data.years_available.forEach(y => {
        const opt = document.createElement('option');
        opt.value = y; opt.textContent = y;
        selYear.appendChild(opt);
    });
        
    // Lógica de Seleção de Ano
    if (currentVal && data.years_available.includes(currentVal)) {
        selYear.value = currentVal;
    } else {
        // Se tiver 2026, prefere. Senão o último da lista.
        if (data.years_available.includes("2026")) selYear.value = "2026";
        else selYear.value = data.years_available[data.years_available.length - 1];
    }
    STATE.currentYear = selYear.value;

    // Recarrega a visualização atual
    const mSelect = document.getElementById('monthSelect');
    if (mSelect.value !== "0") {
        loadHistoryData(STATE.currentYear, mSelect.value);
    } else {
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

    document.getElementById('yearSelect').addEventListener('change', (e) => {
        STATE.currentYear = e.target.value;
    });

    document.getElementById('refreshBtn').addEventListener('click', fetchApiData);
    
    document.getElementById('exportPngBtn')?.addEventListener('click', async () => {
        try {
            const c = await html2canvas(document.getElementById('dashboard'), {scale:2, useCORS:true});
            const a = document.createElement('a');
            a.href = c.toDataURL('image/png'); a.download = 'painel.png'; a.click();
        } catch(e){}
    });
}

function loadViewData(viewKey) {
    if(!STATE.globalData) return;
    // Se o ano selecionado for 2025, views como "D0" não existem. Avisa o usuário.
    if (STATE.currentYear === "2025" && ['d0','d1','d2','semana'].includes(viewKey)) {
        alert("Visualizações de tempo real (D-0, D-1...) não se aplicam ao histórico de 2025. Selecione um mês no filtro de histórico.");
        return;
    }

    const viewData = STATE.globalData.views ? STATE.globalData.views[viewKey] : null;
    if(viewData) renderDash(viewData);
}

function loadHistoryData(y, m) {
    if(!STATE.globalData) return;
    
    if(STATE.globalData.history && STATE.globalData.history[y] && STATE.globalData.history[y][m]) {
        console.log(`Carregando ${m}/${y}...`);
        renderDash(STATE.globalData.history[y][m]);
    } else {
        alert(`Dados não encontrados para ${m}/${y}. (Verifique se o ano selecionado tem dados)`);
    }
}

function renderDash(d) {
    // 1. BACKLOG
    const bLit = d.backlog_litoral ? d.backlog_litoral.total_backlog : 0;
    renderDonutSingle('chartBackLit', bLit, '#6366f1', 'LITORAL');
    renderOfensoresList('listBackLit', d.oc_por_at_litoral);
    setText('valBackLit', bLit);

    const bSJC = d.backlog_sjc ? d.backlog_sjc.total_backlog : 0;
    renderDonutSingle('chartBackSJC', bSJC, '#6366f1', 'SJC');
    renderOfensoresList('listBackSJC', d.oc_por_at_sjc);
    setText('valBackSJC', bSJC);

    // 2. STATUS
    const sLit = d.status_litoral || {em_andamento:0, nao_iniciada:0, encerrada:0};
    renderDonutMulti('statusLit', [sLit.em_andamento, sLit.nao_iniciada, sLit.encerrada], ['AND','INI','FIM'], ['#3b82f6','#94a3b8','#22c55e']);

    const sSJC = d.status_sjc || {em_andamento:0, nao_iniciada:0, encerrada:0};
    renderDonutMulti('statusSJC', [sSJC.em_andamento, sSJC.nao_iniciada, sSJC.encerrada], ['AND','INI','FIM'], ['#3b82f6','#94a3b8','#22c55e']);

    // 3. SLA
    let slaLit = d.sla ? [d.sla.litoral.in, d.sla.litoral.out] : [0,0];
    let slaSJC = d.sla ? [d.sla.sjc.in, d.sla.sjc.out] : [0,0];
    renderDonutMulti('slaLit', slaLit, ['OK','NOK'], ['#22c55e','#ef4444']);
    renderDonutMulti('slaSJC', slaSJC, ['OK','NOK'], ['#22c55e','#ef4444']);

    // 4. CRÍTICOS
    renderCriticalSummary('tableCritLit', d.backlog_litoral);
    renderCriticalSummary('tableCritSJC', d.backlog_sjc);

    // 5. VIPs
    renderSimpleList('listVipLit', []);
    renderSimpleList('listVipSJC', []);
}

/* HELPERS */
function setText(id, v) { const el = document.getElementById(id); if(el) el.textContent = v; }

function renderOfensoresList(id, items) {
    const el = document.getElementById(id); if(!el) return;
    if(!items || !items.length) { el.innerHTML='<div style="color:#ccc;text-align:center;padding:20px">Sem dados</div>'; return; }
    el.innerHTML = items.slice(0,50).map(i=>`<div class="list-item"><div><b>${i.at}</b></div><div style="font-weight:bold;color:#555">${i.qtd}</div></div>`).join('');
}

function renderCriticalSummary(id, backlog) {
    const el = document.querySelector(`#${id} tbody`); if(!el) return;
    if(!backlog || backlog.total_backlog===0){ el.innerHTML='<tr><td colspan=3 style="text-align:center;color:#ccc">Sem pendências</td></tr>'; return; }
    let h='';
    if(backlog.de_24_72h>0) h+=`<tr><td><strong>24-72h</strong></td><td>${backlog.de_24_72h}</td><td style="color:#f59e0b">Médio</td></tr>`;
    if(backlog.mais_72h>0) h+=`<tr><td><strong>> 72h</strong></td><td>${backlog.mais_72h}</td><td style="color:#ef4444;font-weight:bold">Crítico</td></tr>`;
    if(h==='') h='<tr><td colspan=3 style="text-align:center;color:#22c55e">Tudo < 24h</td></tr>';
    el.innerHTML=h;
}

function renderSimpleList(id, items) { document.getElementById(id).innerHTML='<div style="color:#ccc;text-align:center;padding:20px">Nenhum Caso</div>'; }

function destroy(id) { if(STATE.charts[id]) { STATE.charts[id].destroy(); delete STATE.charts[id]; } }

function renderDonutSingle(id, val, color, txt) {
    destroy(id);
    const ctx = document.getElementById(id); if(!ctx) return;
    STATE.charts[id] = new Chart(ctx, {
        type: 'doughnut',
        data: { labels:[txt], datasets:[{ data:[1], backgroundColor:[color], borderWidth:0 }] },
        options: { cutout:'75%', events:[], plugins:{ legend:{display:false}, datalabels:{display:false}, tooltip:{enabled:false} } },
        plugins: [{
            id: 'center', beforeDraw: (c) => {
                const ctx = c.ctx, w = c.width, h = c.height;
                ctx.restore();
                ctx.font = "bold 1.2em sans-serif";
                ctx.textBaseline = "middle";
                ctx.textAlign = "center";
                ctx.fillStyle = color;
                ctx.fillText(val, w/2, h/2);
                ctx.save();
            }
        }]
    });
}

function renderDonutMulti(id, vals, lbls, colors) {
    destroy(id);
    const ctx = document.getElementById(id); if(!ctx) return;
    const total = vals.reduce((a,b)=>a+b,0);
    if(total===0) { vals=[1]; colors=['#f1f5f9']; lbls=['']; }
    STATE.charts[id] = new Chart(ctx, {
        type: 'doughnut',
        data: { labels:lbls, datasets:[{ data:vals, backgroundColor:colors, borderWidth:0 }] },
        options: { cutout:'60%', maintainAspectRatio:false, plugins:{ legend:{position:'bottom', labels:{boxWidth:10, font:{size:10}}}, datalabels:{color:'#fff', formatter:(v)=>(v>0 && total>0)?v:''} } }
    });
}