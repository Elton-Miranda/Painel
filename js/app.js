/* js/app.js — Versão API Online */

// --- CONFIGURAÇÃO DA API ---
const API_CONFIG = {
    url: 'https://e4aac7f6ef07b7d3-177-76-129-215.serveousercontent.com/api/dados',
    user: 'user',
    pass: 'visio'
};

const STATE = { charts: {}, currentYear: null, globalData: null };
const AUTO_REFRESH_MS = 2 * 60 * 1000; // Atualiza a cada 2 min

try { Chart.register(ChartDataLabels); } catch (e) {}

document.addEventListener('DOMContentLoaded', () => {
    // Ao abrir, tenta conectar na API
    fetchData(); 
    // Configura atualização periódica
    setInterval(fetchData, AUTO_REFRESH_MS);
});

// --- FUNÇÃO DE CONEXÃO ---
async function fetchData() {
    const lbl = document.getElementById('lastUpdate');
    lbl.textContent = "Sincronizando API...";
    lbl.style.color = "#eab308"; // Amarelo (carregando)

    try {
        // Autenticação Basic
        const headers = new Headers();
        headers.set('Authorization', 'Basic ' + btoa(API_CONFIG.user + ':' + API_CONFIG.pass));
        headers.set('Content-Type', 'application/json');

        const response = await fetch(API_CONFIG.url, { method: 'GET', headers: headers });

        if (!response.ok) {
            throw new Error(`Erro HTTP: ${response.status}`);
        }

        const data = await response.json();
        console.log("Dados atualizados:", data);
        
        // Sucesso
        STATE.globalData = data;
        lbl.style.color = "#64748b"; // Cor normal
        initDashboard(data);

    } catch (error) {
        console.error("Falha na API:", error);
        lbl.textContent = "⚠️ Erro de Conexão";
        lbl.style.color = "#ef4444"; // Vermelho
        
        // Se houver dados antigos em cache/memória, não quebra a tela
        if(!STATE.globalData) {
            alert("Não foi possível conectar à API.\nVerifique sua conexão ou VPN.");
        }
    }
}

// --- INICIALIZAÇÃO DA UI ---
function initDashboard(data) {
    setupInteraction();

    // 1. Popula Anos
    const selYear = document.getElementById('yearSelect');
    // Salva seleção atual para não resetar no refresh automatico
    const oldVal = selYear.value; 
    selYear.innerHTML = '';
    
    if (data.years_available && data.years_available.length > 0) {
        data.years_available.forEach(y => {
            const opt = document.createElement('option');
            opt.value = y; opt.textContent = y;
            selYear.appendChild(opt);
        });
        // Mantém seleção ou pega mais recente
        if (oldVal && data.years_available.includes(oldVal)) {
            STATE.currentYear = oldVal;
        } else {
            STATE.currentYear = data.years_available[data.years_available.length - 1];
        }
        selYear.value = STATE.currentYear;
    }

    // 2. Determina qual View carregar
    // Se o usuário estiver no modo Histórico (Mês != 0), recarrega histórico
    const mSelect = document.getElementById('monthSelect');
    const activeBtn = document.querySelector('.filter-btn.active');
    
    if (mSelect.value !== "0") {
        // Modo Histórico
        loadHistoryData(STATE.currentYear, mSelect.value);
    } else {
        // Modo Rápido (D0, D1...)
        const viewKey = activeBtn ? activeBtn.getAttribute('data-view') : 'd0';
        loadViewData(viewKey);
    }
    
    // Atualiza tendências globais
    renderTrends(data, STATE.currentYear);
}

function setupInteraction() {
    if (STATE.initialized) return; // Evita duplicar listeners
    STATE.initialized = true;

    // Filtros Rápidos
    const btns = document.querySelectorAll('.filter-btn');
    btns.forEach(b => {
        b.addEventListener('click', (e) => {
            btns.forEach(btn => btn.classList.remove('active'));
            e.target.classList.add('active');
            document.getElementById('monthSelect').value = "0"; // Sai do histórico
            loadViewData(e.target.getAttribute('data-view'));
        });
    });

    // Histórico
    document.getElementById('btnHistory').addEventListener('click', () => {
        btns.forEach(b => b.classList.remove('active'));
        const y = document.getElementById('yearSelect').value;
        const m = document.getElementById('monthSelect').value;
        if (m === "0") return alert("Selecione um mês.");
        
        loadHistoryData(y, m);
        STATE.currentYear = y;
        renderTrends(STATE.globalData, y);
    });

    // Mudança de Ano
    document.getElementById('yearSelect').addEventListener('change', (e) => {
        STATE.currentYear = e.target.value;
        renderTrends(STATE.globalData, STATE.currentYear);
    });

    // Refresh Manual
    document.getElementById('refreshBtn').addEventListener('click', fetchData);
    document.getElementById('exportPngBtn')?.addEventListener('click', exportPNG);
}

// --- CARREGAMENTO DE VISTAS ---

function loadViewData(viewKey) {
    const data = STATE.globalData;
    if (!data || !data.views[viewKey]) return;
    
    updateLabel(`Visão: ${viewKey.toUpperCase()} | Ref: ${data.ref_date}`);
    renderDash(data.views[viewKey]);
}

function loadHistoryData(y, m) {
    const data = STATE.globalData;
    if (data.history[y] && data.history[y][m]) {
        updateLabel(`Histórico: ${m}/${y}`);
        renderDash(data.history[y][m]);
    } else {
        alert("Sem dados históricos.");
    }
}

