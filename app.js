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
let notifications = [];
let unreadNotifs = 0;
let activeTableId = null;
let tables = [];

async function init() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session) { currentUser = session.user; showApp(); } else { showLogin(); }
    setupLoginEvents();
    setupNavigation();
    setupNotificationsPanel();
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
    loadTables();
    loadCashStatus();
    setupPOSEvents();
    setupRealtimeGlobal();
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

function setupNavigation() {
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => {
            document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
            document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
            item.classList.add('active');
            document.getElementById(`view-${item.dataset.view}`).classList.add('active');
            if (item.dataset.view === 'kitchen') loadKitchenOrders();
            if (item.dataset.view === 'cash') loadCashStatus();
            if (item.dataset.view === 'tables') loadTables();
        });
    });

    document.getElementById('btn-back-to-tables').addEventListener('click', () => {
        activeTableId = null;
        document.getElementById('active-table-display').style.display = 'none';
        document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
        document.querySelector('[data-view="tables"]').classList.add('active');
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        document.getElementById('view-tables').classList.add('active');
        loadTables();
    });
}

async function loadTables() {
    console.log('Cargando mesas...');
    const { data, error } = await supabaseClient.from('tables').select('*').order('id');
    if (error) {
        console.error('Error cargando mesas:', error);
        return;
    }
    tables = data || [];
    console.log('Mesas cargadas:', tables.length, tables);
    renderTables();
}

function renderTables() {
    console.log('Renderizando mesas:', tables.length);
    const grid = document.getElementById('tables-grid');
    if (!grid) {
        console.error('No se encontró el elemento tables-grid');
        return;
    }
    if (tables.length === 0) {
        grid.innerHTML = '<p style="text-align:center; color: #6b7280; padding: 2rem;">No hay mesas disponibles</p>';
        return;
    }
    grid.innerHTML = tables.map(table => `
        <div class="table-card status-${table.status}" onclick="selectTable(${table.id}, '${table.name}')">
            <div class="table-name">${table.name}</div>
            <div class="table-status">${table.status}</div>
        </div>
    `).join('');
    console.log('Mesas renderizadas');
}

function selectTable(id, name) {
    activeTableId = id;
    document.getElementById('active-table-display').textContent = `Mesa: ${name}`;
    document.getElementById('active-table-display').style.display = 'inline-block';
    document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
    document.querySelector('[data-view="pos"]').classList.add('active');
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById('view-pos').classList.add('active');
}

function setupNotificationsPanel() {
    document.getElementById('btn-notifications').addEventListener('click', () => {
        const panel = document.getElementById('notifications-panel');
        panel.classList.toggle('open');
        if (panel.classList.contains('open')) {
            unreadNotifs = 0;
            updateNotifBadge();
            renderNotifications();
        }
    });
    document.getElementById('btn-clear-notifs').addEventListener('click', () => {
        notifications = [];
        renderNotifications();
        updateNotifBadge();
    });
    document.getElementById('btn-close-notifs').addEventListener('click', () => {
        document.getElementById('notifications-panel').classList.remove('open');
    });
}

function addNotification(tipo, title, message) {
    const notif = { id: Date.now(), tipo, title, message, time: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) };
    notifications.unshift(notif);
    if (notifications.length > 50) notifications.pop();
    unreadNotifs++;
    updateNotifBadge();
    showToast(tipo, title, message);
    playNotifSound();
    renderNotifications();
    const bell = document.getElementById('btn-notifications');
    bell.classList.remove('has-notifs');
    void bell.offsetWidth;
    bell.classList.add('has-notifs');
}

function updateNotifBadge() {
    const badge = document.getElementById('notif-badge');
    badge.textContent = unreadNotifs;
    badge.style.display = unreadNotifs > 0 ? 'flex' : 'none';
}

