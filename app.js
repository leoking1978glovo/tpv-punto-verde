const SUPABASE_URL = 'https://tjohhybyvfqqjummuedk.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_B6wSHIVowVjWL_086rafEA_g7-STvzI';
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null;
let cart = [];
let products = [];
let currentCategory = 'all';
let orderType = 'mostrador';
let payMethod = 'efectivo';
let currentSession = null;
let kitchenOrders = [];

// ============ INICIO ============
async function init() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session) { currentUser = session.user; showApp(); } else { showLogin(); }
    setupLoginEvents();
    setupNavigation();
}

function showLogin() {
    document.getElementById('login-overlay').style.display = 'flex';
    document.getElementById('main-app').style.display = 'none';
}

function showApp() {
    document.getElementById('login-overlay').style.display = 'none';
    document.getElementById('main-app').style.display = 'flex';
    document.getElementById('user-name').textContent = currentUser.email;
    loadProducts();
    loadCashStatus();
    setupPOSEvents();
    setupKitchenRealtime();
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
}

// ============ NAVEGACIÓN ============
function setupNavigation() {
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => {
            document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
            document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
            item.classList.add('active');
            document.getElementById(`view-${item.dataset.view}`).classList.add('active');
            
            if (item.dataset.view === 'kitchen') loadKitchenOrders();
            if (item.dataset.view === 'cash') loadCashStatus();
        });
    });
}

// ============ VISTA: CAJA (TPV) ============
async function loadProducts() {
    const { data, error } = await supabaseClient.from('products').select('*').eq('active', true).order('position');
    if (error) return;
    products = data || [];
    renderCategories();
    renderProducts();
}

function renderCategories() {
    const cats = [...new Set(products.map(p => p.category))];
    const bar = document.getElementById('categories-bar');
    bar.innerHTML = '<button class="cat-btn active" data-cat="all">Todos</button>';
    cats.forEach(cat => {
        if (cat) {
            const btn = document.createElement('button');
            btn.className = 'cat-btn';
            btn.dataset.cat = cat;
            btn.textContent = cat;
            bar.appendChild(btn);
        }
    });
}

function renderProducts() {
    const grid = document.getElementById('product-grid');
    const filtered = currentCategory === 'all' ? products : products.filter(p => p.category === currentCategory);
    grid.innerHTML = filtered.map(p => `
        <div class="product-card" data-id="${p.id}">
            <img class="product-img" src="${p.image || 'https://via.placeholder.com/120x60?text=Sin+Imagen'}" alt="${p.name}">
            <div class="product-name">${p.name}</div>
            <div class="product-price">$${Number(p.price).toLocaleString()}</div>
        </div>
    `).join('');
}

function addToCart(productId) {
    const product = products.find(p => p.id === productId);
    if (!product) return;
    const existing = cart.find(i => i.id === productId);
    if (existing) { existing.qty++; } else { cart.push({ ...product, qty: 1 }); }
    renderCart();
}

function renderCart() {
    const container = document.getElementById('cart-items');
    if (cart.length === 0) { container.innerHTML = '<div class="empty-cart">Añade productos para empezar</div>'; updateTotals(0); return; }
    container.innerHTML = cart.map(item => `
        <div class="cart-item">
            <div>
                <div class="cart-item-name">${item.name}</div>
                <div class="qty-controls">
                    <button class="qty-btn" onclick="changeQty(${item.id}, -1)">−</button>
                    <span>${item.qty}</span>
                    <button class="qty-btn" onclick="changeQty(${item.id}, 1)">+</button>
                </div>
            </div>
            <div class="cart-item-price">$${(item.price * item.qty).toLocaleString()}</div>
        </div>
    `).join('');
    updateTotals(cart.reduce((sum, i) => sum + (i.price * i.qty), 0));
}

function changeQty(id, delta) {
    const item = cart.find(i => i.id === id);
    if (!item) return;
    item.qty += delta;
    if (item.qty <= 0) cart = cart.filter(i => i.id !== id);
    renderCart();
}

function updateTotals(total) {
    const tax = total * 0.19;
    document.getElementById('subtotal').textContent = '$' + Math.round(total - tax).toLocaleString();
    document.getElementById('tax').textContent = '$' + Math.round(tax).toLocaleString();
    document.getElementById('total').textContent = '$' + Math.round(total).toLocaleString();
    document.getElementById('btn-pay').textContent = `COBRAR ($${Math.round(total).toLocaleString()})`;
}

