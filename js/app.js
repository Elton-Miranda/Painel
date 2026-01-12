/* js/app.js - API Integration */

const API_CONFIG = {
    url: 'https://ed6e25dfd9c38eb3-177-76-129-215.serveousercontent.com/api/dados',
    user: 'user',
    pass: 'visio'
};

const STATE = {
    charts: {},
    globalData: null,
    currentYear: null
};

// Registra plugins
try { Chart.register(ChartDataLabels); } catch(e){}

document.addEventListener('DOMContentLoaded', () => {
    // 1. Configura botões
    setupInteraction();
    
    // 2. Busca dados iniciais
    fetchApiData();
    
    // 3. Auto-update 5 min
    setInterval(fetchApiData, 5 * 60 * 1000);
});

// --- API ---
async function fetchApiData() {
    const lbl = document.getElementById('lastUpdate');
    lbl.textContent = "Sincronizando...";
    lbl.style.color = "#eab308"; // Amarelo

    try {
        const headers = new Headers();
        headers.set('Authorization', 'Basic ' + btoa(`${API_CONFIG.user}:${API_CONFIG.pass}`));
        
        const response = await fetch(API_CONFIG.url, { method: 'GET', headers: headers });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const data = await response.json();
        console.log("Dados API Recebidos:", data);

        STATE.globalData = data;
        lbl.textContent = `Ref: ${data.ref_date}`;
        lbl.style.color = "#64748b"; // Cinza

        initDashboard(data);

    } catch (error) {
        console.error("Erro API:", error);
        lbl.textContent = "Erro Conexão";
        lbl.style.color = "#ef4444"; // Vermelho
    }
}

function initDashboard(data) {
    // Popula Anos
    const selYear = document.getElementById('yearSelect');
    if(selYear.options.length <= 1 && data.years_available) {
        selYear.innerHTML = '';
        data.years_available.forEach(y => {
            const opt = document.createElement('option');
            opt.value = y; opt.textContent = y;
            selYear.appendChild(opt);
        });
        // Seleciona o último ano
        STATE.currentYear = data.years_available[data.years_available.length-1];
        selYear.value = STATE.currentYear;
    }

    // Carrega View
    const mSelect = document.getElementById('monthSelect');
    const activeBtn = document.querySelector('.filter-btn.active');
    
    if(mSelect.value !== "0") {
        loadHistoryData(selYear.value, mSelect.value);
    } else {
        const view = activeBtn ? activeBtn.getAttribute('data-view') : 'd0';
        loadViewData(view);
    }
}

// --- INTERAÇÃO ---
function setupInteraction() {
    // Filtros Rápidos
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            document.getElementById('monthSelect').value = "0";
            loadViewData(e.target.getAttribute('data-view'));
        });
    });

    // Botão Histórico
    document.getElementById('btnHistory').addEventListener('click', () => {
        const y = document.getElementById('yearSelect').value;
        const m = document.getElementById('monthSelect').value;
        if(m === "0") return alert("Selecione um mês.");
        
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        loadHistoryData(y, m);
    });

    document.getElementById('refreshBtn').addEventListener('click', fetchApiData);
}

// --- CARREGAMENTO ---
function loadViewData(viewKey) {
    if(!STATE.globalData) return;
    const viewData = STATE.globalData.views[viewKey];
    if(viewData) renderDash(viewData);
    else console.warn(`View ${viewKey} vazia`);
}

function loadHistoryData(y, m) {
    if(!STATE.globalData) return;
    if(STATE.globalData.history[y] && STATE.globalData.history[y][m]) {
        renderDash(STATE.globalData.history[y][m]);
    } else {
        alert("Sem dados para este período.");
    }
}

// --- RENDERIZAÇÃO ---
function renderDash(d) {
    // 1. BACKLOG (Rosca + Lista de Ofensores)
    // A API não retorna lista de IDs, retorna 'oc_por_at'. Vamos usar isso na lista.
    
    // Litoral
    const backLit = d.backlog_litoral.total_backlog;
    renderDonutSingle('chartBackLit', backLit, '#6366f1', 'LITORAL');
    renderOfensoresList('listBackLit', d.oc_por_at_litoral);
    setText('valBackLit', backLit);

    // SJC
    const backSJC = d.backlog_sjc.total_backlog;
    renderDonutSingle('chartBackSJC', backSJC, '#6366f1', 'SJC');
    renderOfensoresList('listBackSJC', d.oc_por_at_sjc);
    setText('valBackSJC', backSJC);

    // 2. STATUS
    renderDonutMulti('statusLit', 
        [d.status_litoral.em_andamento, d.status_litoral.nao_iniciada, d.status_litoral.encerrada], 
        ['AND','INI','FIM'], 
        ['#3b82f6','#94a3b8','#22c55e']
    );
    renderDonutMulti('statusSJC', 
        [d.status_sjc.em_andamento, d.status_sjc.nao_iniciada, d.status_sjc.encerrada], 
        ['AND','INI','FIM'], 
        ['#3b82f6','#94a3b8','#22c55e']
    );

    // 3. CRÍTICOS (Tabela baseada nos contadores > 24h)
    // Como a API não manda lista de IDs criticos, mostramos o resumo do Aging
    renderCriticalSummary('tableCritLit', d.backlog_litoral);
    renderCriticalSummary('tableCritSJC', d.backlog_sjc);

    // 4. SLA (A API não tem campo SLA explicito no JSON que você colou, vou deixar cinza se zerado)
    // Vou simular SLA In/Out com base nos dados disponíveis ou deixar vazio se a API não enviar
    // Se a API não mandar 'sla_in', renderiza placeholder
    renderDonutMulti('slaLit', [0, 0], ['DENTRO','FORA'], ['#22c55e','#ef4444']);
    renderDonutMulti('slaSJC', [0, 0], ['DENTRO','FORA'], ['#22c55e','#ef4444']);

    // 5. VIPs (A API não mandou lista VIP no JSON de exemplo)
    // Renderiza vazio
    renderSimpleList('listVipLit', []);
    renderSimpleList('listVipSJC', []);
}