function renderNotifications() {
    const list = document.getElementById('notif-list');
    if (notifications.length === 0) { list.innerHTML = '<div class="notif-empty">No hay notificaciones</div>'; return; }
    list.innerHTML = notifications.map(n => `
        <div class="notif-item tipo-${n.tipo}">
            <div class="notif-title">${n.title}</div>
            <div class="notif-message">${n.message}</div>
            <div class="notif-time">${n.time}</div>
        </div>
    `).join('');
}

function showToast(tipo, title, message) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast tipo-${tipo}`;
    toast.innerHTML = `<div class="toast-title">${title}</div><div class="toast-message">${message}</div>`;
    container.appendChild(toast);
    setTimeout(() => { toast.classList.add('removing'); setTimeout(() => toast.remove(), 300); }, 4000);
}

function playNotifSound() {
    try {
        const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBSuBzvLZiTYIGGS57OihUBELTKXh8bllHAU2j9Xvz3kpBSh+zPDajzsKFWC06emrWBUIQ5zd8sFuJAUuhM/z24k2CBhku+zooVASCkyk4PC5ZRwFNo/V7895KQUofsz');
        audio.volume = 0.3; audio.play();
    } catch(e) {}
}

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
            btn.className = 'cat-btn'; btn.dataset.cat = cat; btn.textContent = cat;
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
        const btn = e.target.closest('.cat-btn');
        if (btn) {
            document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentCategory = btn.dataset.cat;
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
        const { data: order, error: orderError } = await supabaseClient.from('orders').insert([{ 
            type: orderType, status: 'nuevo', total, paid: true, pay_method: payMethod, 
            source: 'tpv', user_email: currentUser?.email, table_id: activeTableId 
        }]).select().single();
        if (orderError) throw orderError;
        const orderItems = cart.map(item => ({ order_id: order.id, name: item.name, price: item.price, qty: item.qty }));
        const { error: itemsError } = await supabaseClient.from('order_items').insert(orderItems);
        if (itemsError) throw itemsError;
        if (activeTableId) {
            await supabaseClient.from('tables').update({ status: 'ocupada', current_order_id: order.id }).eq('id', activeTableId);
        }
        printTicket(order, cart);
        addNotification('pago', `✓ Pedido #${order.id} cobrado`, `Total: $${Math.round(total).toLocaleString()} | ${payMethod.toUpperCase()}`);
        cart = []; renderCart(); closeModal('pay-modal');
        const cashView = document.getElementById('view-cash');
        if (cashView.classList.contains('active')) loadCashStatus();
    } catch (error) { alert('Error: ' + error.message); }
}

function printTicket(order, items) {
    const printArea = document.getElementById('ticket-print-area');
    const date = new Date().toLocaleString('es-ES');
    const qrUrl = `${window.location.origin}/valorar.html?p=${order.id}`;
    const tableText = order.table_id ? ` | Mesa: ${order.table_id}` : '';
    printArea.innerHTML = `
        <div class="ticket-header"><h3>TPV PUNTO VERDE</h3><p>${date}</p><p>Pedido #${order.id}${tableText}</p><p>Cajero: ${currentUser?.email || 'N/A'}</p></div>
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
            const tableText = order.table_id ? ` (Mesa ${order.table_id})` : '';
            const itemsHtml = order.order_items.map(item => `<div class="order-item"><span><span class="item-qty">${item.qty}x</span> ${item.name}</span></div>`).join('');
            let actionBtn = '';
            if (status === 'nuevo') actionBtn = `<button class="action-btn-kitchen btn-cocina" onclick="updateOrderStatus(${order.id}, 'cocina')">→ Cocina</button>`;
            else if (status === 'cocina') actionBtn = `<button class="action-btn-kitchen btn-listo" onclick="updateOrderStatus(${order.id}, 'listo')">✓ Listo</button>`;
            else if (status === 'listo') actionBtn = `<button class="action-btn-kitchen btn-entregado" onclick="updateOrderStatus(${order.id}, 'entregado')">✓ Entregado</button>`;
            return `<div class="order-card status-${status}"><div class="order-header"><div class="order-id">#${order.id}${tableText}</div><div class="order-type">${order.type.toUpperCase()}</div></div><div class="order-time"> ${time}</div><div class="order-items">${itemsHtml}</div><div class="order-actions">${actionBtn}</div></div>`;
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
    else { 
        loadKitchenOrders(); 
        if (newStatus === 'entregado') {
            const order = kitchenOrders.find(o => o.id === orderId);
            if (order && order.table_id) {
                await supabaseClient.from('tables').update({ status: 'libre', current_order_id: null }).eq('id', order.table_id);
            }
        }
    }
}