function setupPOSEvents() {
    document.getElementById('product-grid').addEventListener('click', e => {
        const card = e.target.closest('.product-card');
        if (card) addToCart(Number(card.dataset.id));
    });
    document.getElementById('categories-bar').addEventListener('click', e => {
        if (e.target.classList.contains('cat-btn')) {
            document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            currentCategory = e.target.dataset.cat;
            renderProducts();
        }
    });
    document.getElementById('btn-clear').addEventListener('click', () => {
        if (cart.length > 0 && confirm('¿Limpiar carrito?')) { cart = []; renderCart(); }
    });
    document.getElementById('btn-pay').addEventListener('click', openPayModal);
    document.getElementById('btn-close-modal').addEventListener('click', () => closeModal('pay-modal'));
    document.getElementById('btn-cancel-pay').addEventListener('click', () => closeModal('pay-modal'));
    document.querySelectorAll('.type-btn').forEach(btn => btn.addEventListener('click', (e) => {
        document.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active'); orderType = e.target.dataset.type;
    }));
    document.querySelectorAll('.method-btn').forEach(btn => btn.addEventListener('click', (e) => {
        document.querySelectorAll('.method-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active'); payMethod = e.target.dataset.method;
        document.getElementById('cash-section').style.display = payMethod === 'efectivo' ? 'block' : 'none';
    }));
    document.getElementById('cash-received').addEventListener('input', (e) => {
        const total = cart.reduce((sum, i) => sum + (i.price * i.qty), 0);
        const received = parseFloat(e.target.value) || 0;
        document.getElementById('change-amount').textContent = '$' + Math.max(0, Math.round(received - total)).toLocaleString();
    });
    document.getElementById('btn-confirm-pay').addEventListener('click', confirmPayment);
}

function openPayModal() {
    if (cart.length === 0) return alert('Carrito vacío');
    document.getElementById('modal-cart-items').innerHTML = cart.map(item => `
        <div class="cart-item"><div class="cart-item-name">${item.name} x${item.qty}</div><div class="cart-item-price">$${(item.price * item.qty).toLocaleString()}</div></div>
    `).join('');
    const total = cart.reduce((sum, i) => sum + (i.price * i.qty), 0);
    document.getElementById('modal-subtotal').textContent = '$' + Math.round(total - (total * 0.19)).toLocaleString();
    document.getElementById('modal-tax').textContent = '$' + Math.round(total * 0.19).toLocaleString();
    document.getElementById('modal-total').textContent = '$' + Math.round(total).toLocaleString();
    document.getElementById('cash-received').value = '';
    document.getElementById('change-amount').textContent = '$0';
    document.getElementById('pay-modal').classList.add('active');
}

async function confirmPayment() {
    const total = cart.reduce((sum, i) => sum + (i.price * i.qty), 0);
    if (payMethod === 'efectivo') {
        const cashReceived = parseFloat(document.getElementById('cash-received').value);
        if (!cashReceived || cashReceived < total) return alert('Efectivo insuficiente');
    }
    try {
        const { data: order, error: orderError } = await supabaseClient.from('orders').insert([{ type: orderType, status: 'nuevo', total, paid: true, pay_method: payMethod, source: 'tpv', user_email: currentUser?.email }]).select().single();
        if (orderError) throw orderError;
        const orderItems = cart.map(item => ({ order_id: order.id, name: item.name, price: item.price, qty: item.qty }));
        const { error: itemsError } = await supabaseClient.from('order_items').insert(orderItems);
        if (itemsError) throw itemsError;
        printTicket(order, cart);
        cart = []; renderCart(); closeModal('pay-modal');
    } catch (error) { alert('Error: ' + error.message); }
}