/* --- HELPERS VISUAIS --- */

function setText(id, v) { 
    const el = document.getElementById(id); 
    if(el) el.textContent = v; 
}

// Renderiza a lista de Backlog usando os dados de "OC por AT" da API
function renderOfensoresList(id, items) {
    const el = document.getElementById(id);
    if(!el) return;
    
    if(!items || items.length === 0) {
        el.innerHTML = '<div style="color:#ccc;text-align:center;padding:20px;">Sem dados</div>';
        return;
    }

    // Mostra Top 5 ATs com mais casos
    el.innerHTML = items.slice(0, 50).map(i => `
        <div class="list-item">
            <div><b>${i.at}</b></div>
            <div style="font-weight:bold; color:#555;">${i.qtd}</div>
        </div>
    `).join('');
}

// Renderiza Tabela de Críticos usando o resumo da API
function renderCriticalSummary(id, backlogData) {
    const el = document.querySelector(`#${id} tbody`);
    if(!el) return;

    if(backlogData.total_backlog === 0) {
        el.innerHTML = '<tr><td colspan="3" style="text-align:center;color:#ccc">Sem pendências</td></tr>';
        return;
    }

    let html = '';
    if(backlogData.de_24_72h > 0) {
        html += `<tr><td><strong>24h a 72h</strong></td><td>${backlogData.de_24_72h}</td><td style="color:#f59e0b">Médio</td></tr>`;
    }
    if(backlogData.mais_72h > 0) {
        html += `<tr><td><strong>Maior que 72h</strong></td><td>${backlogData.mais_72h}</td><td style="color:#ef4444;font-weight:bold">Crítico</td></tr>`;
    }
    if(html === '') {
        html = '<tr><td colspan="3" style="text-align:center;color:#22c55e">Tudo < 24h</td></tr>';
    }
    el.innerHTML = html;
}

function renderSimpleList(id, items) {
    const el = document.getElementById(id);
    if(!el) return;
    el.innerHTML = '<div style="color:#ccc;text-align:center;padding:20px;">Nenhum VIP</div>';
}

/* --- GRÁFICOS --- */

function destroy(id) { 
    if(STATE.charts[id]) { STATE.charts[id].destroy(); delete STATE.charts[id]; } 
}

function renderDonutSingle(id, val, color, txt) {
    destroy(id);
    STATE.charts[id] = new Chart(document.getElementById(id), {
        type: 'doughnut',
        data: { labels:[txt], datasets:[{ data:[1], backgroundColor:[color], borderWidth:0 }] },
        options: { 
            cutout:'75%', events:[], 
            plugins:{ legend:{display:false}, datalabels:{display:false}, tooltip:{enabled:false} } 
        },
        plugins: [{
            id: 'center', beforeDraw: (chart) => {
                const { ctx, width, height } = chart;
                ctx.restore();
                ctx.font = "bold 1.2em sans-serif";
                ctx.textBaseline = "middle";
                ctx.textAlign = "center";
                ctx.fillStyle = color;
                ctx.fillText(val, width/2, height/2);
                ctx.save();
            }
        }]
    });
}

function renderDonutMulti(id, vals, lbls, colors) {
    destroy(id);
    const total = vals.reduce((a,b)=>a+b,0);
    if(total===0) { vals=[1]; colors=['#f1f5f9']; lbls=['']; }

    STATE.charts[id] = new Chart(document.getElementById(id), {
        type: 'doughnut',
        data: { labels:lbls, datasets:[{ data:vals, backgroundColor:colors, borderWidth:0 }] },
        options: { 
            cutout: '60%', 
            plugins: { 
                legend: { position:'bottom', labels:{boxWidth:10, font:{size:10}} },
                datalabels: { color:'#fff', formatter: (v) => (v>0 && total>0) ? v : '' }
            } 
        }
    });
}