function updateLabel(txt) {
    const el = document.getElementById('lastUpdate');
    // Mantém a cor original se não for erro
    if (el.style.color !== 'rgb(239, 68, 68)') el.textContent = txt;
}

// --- RENDERIZADORES ---

function renderTrends(allData, year) {
    const yd = allData.trends_by_year[year];
    if (!yd) return;
    
    const months = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
    
    renderLine('tendenciaMensal', months, yd.mensal, '#2563eb', 'Volume');
    setText('valTendenciaMensal', yd.mensal.reduce((a,b)=>a+b,0));

    renderLine('tendenciaAfetacao', months, yd.afetacao, '#f59e0b', 'Afetação');
    setText('valTendenciaAfetacao', yd.afetacao.reduce((a,b)=>a+b,0));
}

function renderDash(d) {
    // Backlog
    renderDonutSingle('chartBackLit', d.backlog.litoral.count, '#6366f1', 'Litoral');
    renderList('listBackLit', d.backlog.litoral.cases);
    setText('valBackLit', d.backlog.litoral.count);

    renderDonutSingle('chartBackSJC', d.backlog.sjc.count, '#6366f1', 'SJC');
    renderList('listBackSJC', d.backlog.sjc.cases);
    setText('valBackSJC', d.backlog.sjc.count);

    // Status
    renderDonutMulti('statusLit', [d.status.litoral.aberto, d.status.litoral.fechado], ['AB','FE'], ['#3b82f6','#cbd5e1']);
    renderDonutMulti('statusSJC', [d.status.sjc.aberto, d.status.sjc.fechado], ['AB','FE'], ['#3b82f6','#cbd5e1']);

    // SLA
    renderDonutMulti('slaLit', [d.sla.litoral.in, d.sla.litoral.out], ['OK','NOK'], ['#22c55e','#ef4444']);
    renderDonutMulti('slaSJC', [d.sla.sjc.in, d.sla.sjc.out], ['OK','NOK'], ['#22c55e','#ef4444']);

    // Tabelas
    renderTable('tableCritLit', d.criticos.litoral);
    renderTable('tableCritSJC', d.criticos.sjc);

    // VIPs
    renderVipList('listVipLit', d.vips.litoral);
    renderVipList('listVipSJC', d.vips.sjc);
}

// --- HELPERS ---

function setText(id, v) { document.getElementById(id).textContent = v; }

function renderList(id, items) {
    const el = document.getElementById(id);
    el.innerHTML = items.length ? items.map(i => `
        <div class="list-item">
            <div><b>${i.id}</b> <small>(${i.at})</small></div>
            <div style="font-size:0.85em;color:#555;">${i.aging}</div>
        </div>`).join('') : '<div style="color:#ccc;text-align:center;padding:10px;">Vazio</div>';
}

function renderVipList(id, items) {
    const el = document.getElementById(id);
    el.innerHTML = items.length ? items.map(i => {
        let c='#7c3aed', bg='#f3e8ff'; 
        if(i.tag==='HUNTER'){c='#b45309'; bg='#fef3c7';}
        return `<div class="list-item">
            <div><span class="brand-tag" style="background:${bg};color:${c}">${i.tag}</span> <b>${i.id}</b></div>
            <div style="font-size:0.85em;">${i.aging}</div>
        </div>`;
    }).join('') : '<div style="color:#ccc;text-align:center;padding:10px;">Vazio</div>';
}

function renderTable(id, items) {
    const el = document.querySelector(`#${id} tbody`);
    el.innerHTML = items.length ? items.slice(0,50).map(i => `
        <tr><td>${i.id}</td><td>${i.at}</td><td style="color:#dc2626;font-weight:bold">${i.aging}</td></tr>
    `).join('') : '<tr><td colspan=3 align=center style="color:#ccc">Ok</td></tr>';
}

// --- CHARTS ---

function destroy(id) { if(STATE.charts[id]) { STATE.charts[id].destroy(); delete STATE.charts[id]; } }

function renderLine(id, lbls, data, color, label) {
    destroy(id);
    const ctx = document.getElementById(id); if(!ctx) return;
    STATE.charts[id] = new Chart(ctx, {
        type: 'line',
        data: { labels: lbls, datasets: [{ label:label, data:data, borderColor:color, backgroundColor:color+'20', fill:true, tension:0.4 }] },
        options: { plugins: { legend: {display:false}, datalabels: {display:false} }, scales: {x:{display:false}, y:{beginAtZero:true}} }
    });
}

function renderDonutMulti(id, vals, lbls, colors) {
    destroy(id);
    const ctx = document.getElementById(id); if(!ctx) return;
    const total = vals.reduce((a,b)=>a+b,0);
    // Placeholder se vazio
    if(total===0) { vals=[1]; colors=['#f1f5f9']; lbls=['']; }
    
    STATE.charts[id] = new Chart(ctx, {
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

function renderSingleDonut(id, val, color, txt) {
    destroy(id);
    const ctx = document.getElementById(id); if(!ctx) return;
    STATE.charts[id] = new Chart(ctx, {
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

async function exportPNG(){
    const el = document.getElementById('dashboard');
    const c = await html2canvas(el, {scale:2, useCORS:true});
    const a = document.createElement('a'); a.href = c.toDataURL('image/png'); a.download = 'painel.png'; a.click();
}