function printTicket(order, items) {
    const printArea = document.getElementById('ticket-print-area');
    const date = new Date().toLocaleString('es-ES');
    const qrUrl = `${window.location.origin}/valorar.html?p=${order.id}`;
    printArea.innerHTML = `
        <div class="ticket-header"><h3>TPV PUNTO VERDE</h3><p>${date}</p><p>Pedido #${order.id}</p><p>Cajero: ${currentUser?.email || 'N/A'}</p></div>
        <div class="ticket-divider"></div>
        ${items.map(i => `<div class="ticket-item"><span>${i.qty}x ${i.name.substring(0, 20)}</span><span>$${Math.round(i.price * i.qty).toLocaleString()}</span></div>`).join('')}
        <div class="ticket-divider"></div>
        <div class="ticket-total">TOTAL: $${Math.round(order.total).toLocaleString()}</div>
        <div class="ticket-footer"><p>¡Gracias!</p><div id="qr-code"></div></div>
    `;
    setTimeout(() => {
        const qrContainer = document.getElementById('qr-code');
        qrContainer.innerHTML = '';
        new QRCode(qrContainer, { text: qrUrl, width: 100, height: 100, correctLevel: QRCode.CorrectLevel.L });
        setTimeout(() => window.print(), 500);
    }, 100);
}

// ============ VISTA: COCINA ============
async function loadKitchenOrders() {
    const { data, error } = await supabaseClient.from('orders').select('*, order_items(*)').neq('status', 'entregado').order('created_at', { ascending: false });
    if (error) return;
    kitchenOrders = data || [];
    renderKitchenOrders();
    updateKitchenStats();
}

function renderKitchenOrders() {
    ['nuevo', 'cocina', 'listo'].forEach(status => {
        const container = document.getElementById(`orders-${status}`);
        const orders = kitchenOrders.filter(o => o.status === status);
        if (orders.length === 0) { container.innerHTML = '<div class="empty-cart">No hay pedidos</div>'; return; }
        container.innerHTML = orders.map(order => {
            const time = new Date(order.created_at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
            const itemsHtml = order.order_items.map(item => `<div class="order-item"><span><span class="item-qty">${item.qty}x</span> ${item.name}</span></div>`).join('');
            let actionBtn = '';
            if (status === 'nuevo') actionBtn = `<button class="action-btn-kitchen btn-cocina" onclick="updateOrderStatus(${order.id}, 'cocina')">→ Cocina</button>`;
            else if (status === 'cocina') actionBtn = `<button class="action-btn-kitchen btn-listo" onclick="updateOrderStatus(${order.id}, 'listo')">✓ Listo</button>`;
            else if (status === 'listo') actionBtn = `<button class="action-btn-kitchen btn-entregado" onclick="updateOrderStatus(${order.id}, 'entregado')">✓ Entregado</button>`;
            return `<div class="order-card status-${status}"><div class="order-header"><div class="order-id">#${order.id}</div><div class="order-type">${order.type.toUpperCase()}</div></div><div class="order-time">🕐 ${time}</div><div class="order-items">${itemsHtml}</div><div class="order-actions">${actionBtn}</div></div>`;
        }).join('');
    });
}

function updateKitchenStats() {
    document.getElementById('count-nuevo').textContent = kitchenOrders.filter(o => o.status === 'nuevo').length;
    document.getElementById('count-cocina').textContent = kitchenOrders.filter(o => o.status === 'cocina').length;
    document.getElementById('count-listo').textContent = kitchenOrders.filter(o => o.status === 'listo').length;
}

async function updateOrderStatus(orderId, newStatus) {
    const { error } = await supabaseClient.from('orders').update({ status: newStatus }).eq('id', orderId);
    if (error) { alert('Error: ' + error.message); }
    else { loadKitchenOrders(); showToast(`Pedido #${orderId} actualizado`); }
}

function setupKitchenRealtime() {
    supabaseClient.channel('orders-channel').on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        const kitchenView = document.getElementById('view-kitchen');
        if (kitchenView.classList.contains('active')) loadKitchenOrders();
    }).subscribe();
}

// ============ VISTA: ARQUEOS ============
async function loadCashStatus() {
    const { data: session, error } = await supabaseClient.from('cash_sessions').select('*').is('closed_at', null).single();
    if (error || !session) {
        currentSession = null;
        document.getElementById('cash-status').innerHTML = '<span class="status-closed">🔴 Caja Cerrada</span>';
        document.getElementById('action-buttons').innerHTML = '<button class="action-btn btn-open" onclick="openModal(\'modal-open-cash\')"> Abrir Caja</button>';
    } else {
        currentSession = session;
        document.getElementById('cash-status').innerHTML = `<span class="status-open">🟢 Caja Abierta</span><br><small>Abierta: ${new Date(session.opened_at).toLocaleString('es-ES')}</small><br><small>Fondo: $${session.fondo.toLocaleString()}</small>`;
        document.getElementById('action-buttons').innerHTML = `
            <button class="action-btn btn-movement" onclick="openModal('modal-movement')">💵 Movimiento</button>
            <button class="action-btn btn-count" onclick="openModal('modal-count')">🔢 Arqueo Ciego</button>
            <button class="action-btn btn-close" onclick="closeCashSession()">🔒 Cerrar Caja</button>
        `;
    }
}

