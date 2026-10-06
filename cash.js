const SUPABASE_URL = 'https://tjohhybyvfqqjummuedk.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_B6wSHIVowVjWL_086rafEA_g7-STvzI';
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null;
let currentSession = null;

async function init() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session) { currentUser = session.user; showApp(); } else { showLogin(); }
    setupLoginEvents();
}

function showLogin() {
    document.getElementById('login-overlay').style.display = 'flex';
    document.getElementById('main-app').style.display = 'none';
}

function showApp() {
    document.getElementById('login-overlay').style.display = 'none';
    document.getElementById('main-app').style.display = 'block';
    document.getElementById('user-name').textContent = currentUser.email;
    loadCashStatus();
}

function setupLoginEvents() {
    document.getElementById('login-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;
        const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
        if (error) { document.getElementById('login-error').textContent = 'Credenciales incorrectas'; }
        else { currentUser = data.user; showApp(); }
    });

    document.getElementById('btn-logout').addEventListener('click', async () => {
        await supabaseClient.auth.signOut();
        currentUser = null;
        showLogin();
    });

    document.getElementById('btn-back').addEventListener('click', () => {
        window.location.href = '/';
    });
}

async function loadCashStatus() {
    const { data: session, error } = await supabaseClient
        .from('cash_sessions')
        .select('*')
        .is('closed_at', null)
        .single();

    if (error || !session) {
        currentSession = null;
        document.getElementById('cash-status').innerHTML = '<span class="status-closed">🔴 Caja Cerrada</span>';
        renderActionButtons('closed');
    } else {
        currentSession = session;
        document.getElementById('cash-status').innerHTML = `
            <span class="status-open">🟢 Caja Abierta</span><br>
            <small>Abierta: ${new Date(session.opened_at).toLocaleString('es-ES')}</small><br>
            <small>Fondo: $${session.fondo.toLocaleString()}</small>
        `;
        renderActionButtons('open');
    }
}

function renderActionButtons(status) {
    const container = document.getElementById('action-buttons');
    if (status === 'closed') {
        container.innerHTML = '<button class="action-btn btn-open" onclick="openModal(\'modal-open\')"> Abrir Caja</button>';
    } else {
        container.innerHTML = `
            <button class="action-btn btn-movement" onclick="openModal('modal-movement')">💵 Movimiento</button>
            <button class="action-btn btn-count" onclick="openModal('modal-count')"> Arqueo Ciego</button>
            <button class="action-btn btn-report" onclick="generateReport()">📊 Reporte X</button>
            <button class="action-btn btn-close" onclick="closeCashSession()">🔒 Cerrar Caja (Z)</button>
        `;
    }
}

function openModal(id) { document.getElementById(id).classList.add('active'); }
function closeModal(id) { document.getElementById(id).classList.remove('active'); }

// APERTURA
document.getElementById('btn-confirm-open').addEventListener('click', async () => {
    const fund = parseFloat(document.getElementById('opening-fund').value) || 0;
    const { error } = await supabaseClient.from('cash_sessions').insert([{ fondo: fund, user_email: currentUser.email }]);
    if (error) { alert('Error: ' + error.message); }
    else { closeModal('modal-open'); loadCashStatus(); }
});

// MOVIMIENTO
document.getElementById('btn-confirm-movement').addEventListener('click', async () => {
    const type = document.getElementById('movement-type').value;
    const method = document.getElementById('movement-method').value;
    const amount = parseFloat(document.getElementById('movement-amount').value) || 0;
    const note = document.getElementById('movement-note').value;

    if (!currentSession) return alert('Caja no abierta');

    const { error } = await supabaseClient.from('cash_movements').insert([{
        session_id: currentSession.id,
        tipo: type,
        metodo: method,
        importe: amount,
        nota: note
    }]);

    if (error) { alert('Error: ' + error.message); }
    else {
        closeModal('modal-movement');
        document.getElementById('movement-amount').value = '';
        document.getElementById('movement-note').value = '';
        loadCashStatus();
    }
});

// ARQUEO CIEGO
document.querySelectorAll('.bill-count').forEach(input => {
    input.addEventListener('input', calculateCountedTotal);
});

function calculateCountedTotal() {
    let total = 0;
    document.querySelectorAll('.bill-count').forEach(input => {
        const value = parseInt(input.dataset.value);
        const count = parseInt(input.value) || 0;
        total += value * count;
    });
    document.getElementById('counted-total').textContent = '$' + total.toLocaleString();
}