function setupRealtimeGlobal() {
    supabaseClient.channel('orders-global')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, (payload) => {
            const order = payload.new;
            const tableText = order.table_id ? ` (Mesa ${order.table_id})` : '';
            addNotification('nuevo', ` Nuevo Pedido #${order.id}${tableText}`, `Tipo: ${order.type.toUpperCase()} | Total: $${Math.round(order.total).toLocaleString()}`);
            const kitchenView = document.getElementById('view-kitchen');
            if (kitchenView.classList.contains('active')) loadKitchenOrders();
            loadTables();
        })
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders' }, (payload) => {
            const order = payload.new;
            const oldStatus = payload.old.status;
            const newStatus = order.status;
            let tipo = '', title = '', message = '';
            const tableText = order.table_id ? ` (Mesa ${order.table_id})` : '';
            if (oldStatus === 'nuevo' && newStatus === 'cocina') { tipo = 'cocina'; title = ` Pedido #${order.id}${tableText} en preparación`; message = 'La cocina está preparando el pedido'; }
            else if (oldStatus === 'cocina' && newStatus === 'listo') { tipo = 'listo'; title = `✅ Pedido #${order.id}${tableText} listo`; message = 'El pedido está listo para entregar'; }
            else if (newStatus === 'entregado') { tipo = 'pago'; title = `✓ Pedido #${order.id}${tableText} entregado`; message = 'Pedido completado'; loadTables(); }
            if (title) addNotification(tipo, title, message);
            const kitchenView = document.getElementById('view-kitchen');
            if (kitchenView.classList.contains('active')) loadKitchenOrders();
        })
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'tables' }, () => { loadTables(); })
        .subscribe();
}

async function loadCashStatus() {
    const { data: session, error } = await supabaseClient.from('cash_sessions').select('*').is('closed_at', null).single();
    if (error || !session) {
        currentSession = null;
        document.getElementById('cash-status').innerHTML = '<span class="status-closed"> Caja Cerrada</span>';
        document.getElementById('action-buttons').innerHTML = '<button class="action-btn btn-open" onclick="openModal(\'modal-open-cash\')">🔓 Abrir Caja</button>';
        document.getElementById('cash-summary').style.display = 'none';
    } else {
        currentSession = session;
        document.getElementById('cash-status').innerHTML = `<span class="status-open">🟢 Caja Abierta</span><br><small>Abierta: ${new Date(session.opened_at).toLocaleString('es-ES')}</small><br><small>Fondo inicial: $${session.fondo.toLocaleString()}</small>`;
        document.getElementById('action-buttons').innerHTML = `
            <button class="action-btn btn-movement" onclick="openModal('modal-movement')">💵 Movimiento</button>
            <button class="action-btn btn-count" onclick="openModal('modal-count')"> Arqueo Ciego</button>
            <button class="action-btn btn-close" onclick="closeCashSession()"> Cerrar Caja</button>
        `;
        await loadCashSummary();
    }
}