document.getElementById('btn-confirm-open').addEventListener('click', async () => {
    const fund = parseFloat(document.getElementById('opening-fund').value) || 0;
    const { error } = await supabaseClient.from('cash_sessions').insert([{ fondo: fund, user_email: currentUser.email }]);
    if (error) { alert('Error: ' + error.message); }
    else { closeModal('modal-open-cash'); loadCashStatus(); }
});

document.getElementById('btn-confirm-movement').addEventListener('click', async () => {
    const type = document.getElementById('movement-type').value;
    const method = document.getElementById('movement-method').value;
    const amount = parseFloat(document.getElementById('movement-amount').value) || 0;
    const note = document.getElementById('movement-note').value;
    if (!currentSession) return alert('Caja no abierta');
    const { error } = await supabaseClient.from('cash_movements').insert([{ session_id: currentSession.id, tipo: type, metodo: method, importe: amount, nota: note }]);
    if (error) { alert('Error: ' + error.message); }
    else { closeModal('modal-movement'); document.getElementById('movement-amount').value = ''; document.getElementById('movement-note').value = ''; loadCashStatus(); }
});

document.querySelectorAll('.bill-count').forEach(input => {
    input.addEventListener('input', () => {
        let total = 0;
        document.querySelectorAll('.bill-count').forEach(i => { total += parseInt(i.dataset.value) * (parseInt(i.value) || 0); });
        document.getElementById('counted-total').textContent = '$' + total.toLocaleString();
    });
});

document.getElementById('btn-confirm-count').addEventListener('click', async () => {
    if (!currentSession) return alert('Caja no abierta');
    let counted = 0;
    document.querySelectorAll('.bill-count').forEach(i => { counted += parseInt(i.dataset.value) * (parseInt(i.value) || 0); });
    const { data: movements } = await supabaseClient.from('cash_movements').select('*').eq('session_id', currentSession.id).eq('metodo', 'efectivo');
    let entradas = 0, salidas = 0;
    movements.forEach(m => { if (m.tipo === 'entrada') entradas += m.importe; if (m.tipo === 'salida') salidas += m.importe; });
    const { data: orders } = await supabaseClient.from('orders').select('total, pay_method').eq('source', 'tpv').gte('created_at', currentSession.opened_at).eq('paid', true);
    let ventasEfectivo = 0;
    orders.forEach(o => { if (o.pay_method === 'efectivo') ventasEfectivo += o.total; });
    const esperado = currentSession.fondo + ventasEfectivo + entradas - salidas;
    const diferencia = counted - esperado;
    const { error } = await supabaseClient.from('cash_arqueos').insert([{ session_id: currentSession.id, fondo: currentSession.fondo, esperado, contado: counted, dif: diferencia, v_efectivo: ventasEfectivo, entradas, salidas, kind: 'X' }]);
    if (error) { alert('Error: ' + error.message); }
    else { closeModal('modal-count'); alert(`Arqueo registrado\nEsperado: $${esperado.toLocaleString()}\nContado: $${counted.toLocaleString()}\nDiferencia: $${diferencia.toLocaleString()}`); }
});

async function closeCashSession() {
    if (!currentSession) return alert('Caja no abierta');
    if (!confirm('¿Cerrar caja?')) return;
    const { error } = await supabaseClient.from('cash_sessions').update({ closed_at: new Date().toISOString() }).eq('id', currentSession.id);
    if (error) { alert('Error: ' + error.message); }
    else { loadCashStatus(); }
}

// ============ UTILIDADES ============
function openModal(id) { document.getElementById(id).classList.add('active'); }
function closeModal(id) { document.getElementById(id).classList.remove('active'); }
function showToast(message) { const toast = document.getElementById('toast'); toast.textContent = message; toast.classList.add('show'); setTimeout(() => toast.classList.remove('show'), 3000); }

init();