document.getElementById('btn-confirm-count').addEventListener('click', async () => {
    if (!currentSession) return alert('Caja no abierta');

    let counted = 0;
    document.querySelectorAll('.bill-count').forEach(input => {
        const value = parseInt(input.dataset.value);
        const count = parseInt(input.value) || 0;
        counted += value * count;
    });

    // Calcular esperado
    const { data: movements } = await supabaseClient
        .from('cash_movements')
        .select('*')
        .eq('session_id', currentSession.id)
        .eq('metodo', 'efectivo');

    let entradas = 0, salidas = 0;
    movements.forEach(m => {
        if (m.tipo === 'entrada') entradas += m.importe;
        if (m.tipo === 'salida') salidas += m.importe;
    });

    const { data: orders } = await supabaseClient
        .from('orders')
        .select('total, pay_method')
        .eq('source', 'tpv')
        .gte('created_at', currentSession.opened_at)
        .eq('paid', true);

    let ventasEfectivo = 0;
    orders.forEach(o => {
        if (o.pay_method === 'efectivo') ventasEfectivo += o.total;
    });

    const esperado = currentSession.fondo + ventasEfectivo + entradas - salidas;
    const diferencia = counted - esperado;

    const { error } = await supabaseClient.from('cash_arqueos').insert([{
        session_id: currentSession.id,
        fondo: currentSession.fondo,
        esperado: esperado,
        contado: counted,
        dif: diferencia,
        v_efectivo: ventasEfectivo,
        entradas: entradas,
        salidas: salidas,
        kind: 'X'
    }]);

    if (error) { alert('Error: ' + error.message); }
    else {
        closeModal('modal-count');
        alert(`Arqueo registrado\nEsperado: $${esperado.toLocaleString()}\nContado: $${counted.toLocaleString()}\nDiferencia: $${diferencia.toLocaleString()}`);
        generateReport();
    }
});

// REPORTE X
async function generateReport() {
    if (!currentSession) return alert('Caja no abierta');

    const { data: movements } = await supabaseClient.from('cash_movements').select('*').eq('session_id', currentSession.id);
    const { data: orders } = await supabaseClient.from('orders').select('*').gte('created_at', currentSession.opened_at).eq('paid', true);

    let efectivo = 0, tarjeta = 0, bizum = 0;
    orders.forEach(o => {
        if (o.pay_method === 'efectivo') efectivo += o.total;
        if (o.pay_method === 'tarjeta') tarjeta += o.total;
        if (o.pay_method === 'bizum') bizum += o.total;
    });

    let entradas = 0, salidas = 0;
    movements.forEach(m => {
        if (m.tipo === 'entrada') entradas += m.importe;
        if (m.tipo === 'salida') salidas += m.importe;
    });

    const total = efectivo + tarjeta + bizum;

    document.getElementById('report-content').innerHTML = `
        <div class="report-row"><span>Fondo inicial:</span><span>$${currentSession.fondo.toLocaleString()}</span></div>
        <div class="report-row"><span>Ventas efectivo:</span><span>$${efectivo.toLocaleString()}</span></div>
        <div class="report-row"><span>Ventas tarjeta:</span><span>$${tarjeta.toLocaleString()}</span></div>
        <div class="report-row"><span>Ventas bizum:</span><span>$${bizum.toLocaleString()}</span></div>
        <div class="report-row"><span>Entradas:</span><span>$${entradas.toLocaleString()}</span></div>
        <div class="report-row"><span>Salidas:</span><span>$${salidas.toLocaleString()}</span></div>
        <div class="report-row total"><span>TOTAL:</span><span>$${total.toLocaleString()}</span></div>
    `;

    document.getElementById('report-section').style.display = 'block';
}

document.getElementById('btn-print-report').addEventListener('click', () => {
    window.print();
});

// CIERRE Z
async function closeCashSession() {
    if (!currentSession) return alert('Caja no abierta');
    if (!confirm('¿Seguro que quieres cerrar la caja?')) return;

    const { error } = await supabaseClient
        .from('cash_sessions')
        .update({ closed_at: new Date().toISOString() })
        .eq('id', currentSession.id);

    if (error) { alert('Error: ' + error.message); }
    else { loadCashStatus(); }
}

init();