async function loadCashSummary() {
    if (!currentSession) return;
    const { data: orders } = await supabaseClient.from('orders').select('*').gte('created_at', currentSession.opened_at).eq('paid', true);
    const { data: movements } = await supabaseClient.from('cash_movements').select('*').eq('session_id', currentSession.id);
    let efectivo = 0, tarjeta = 0, bizum = 0, totalPedidos = 0;
    orders.forEach(o => { totalPedidos++; if (o.pay_method === 'efectivo') efectivo += o.total; if (o.pay_method === 'tarjeta') tarjeta += o.total; if (o.pay_method === 'bizum') bizum += o.total; });
    let entradas = 0, salidas = 0;
    movements.forEach(m => { if (m.tipo === 'entrada') entradas += m.importe; if (m.tipo === 'salida') salidas += m.importe; });
    const totalVentas = efectivo + tarjeta + bizum;
    const totalCaja = currentSession.fondo + efectivo + entradas - salidas;
    document.getElementById('cash-summary').style.display = 'block';
    document.getElementById('summary-content').innerHTML = `
        <div class="summary-grid">
            <div class="summary-card"><div class="summary-label">Total Ventas</div><div class="summary-value">$${totalVentas.toLocaleString()}</div></div>
            <div class="summary-card"><div class="summary-label">Pedidos</div><div class="summary-value">${totalPedidos}</div></div>
            <div class="summary-card"><div class="summary-label">Efectivo</div><div class="summary-value">$${efectivo.toLocaleString()}</div></div>
            <div class="summary-card"><div class="summary-label">Tarjeta</div><div class="summary-value">$${tarjeta.toLocaleString()}</div></div>
            <div class="summary-card"><div class="summary-label">Bizum</div><div class="summary-value">$${bizum.toLocaleString()}</div></div>
            <div class="summary-card highlight"><div class="summary-label">Total en Caja</div><div class="summary-value">$${totalCaja.toLocaleString()}</div></div>
        </div>
        <div class="movements-section">
            <h4>Movimientos registrados: ${movements.length}</h4>
            ${movements.length > 0 ? movements.map(m => `<div class="movement-item ${m.tipo}"><span>${m.tipo === 'entrada' ? '' : ''} ${m.nota || m.metodo}</span><span>$${m.importe.toLocaleString()}</span></div>`).join('') : '<p style="color: var(--text-gray); font-size: 0.9rem;">Sin movimientos</p>'}
        </div>
    `;
}

document.getElementById('btn-confirm-open').addEventListener('click', async () => {
    const fund = parseFloat(document.getElementById('opening-fund').value) || 0;
    const { error } = await supabaseClient.from('cash_sessions').insert([{ fondo: fund, user_email: currentUser.email }]);
    if (error) { alert('Error: ' + error.message); } else { closeModal('modal-open-cash'); loadCashStatus(); }
});

document.getElementById('btn-confirm-movement').addEventListener('click', async () => {
    const type = document.getElementById('movement-type').value;
    const method = document.getElementById('movement-method').value;
    const amount = parseFloat(document.getElementById('movement-amount').value) || 0;
    const note = document.getElementById('movement-note').value;
    if (!currentSession) return alert('Caja no abierta');
    const { error } = await supabaseClient.from('cash_movements').insert([{ session_id: currentSession.id, tipo: type, metodo: method, importe: amount, nota: note }]);
    if (error) { alert('Error: ' + error.message); } else { closeModal('modal-movement'); document.getElementById('movement-amount').value = ''; document.getElementById('movement-note').value = ''; loadCashStatus(); }
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
    if (error) { alert('Error: ' + error.message); } else { closeModal('modal-count'); alert(`Arqueo registrado\nEsperado: $${esperado.toLocaleString()}\nContado: $${counted.toLocaleString()}\nDiferencia: $${diferencia.toLocaleString()}`); loadCashStatus(); }
});

async function closeCashSession() {
    if (!currentSession) return alert('Caja no abierta');
    if (!confirm('¿Cerrar caja?')) return;
    const { error } = await supabaseClient.from('cash_sessions').update({ closed_at: new Date().toISOString() }).eq('id', currentSession.id);
    if (error) { alert('Error: ' + error.message); } else { loadCashStatus(); }
}

function openModal(id) { document.getElementById(id).classList.add('active'); }
function closeModal(id) { document.getElementById(id).classList.remove('active'); }

init();