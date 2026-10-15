const SUPABASE_URL = 'https://tjohhybyvfqqjummuedk.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_B6wSHIVowVjWL_086rafEA_g7-STvzI';
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============ VARIABLES GLOBALES ============
let currentUser = null;
let currentProfile = null;
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
let currentTableOrder = null;
let chartHoras = null;
let chartProductos = null;
let currentReportPeriod = 'today';
let diners = [];
let unassignedItems = [];
let currentDinerPayId = null;
let currentDinerPayMethod = 'efectivo';
let ingredients = [];
let recipes = [];
let staffList = [];
let staffSales = [];
let currentQRTable = null;
let customers = [];
let selectedCustomer = null;
let redeemPoints = 0;
let loyaltySettings = { points_per_unit: 1, point_value: 0.05, birthday_multiplier: 2 };
let reservations = [];
let invoices = [];
let restaurantSettings = {
    business_name: 'TPV Punto Verde', nif: '', address: '', city: 'Almería',
    postal_code: '04001', province: 'Almería', country: 'España', phone: '', email: '',
    iva_general: 21, iva_reducido: 10, iva_superreducido: 4, iva_default: 10,
    invoice_series: 'A', invoice_year: 2026, invoice_counter: 0
};
let currentInvoice = null;
let invoiceItems = [];
let allergens = [];
let productAllergens = {};
let currentAllergenCategory = 'all';
let currentProductForImage = null;
let realtimeChannel = null;
let pollingInterval = null;

// Variables para vista Mesero
let waiterCart = [];
let waiterSelectedTable = null;
let waiterCategory = 'all';

const ROLE_PERMISSIONS = {
    admin: ['tables', 'pos', 'waiter', 'kitchen', 'reservations', 'customers', 'inventory', 'products', 'allergens', 'invoices', 'reports', 'cash', 'staff'],
    cajero: ['tables', 'pos', 'waiter', 'kitchen', 'reservations', 'customers', 'inventory', 'products', 'invoices', 'reports', 'cash'],
    mesero: ['tables', 'pos', 'waiter', 'kitchen', 'reservations'],
    cocina: ['kitchen']
};

// ============ INICIALIZACIÓN ============
async function init() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session) { currentUser = session.user; await loadProfile(); showApp(); } else { showLogin(); }
    setupLoginEvents();
    setupNavigation();
    setupNotificationsPanel();
    setupReportFilters();
    setupDivideEvents();
    setupInventoryEvents();
    setupStaffEvents();
    setupQREvents();
    setupCustomerEvents();
    setupLoyaltySettingsEvents();
    setupReservationEvents();
    setupInvoiceEvents();
    setupAllergenEvents();
    setupProductManagementEvents();
    setupWaiterEvents();
    setupPOSEvents();
    setupRealtimeGlobal();
}

async function loadProfile() {
    const { data } = await supabaseClient.from('profiles').select('*').eq('id', currentUser.id).single();
    currentProfile = data || { id: currentUser.id, email: currentUser.email, full_name: 'Usuario', role: 'admin', commission_rate: 0, active: true };
}

async function loadLoyaltySettings() {
    const { data } = await supabaseClient.from('loyalty_settings').select('*').eq('id', 1).single();
    if (data) loyaltySettings = data;
}

async function loadRestaurantSettings() {
    const { data } = await supabaseClient.from('restaurant_settings').select('*').eq('id', 1).single();
    if (data) restaurantSettings = data;
}

async function loadAllergens() {
    const { data } = await supabaseClient.from('allergens').select('*').order('code');
    allergens = data || [];
    const { data: prodAllergens } = await supabaseClient.from('product_allergens').select('*');
    productAllergens = {};
    (prodAllergens || []).forEach(pa => {
        if (!productAllergens[pa.product_id]) productAllergens[pa.product_id] = [];
        productAllergens[pa.product_id].push(pa.allergen_id);
    });
}

function applyPermissions() {
    const role = currentProfile?.role || 'admin';
    const perms = ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS.admin;
    document.querySelectorAll('.nav-item').forEach(item => {
        const perm = item.dataset.perm;
        if (perm && !perms.includes(perm)) item.classList.add('hidden');
        else item.classList.remove('hidden');
    });
    document.getElementById('user-role').textContent = role.toUpperCase();
    const loyaltyBtn = document.getElementById('btn-loyalty-settings');
    if (loyaltyBtn) loyaltyBtn.style.display = (role === 'admin') ? 'inline-block' : 'none';
    const fiscalBtn = document.getElementById('btn-fiscal-settings');
    if (fiscalBtn) fiscalBtn.style.display = (role === 'admin') ? 'inline-block' : 'none';
    const firstAllowed = perms[0];
    const firstNavItem = document.querySelector(`.nav-item[data-perm="${firstAllowed}"]`);
    if (firstNavItem) {
        document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
        firstNavItem.classList.add('active');
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        document.getElementById(`view-${firstAllowed}`).classList.add('active');
    }
}

function showLogin() {
    document.getElementById('login-overlay').style.display = 'flex';
    document.getElementById('main-app').style.display = 'none';
}

async function showApp() {
    document.getElementById('login-overlay').style.display = 'none';
    document.getElementById('main-app').style.display = 'flex';
    document.getElementById('user-name').textContent = currentProfile?.full_name || currentUser.email;
    applyPermissions();
    loadLoyaltySettings();
    loadRestaurantSettings();
    // ✅ Cargar productos PRIMERO (necesario para mesero)
    await loadProducts();
    await loadAllergens();
    loadTables();
    loadReservations();
    loadInvoices();
    loadCashStatus();
    loadIngredients();
    loadStaff();
    loadCustomers();
    loadProductManagement();
}

// ============ LOGIN ============
function setupLoginEvents() {
    document.getElementById('login-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;
        const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
        if (error) { document.getElementById('login-error').textContent = 'Credenciales incorrectas'; }
        else {
            currentUser = data.user;
            await loadProfile();
            if (currentProfile && currentProfile.active === false) {
                await supabaseClient.auth.signOut();
                currentUser = null;
                document.getElementById('login-error').textContent = 'Tu cuenta está desactivada.';
                return;
            }
            showApp();
        }
    });
    document.getElementById('btn-logout').addEventListener('click', async () => {
        await supabaseClient.auth.signOut();
        currentUser = null; currentProfile = null;
        showLogin();
    });
}

// ============ NAVEGACIÓN ============
function setupNavigation() {
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => {
            if (item.classList.contains('hidden')) return;
            const view = item.dataset.view;
            document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
            document.getElementById(`view-${view}`).classList.add('active');
            if (view === 'tables') { activeTableId = null; currentTableOrder = null; cart = []; renderCart(); renderTableOrder(); loadTables(); }
            else if (view === 'pos') { if (!activeTableId) { currentTableOrder = null; cart = []; renderCart(); renderTableOrder(); document.getElementById('pos-title').textContent = 'Caja - Mostrador'; } renderMiniTables(); }
            else if (view === 'waiter') { loadWaiterView(); }
            else if (view === 'kitchen') loadKitchenOrders();
            else if (view === 'reservations') loadReservations();
            else if (view === 'customers') loadCustomers();
            else if (view === 'inventory') loadIngredients();
            else if (view === 'products') loadProductManagement();
            else if (view === 'allergens') { renderAllergenCategories(); renderAllergens(); }
            else if (view === 'invoices') loadInvoices();
            else if (view === 'reports') loadReports(currentReportPeriod);
            else if (view === 'cash') loadCashStatus();
            else if (view === 'staff') loadStaff();
        });
    });
    document.getElementById('btn-back-to-tables').addEventListener('click', () => {
        activeTableId = null; currentTableOrder = null; cart = [];
        renderCart(); renderTableOrder();
        document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
        document.querySelector('[data-view="tables"]').classList.add('active');
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        document.getElementById('view-tables').classList.add('active');
        loadTables();
    });
}

// ============ NOTIFICACIONES ============
function setupNotificationsPanel() {
    document.getElementById('btn-notifications').addEventListener('click', () => {
        const panel = document.getElementById('notifications-panel');
        panel.classList.toggle('open');
        if (panel.classList.contains('open')) { unreadNotifs = 0; updateNotifBadge(); renderNotifications(); }
    });
    document.getElementById('btn-clear-notifs').addEventListener('click', () => { notifications = []; renderNotifications(); updateNotifBadge(); });
    document.getElementById('btn-close-notifs').addEventListener('click', () => { document.getElementById('notifications-panel').classList.remove('open'); });
}

function addNotification(tipo, title, message) {
    const notif = { id: Date.now(), tipo, title, message, time: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) };
    notifications.unshift(notif);
    if (notifications.length > 50) notifications.pop();
    unreadNotifs++;
    updateNotifBadge();
    showToast(tipo, title, message);
    renderNotifications();
}

function updateNotifBadge() {
    const badge = document.getElementById('notif-badge');
    badge.textContent = unreadNotifs;
    badge.style.display = unreadNotifs > 0 ? 'flex' : 'none';
}

function renderNotifications() {
    const list = document.getElementById('notif-list');
    if (notifications.length === 0) { list.innerHTML = '<div class="notif-empty">No hay notificaciones</div>'; return; }
    list.innerHTML = notifications.map(n => `<div class="notif-item tipo-${n.tipo}"><div class="notif-title">${n.title}</div><div class="notif-message">${n.message}</div><div class="notif-time">${n.time}</div></div>`).join('');
}

function showToast(tipo, title, message) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast tipo-${tipo}`;
    toast.innerHTML = `<div class="toast-title">${title}</div><div class="toast-message">${message}</div>`;
    container.appendChild(toast);
    setTimeout(() => { toast.classList.add('removing'); setTimeout(() => toast.remove(), 300); }, 4000);
}

// ============ REPORTES ============
function setupReportFilters() {
    document.querySelectorAll('.report-filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.report-filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentReportPeriod = btn.dataset.period;
            loadReports(currentReportPeriod);
        });
    });
}

function getDateRange(period) {
    const now = new Date();
    const end = new Date(now); end.setHours(23, 59, 59, 999);
    const start = new Date(now);
    if (period === 'today') start.setHours(0, 0, 0, 0);
    else if (period === 'week') { const day = start.getDay(); const diff = start.getDate() - day + (day === 0 ? -6 : 1); start.setDate(diff); start.setHours(0, 0, 0, 0); }
    else if (period === 'month') { start.setDate(1); start.setHours(0, 0, 0, 0); }
    const d = new Date(start);
    if (period === 'today') d.setDate(d.getDate() - 1);
    else if (period === 'week') d.setDate(d.getDate() - 7);
    else if (period === 'month') d.setMonth(d.getMonth() - 1);
    return { start: start.toISOString(), end: end.toISOString(), prevStart: d.toISOString(), prevEnd: start.toISOString() };
}

async function loadReports(period) {
    const range = getDateRange(period);
    const { data: currentOrders } = await supabaseClient.from('orders').select('*, order_items(*)').eq('paid', true).gte('created_at', range.start).lte('created_at', range.end).order('created_at', { ascending: false });
    const { data: prevOrders } = await supabaseClient.from('orders').select('*').eq('paid', true).gte('created_at', range.prevStart).lte('created_at', range.prevEnd);
    const orders = currentOrders || [];
    const prev = prevOrders || [];
    const totalVentas = orders.reduce((s, o) => s + (o.total || 0), 0);
    const totalPedidos = orders.length;
    const ticketPromedio = totalPedidos > 0 ? totalVentas / totalPedidos : 0;
    const prevVentas = prev.reduce((s, o) => s + (o.total || 0), 0);
    const prevPedidos = prev.length;
    const metodos = {};
    orders.forEach(o => { metodos[o.pay_method] = (metodos[o.pay_method] || 0) + o.total; });
    const metodoTop = Object.entries(metodos).sort((a, b) => b[1] - a[1])[0];
    document.getElementById('kpi-ventas').textContent = '€' + Math.round(totalVentas).toLocaleString();
    document.getElementById('kpi-pedidos').textContent = totalPedidos;
    document.getElementById('kpi-ticket').textContent = '€' + Math.round(ticketPromedio).toLocaleString();
    document.getElementById('kpi-metodo').textContent = metodoTop ? metodoTop[0].toUpperCase() : '—';
    document.getElementById('kpi-metodo-detail').textContent = metodoTop ? '€' + Math.round(metodoTop[1]).toLocaleString() : '—';
    const renderTrend = (elId, cur, prev) => {
        const el = document.getElementById(elId);
        if (prev === 0) { el.textContent = '—'; el.className = 'kpi-trend neutral'; return; }
        const change = ((cur - prev) / prev) * 100;
        el.textContent = `${change >= 0 ? '↑' : '↓'} ${Math.abs(Math.round(change))}% vs anterior`;
        el.className = 'kpi-trend ' + (change > 0 ? 'up' : change < 0 ? 'down' : 'neutral');
    };
    renderTrend('kpi-ventas-trend', totalVentas, prevVentas);
    renderTrend('kpi-pedidos-trend', totalPedidos, prevPedidos);
    renderTrend('kpi-ticket-trend', ticketPromedio, prevPedidos > 0 ? prevVentas / prevPedidos : 0);
    const horas = new Array(24).fill(0);
    orders.forEach(o => { horas[new Date(o.created_at).getHours()] += o.total; });
    if (chartHoras) chartHoras.destroy();
    chartHoras = new Chart(document.getElementById('chart-horas').getContext('2d'), {
        type: 'bar',
        data: { labels: Array.from({length: 24}, (_, i) => `${i}:00`), datasets: [{ label: 'Ventas (€)', data: horas, backgroundColor: 'rgba(16, 185, 129, 0.7)', borderColor: '#10b981', borderWidth: 1, borderRadius: 4 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { callback: v => '€' + v } }, x: { ticks: { maxTicksLimit: 12 } } } }
    });
    const productos = {};
    orders.forEach(o => { (o.order_items || []).forEach(item => { if (!productos[item.name]) productos[item.name] = 0; productos[item.name] += item.qty; }); });
    const sorted = Object.entries(productos).sort((a, b) => b[1] - a[1]).slice(0, 5);
    if (chartProductos) chartProductos.destroy();
    chartProductos = new Chart(document.getElementById('chart-productos').getContext('2d'), {
        type: 'doughnut',
        data: { labels: sorted.map(p => p[0].length > 20 ? p[0].substring(0, 20) + '...' : p[0]), datasets: [{ data: sorted.map(p => p[1]), backgroundColor: ['#10b981', '#f59e0b', '#3b82f6', '#ef4444', '#8b5cf6'], borderWidth: 2, borderColor: '#fff' }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { font: { size: 11 } } } } }
    });
    const tbody = document.getElementById('recent-orders-body');
    tbody.innerHTML = orders.slice(0, 10).map(o => {
        const date = new Date(o.created_at).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
        return `<tr><td>#${o.id}</td><td>${date}</td><td>${(o.type || 'mostrador').toUpperCase()}</td><td>${(o.pay_method || '—').toUpperCase()}</td><td><strong>€${Math.round(o.total).toLocaleString()}</strong></td></tr>`;
    }).join('') || '<tr><td colspan="5" style="text-align:center; color: var(--text-gray); padding: 1rem;">Sin pedidos</td></tr>';
}

// ============ FACTURAS ============
function setupInvoiceEvents() {
    document.getElementById('btn-fiscal-settings').addEventListener('click', openFiscalModal);
    document.getElementById('btn-close-fiscal').addEventListener('click', () => closeModal('fiscal-settings-modal'));
    document.getElementById('btn-cancel-fiscal').addEventListener('click', () => closeModal('fiscal-settings-modal'));
    document.getElementById('btn-save-fiscal').addEventListener('click', saveFiscalSettings);
    document.getElementById('btn-new-invoice').addEventListener('click', () => openInvoiceModal());
    document.getElementById('btn-close-invoice').addEventListener('click', () => closeModal('invoice-modal'));
    document.getElementById('btn-cancel-invoice').addEventListener('click', () => closeModal('invoice-modal'));
    document.getElementById('btn-save-invoice').addEventListener('click', saveInvoice);
    document.getElementById('btn-add-invoice-item').addEventListener('click', addInvoiceItem);
    document.getElementById('inv-type').addEventListener('change', updateInvoiceForm);
    document.getElementById('btn-close-view-invoice').addEventListener('click', () => closeModal('view-invoice-modal'));
    document.getElementById('btn-cancel-view-invoice').addEventListener('click', () => closeModal('view-invoice-modal'));
    document.getElementById('btn-send-invoice').addEventListener('click', sendInvoiceByEmail);
    document.getElementById('btn-print-invoice').addEventListener('click', printInvoice);
    document.getElementById('inv-date-from').addEventListener('change', renderInvoices);
    document.getElementById('inv-date-to').addEventListener('change', renderInvoices);
    document.getElementById('inv-type-filter').addEventListener('change', renderInvoices);
    document.getElementById('inv-status-filter').addEventListener('change', renderInvoices);
}

function openFiscalModal() {
    document.getElementById('set-business-name').value = restaurantSettings.business_name || '';
    document.getElementById('set-nif').value = restaurantSettings.nif || '';
    document.getElementById('set-address').value = restaurantSettings.address || '';
    document.getElementById('set-city').value = restaurantSettings.city || 'Almería';
    document.getElementById('set-postal').value = restaurantSettings.postal_code || '04001';
    document.getElementById('set-province').value = restaurantSettings.province || 'Almería';
    document.getElementById('set-phone').value = restaurantSettings.phone || '';
    document.getElementById('set-email').value = restaurantSettings.email || '';
    document.getElementById('set-iva-general').value = restaurantSettings.iva_general || 21;
    document.getElementById('set-iva-reducido').value = restaurantSettings.iva_reducido || 10;
    document.getElementById('set-iva-super').value = restaurantSettings.iva_superreducido || 4;
    document.getElementById('set-iva-default').value = restaurantSettings.iva_default || 10;
    document.getElementById('set-invoice-series').value = restaurantSettings.invoice_series || 'A';
    document.getElementById('set-invoice-counter').value = restaurantSettings.invoice_counter || 0;
    document.getElementById('fiscal-settings-modal').classList.add('active');
}

async function saveFiscalSettings() {
    const settings = {
        business_name: document.getElementById('set-business-name').value.trim(),
        nif: document.getElementById('set-nif').value.trim(),
        address: document.getElementById('set-address').value.trim(),
        city: document.getElementById('set-city').value.trim(),
        postal_code: document.getElementById('set-postal').value.trim(),
        province: document.getElementById('set-province').value.trim(),
        phone: document.getElementById('set-phone').value.trim(),
        email: document.getElementById('set-email').value.trim(),
        iva_general: parseFloat(document.getElementById('set-iva-general').value) || 21,
        iva_reducido: parseFloat(document.getElementById('set-iva-reducido').value) || 10,
        iva_superreducido: parseFloat(document.getElementById('set-iva-super').value) || 4,
        iva_default: parseFloat(document.getElementById('set-iva-default').value) || 10,
        invoice_series: document.getElementById('set-invoice-series').value.trim() || 'A',
        invoice_counter: parseInt(document.getElementById('set-invoice-counter').value) || 0,
        updated_at: new Date().toISOString()
    };
    try {
        const { error } = await supabaseClient.from('restaurant_settings').update(settings).eq('id', 1);
        if (error) throw error;
        restaurantSettings = { ...restaurantSettings, ...settings };
        closeModal('fiscal-settings-modal');
        showToast('pago', '⚙️ Configuración fiscal guardada', '');
    } catch (error) { alert('Error: ' + error.message); }
}

function openInvoiceModal() {
    invoiceItems = [{ description: '', quantity: 1, price: 0, iva_rate: restaurantSettings.iva_default }];
    document.getElementById('invoice-modal-title').textContent = 'Nueva Factura';
    document.getElementById('inv-type').value = 'simplificada';
    document.getElementById('inv-customer-name').value = '';
    document.getElementById('inv-customer-nif').value = '';
    document.getElementById('inv-customer-address').value = '';
    document.getElementById('inv-customer-email').value = '';
    document.getElementById('inv-customer-phone').value = '';
    document.getElementById('inv-notes').value = '';
    updateInvoiceForm();
    renderInvoiceItems();
    document.getElementById('invoice-modal').classList.add('active');
}

function updateInvoiceForm() {
    const type = document.getElementById('inv-type').value;
    document.getElementById('inv-customer-nif').required = (type === 'completa');
    document.getElementById('inv-customer-address').required = (type === 'completa');
}

function addInvoiceItem() {
    invoiceItems.push({ description: '', quantity: 1, price: 0, iva_rate: restaurantSettings.iva_default });
    renderInvoiceItems();
}

function removeInvoiceItem(idx) {
    invoiceItems.splice(idx, 1);
    renderInvoiceItems();
}

function renderInvoiceItems() {
    const container = document.getElementById('inv-items-container');
    container.innerHTML = invoiceItems.map((item, idx) => `
        <div style="display:grid; grid-template-columns: 2fr 0.5fr 1fr 0.8fr auto; gap:0.5rem; margin-bottom:0.5rem; align-items:end;">
            <div class="input-group" style="margin:0;"><label>Descripción:</label><input type="text" value="${item.description}" onchange="updateInvoiceItem(${idx}, 'description', this.value)" placeholder="Producto o servicio"></div>
            <div class="input-group" style="margin:0;"><label>Cant.:</label><input type="number" value="${item.quantity}" onchange="updateInvoiceItem(${idx}, 'quantity', parseFloat(this.value))" min="0" step="0.01"></div>
            <div class="input-group" style="margin:0;"><label>Precio (€):</label><input type="number" value="${item.price}" onchange="updateInvoiceItem(${idx}, 'price', parseFloat(this.value))" min="0" step="0.01"></div>
            <div class="input-group" style="margin:0;"><label>IVA %:</label><select onchange="updateInvoiceItem(${idx}, 'iva_rate', parseFloat(this.value))">
                <option value="${restaurantSettings.iva_reducido}" ${item.iva_rate === restaurantSettings.iva_reducido ? 'selected' : ''}>${restaurantSettings.iva_reducido}% (Reducido)</option>
                <option value="${restaurantSettings.iva_general}" ${item.iva_rate === restaurantSettings.iva_general ? 'selected' : ''}>${restaurantSettings.iva_general}% (General)</option>
                <option value="${restaurantSettings.iva_superreducido}" ${item.iva_rate === restaurantSettings.iva_superreducido ? 'selected' : ''}>${restaurantSettings.iva_superreducido}% (Super)</option>
            </select></div>
            <button onclick="removeInvoiceItem(${idx})" style="background:#fef2f2; color:#ef4444; border:1px solid #ef4444; padding:0.5rem; border-radius:6px; cursor:pointer;">️</button>
        </div>
    `).join('');
    calculateInvoiceTotals();
}

function updateInvoiceItem(idx, field, value) { invoiceItems[idx][field] = value; calculateInvoiceTotals(); }

function calculateInvoiceTotals() {
    let subtotal = 0, ivaAmount = 0;
    invoiceItems.forEach(item => {
        const lineTotal = (item.quantity || 0) * (item.price || 0);
        subtotal += lineTotal;
        ivaAmount += lineTotal * ((item.iva_rate || 0) / 100);
    });
    document.getElementById('inv-subtotal').textContent = '€' + subtotal.toFixed(2);
    document.getElementById('inv-iva-amount').textContent = '€' + ivaAmount.toFixed(2);
    document.getElementById('inv-total-amount').textContent = '€' + (subtotal + ivaAmount).toFixed(2);
    document.getElementById('inv-iva-rate').textContent = restaurantSettings.iva_default;
}

async function generateHash(data) {
    const encoder = new TextEncoder();
    const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(data));
    return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function saveInvoice() {
    const type = document.getElementById('inv-type').value;
    const customer_name = document.getElementById('inv-customer-name').value.trim() || 'Consumidor final';
    const customer_nif = document.getElementById('inv-customer-nif').value.trim();
    const customer_address = document.getElementById('inv-customer-address').value.trim();
    const customer_email = document.getElementById('inv-customer-email').value.trim();
    const customer_phone = document.getElementById('inv-customer-phone').value.trim();
    const notes = document.getElementById('inv-notes').value.trim();

    if (type === 'completa' && !customer_nif) return alert('El NIF es obligatorio para facturas completas');
    if (!invoiceItems.some(i => i.description && i.price > 0)) return alert('Añade al menos una línea con descripción y precio');

    restaurantSettings.invoice_counter = (restaurantSettings.invoice_counter || 0) + 1;
    const invoice_number = `F-${restaurantSettings.invoice_series}${restaurantSettings.invoice_year}-${String(restaurantSettings.invoice_counter).padStart(4, '0')}`;

    let subtotal = 0, ivaAmount = 0;
    invoiceItems.forEach(item => {
        const lineTotal = (item.quantity || 0) * (item.price || 0);
        subtotal += lineTotal;
        ivaAmount += lineTotal * ((item.iva_rate || 0) / 100);
    });
    const total = subtotal + ivaAmount;

    const lastInvoice = invoices[invoices.length - 1];
    const previous_hash = lastInvoice ? lastInvoice.current_hash : 'GENESIS';
    const current_hash = await generateHash(`${invoice_number}|${new Date().toISOString()}|${subtotal}|${ivaAmount}|${total}|${previous_hash}`);

    try {
        const { data: invoice, error } = await supabaseClient.from('invoices').insert([{
            invoice_number, invoice_date: new Date().toISOString(), customer_name, customer_nif,
            customer_address, customer_email, customer_phone, subtotal, iva_amount: ivaAmount, total,
            iva_rate: restaurantSettings.iva_default, invoice_type: type, previous_hash, current_hash,
            signature: current_hash.substring(0, 16), status: 'emitida', notes
        }]).select().single();
        if (error) throw error;
        await supabaseClient.from('restaurant_settings').update({ invoice_counter: restaurantSettings.invoice_counter }).eq('id', 1);
        currentInvoice = invoice;
        closeModal('invoice-modal');
        loadInvoices();
        showToast('pago', `📄 Factura ${invoice_number} emitida`, `Total: €${total.toFixed(2)}`);
    } catch (error) { alert('Error: ' + error.message); }
}

async function loadInvoices() {
    const { data } = await supabaseClient.from('invoices').select('*').order('created_at', { ascending: false });
    invoices = data || [];
    renderInvoices();
}

function renderInvoices() {
    const grid = document.getElementById('invoices-grid');
    if (!grid) return;
    const dateFrom = document.getElementById('inv-date-from').value;
    const dateTo = document.getElementById('inv-date-to').value;
    const typeFilter = document.getElementById('inv-type-filter').value;
    const statusFilter = document.getElementById('inv-status-filter').value;

    let filtered = invoices;
    if (dateFrom) filtered = filtered.filter(i => i.invoice_date >= dateFrom);
    if (dateTo) filtered = filtered.filter(i => i.invoice_date <= dateTo + 'T23:59:59');
    if (typeFilter !== 'all') filtered = filtered.filter(i => i.invoice_type === typeFilter);
    if (statusFilter !== 'all') filtered = filtered.filter(i => i.status === statusFilter);

    document.getElementById('inv-count').textContent = invoices.length;
    document.getElementById('inv-total').textContent = '€' + invoices.reduce((s, i) => s + (i.total || 0), 0).toFixed(2);
    document.getElementById('inv-iva').textContent = '€' + invoices.reduce((s, i) => s + (i.iva_amount || 0), 0).toFixed(2);
    document.getElementById('inv-last').textContent = invoices[0] ? invoices[0].invoice_number : '—';

    if (filtered.length === 0) {
        grid.innerHTML = '<div style="grid-column: 1/-1; text-align:center; color: var(--text-gray); padding: 2rem;">No hay facturas</div>';
        return;
    }

    grid.innerHTML = filtered.map(inv => `
        <div class="invoice-card status-${inv.status}">
            <div class="invoice-header">
                <div class="invoice-number">${inv.invoice_number}</div>
                <span class="invoice-type-badge ${inv.invoice_type}">${inv.invoice_type}</span>
            </div>
            <div class="invoice-customer">${inv.customer_name}</div>
            <div class="invoice-nif">${inv.customer_nif || 'Sin NIF'}</div>
            <div class="invoice-details">
                📅 ${new Date(inv.invoice_date).toLocaleString('es-ES')}<br>
                💰 Total: <strong>€${inv.total.toFixed(2)}</strong> (IVA: €${inv.iva_amount.toFixed(2)})<br>
                 Estado: <strong>${inv.status}</strong>
            </div>
            <div class="invoice-actions">
                <button class="invoice-action-btn view" onclick="viewInvoice(${inv.id})">️ Ver</button>
                ${inv.status !== 'anulada' ? `<button class="invoice-action-btn send" onclick="sendInvoice(${inv.id})">📧 Enviar</button>` : ''}
                ${inv.status !== 'anulada' ? `<button class="invoice-action-btn void" onclick="voidInvoice(${inv.id})">✕ Anular</button>` : ''}
                <button class="invoice-action-btn print" onclick="printInvoiceById(${inv.id})">🖨️ PDF</button>
            </div>
        </div>
    `).join('');
}

async function viewInvoice(id) {
    const inv = invoices.find(i => i.id === id);
    if (!inv) return;
    currentInvoice = inv;
    document.getElementById('view-invoice-title').textContent = `Factura ${inv.invoice_number}`;
    document.getElementById('view-invoice-body').innerHTML = `
        <div class="invoice-view">
            <div class="invoice-view-header">
                <h2>${restaurantSettings.business_name}</h2>
                <p>${restaurantSettings.address}, ${restaurantSettings.postal_code} ${restaurantSettings.city} (${restaurantSettings.province})</p>
                <p>NIF: ${restaurantSettings.nif} | Tel: ${restaurantSettings.phone} | Email: ${restaurantSettings.email}</p>
            </div>
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:1rem; margin-bottom:1rem;">
                <div class="invoice-view-section">
                    <h4>Factura</h4>
                    <p><strong>Número:</strong> ${inv.invoice_number}</p>
                    <p><strong>Fecha:</strong> ${new Date(inv.invoice_date).toLocaleString('es-ES')}</p>
                    <p><strong>Tipo:</strong> ${inv.invoice_type}</p>
                    <p><strong>Estado:</strong> ${inv.status}</p>
                </div>
                <div class="invoice-view-section">
                    <h4>Cliente</h4>
                    <p><strong>Nombre:</strong> ${inv.customer_name}</p>
                    <p><strong>NIF:</strong> ${inv.customer_nif || '—'}</p>
                    <p><strong>Dirección:</strong> ${inv.customer_address || '—'}</p>
                    <p><strong>Email:</strong> ${inv.customer_email || '—'}</p>
                </div>
            </div>
            <div class="invoice-view-totals">
                <div class="summary-row"><span>Subtotal:</span><span>€${inv.subtotal.toFixed(2)}</span></div>
                <div class="summary-row"><span>IVA (${inv.iva_rate}%):</span><span>€${inv.iva_amount.toFixed(2)}</span></div>
                <div class="summary-row total"><span>TOTAL:</span><span>€${inv.total.toFixed(2)}</span></div>
            </div>
            <div class="invoice-view-hash">
                <strong>Hash (Ley Antifraude):</strong><br>
                Previous: ${inv.previous_hash}<br>
                Current: ${inv.current_hash}
            </div>
        </div>
    `;
    document.getElementById('view-invoice-modal').classList.add('active');
}

async function sendInvoice(id) {
    const inv = invoices.find(i => i.id === id);
    if (!inv) return;
    if (!inv.customer_email) return alert('El cliente no tiene email registrado');
    window.location.href = `mailto:${inv.customer_email}?subject=${encodeURIComponent(`Factura ${inv.invoice_number}`)}&body=${encodeURIComponent(`Factura ${inv.invoice_number} por €${inv.total.toFixed(2)}`)}`;
    await supabaseClient.from('invoices').update({ status: 'enviada' }).eq('id', id);
    loadInvoices();
    showToast('pago', '📧 Factura enviada', inv.invoice_number);
}

async function voidInvoice(id) {
    if (!confirm('¿Anular esta factura?')) return;
    await supabaseClient.from('invoices').update({ status: 'anulada' }).eq('id', id);
    loadInvoices();
    showToast('pago', '✕ Factura anulada', '');
}

async function printInvoiceById(id) {
    const inv = invoices.find(i => i.id === id);
    if (!inv) return;
    currentInvoice = inv;
    printInvoice();
}

function printInvoice() {
    if (!currentInvoice) return;
    const inv = currentInvoice;
    const w = window.open('', '_blank');
    w.document.write(`<!DOCTYPE html><html><head><title>Factura ${inv.invoice_number}</title><style>body{font-family:Arial;padding:2rem;max-width:800px;margin:0 auto}.header{text-align:center;border-bottom:2px solid #10b981;padding-bottom:1rem;margin-bottom:2rem}.header h1{color:#10b981;margin:0}.info-grid{display:grid;grid-template-columns:1fr 1fr;gap:2rem;margin-bottom:2rem}.info-box{background:#f9fafb;padding:1rem;border-radius:8px}.totals{background:#f9fafb;padding:1rem;border-radius:8px}.totals .row{display:flex;justify-content:space-between;margin-bottom:0.5rem}.totals .row.total{font-size:1.2rem;font-weight:800;border-top:1px solid #e5e7eb;padding-top:0.5rem;color:#10b981}.hash{font-size:0.7rem;color:#9ca3af;word-break:break-all;background:#f9fafb;padding:0.75rem;border-radius:6px;margin-top:2rem}</style></head><body><div class="header"><h1>${restaurantSettings.business_name}</h1><p>${restaurantSettings.address}, ${restaurantSettings.postal_code} ${restaurantSettings.city}</p><p>NIF: ${restaurantSettings.nif}</p></div><div class="info-grid"><div class="info-box"><h3>Factura</h3><p><strong>Número:</strong> ${inv.invoice_number}</p><p><strong>Fecha:</strong> ${new Date(inv.invoice_date).toLocaleString('es-ES')}</p><p><strong>Tipo:</strong> ${inv.invoice_type}</p></div><div class="info-box"><h3>Cliente</h3><p><strong>Nombre:</strong> ${inv.customer_name}</p><p><strong>NIF:</strong> ${inv.customer_nif || '—'}</p><p><strong>Email:</strong> ${inv.customer_email || '—'}</p></div></div><div class="totals"><div class="row"><span>Subtotal:</span><span>€${inv.subtotal.toFixed(2)}</span></div><div class="row"><span>IVA (${inv.iva_rate}%):</span><span>€${inv.iva_amount.toFixed(2)}</span></div><div class="row total"><span>TOTAL:</span><span>€${inv.total.toFixed(2)}</span></div></div><div class="hash"><strong>Hash:</strong><br>Previous: ${inv.previous_hash}<br>Current: ${inv.current_hash}</div></body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 500);
}

async function sendInvoiceByEmail() {
    if (!currentInvoice) return;
    const inv = currentInvoice;
    if (!inv.customer_email) return alert('El cliente no tiene email registrado');
    window.location.href = `mailto:${inv.customer_email}?subject=${encodeURIComponent(`Factura ${inv.invoice_number}`)}&body=${encodeURIComponent(`Factura ${inv.invoice_number} por €${inv.total.toFixed(2)}`)}`;
    await supabaseClient.from('invoices').update({ status: 'enviada' }).eq('id', inv.id);
    loadInvoices();
    showToast('pago', '📧 Factura enviada', inv.invoice_number);
}

// ============ RESERVAS ============
function setupReservationEvents() {
    document.getElementById('btn-add-reservation').addEventListener('click', () => openReservationModal());
    document.getElementById('btn-close-reservation').addEventListener('click', () => closeModal('reservation-modal'));
    document.getElementById('btn-cancel-reservation').addEventListener('click', () => closeModal('reservation-modal'));
    document.getElementById('btn-save-reservation').addEventListener('click', saveReservation);
    document.getElementById('res-date-filter').addEventListener('change', renderReservations);
    document.getElementById('res-status-filter').addEventListener('change', renderReservations);
}

async function loadReservations() {
    const { data } = await supabaseClient.from('reservations').select('*').order('reservation_date', { ascending: true }).order('reservation_time', { ascending: true });
    reservations = data || [];
    const select = document.getElementById('res-table-id');
    if (select) select.innerHTML = '<option value="">Sin asignar</option>' + tables.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
    renderReservations();
}

function renderReservations() {
    const grid = document.getElementById('reservations-grid');
    if (!grid) return;
    const dateFilter = document.getElementById('res-date-filter').value;
    const statusFilter = document.getElementById('res-status-filter').value;
    let filtered = reservations;
    if (dateFilter) filtered = filtered.filter(r => r.reservation_date === dateFilter);
    if (statusFilter !== 'all') filtered = filtered.filter(r => r.status === statusFilter);
    if (filtered.length === 0) { grid.innerHTML = '<div style="grid-column: 1/-1; text-align:center; color: var(--text-gray); padding: 2rem;">No hay reservas</div>'; return; }
    grid.innerHTML = filtered.map(r => {
        const table = tables.find(t => t.id === r.table_id);
        const dateStr = new Date(r.reservation_date + 'T00:00:00').toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });
        return `<div class="reservation-card status-${r.status}">
            <div class="res-header"><div class="res-name">${r.customer_name}</div><span class="res-status-badge">${r.status}</span></div>
            <div class="res-details">📅 ${dateStr} a las ${r.reservation_time}<br>👥 ${r.party_size} personas | 🪑 Mesa: ${table ? table.name : 'Sin asignar'}<br> ${r.phone || 'Sin teléfono'}${r.notes ? `<br>📝 ${r.notes}` : ''}</div>
            <div class="res-actions">
                ${r.status === 'pendiente' ? `<button class="res-action-btn confirm" onclick="updateReservationStatus(${r.id}, 'confirmada')">✓ Confirmar</button>` : ''}
                ${r.status !== 'cancelada' && r.status !== 'completada' ? `<button class="res-action-btn cancel" onclick="updateReservationStatus(${r.id}, 'cancelada')">✕ Cancelar</button>` : ''}
                ${r.status === 'confirmada' ? `<button class="res-action-btn confirm" onclick="updateReservationStatus(${r.id}, 'completada')">✓ Completada</button>` : ''}
                <button class="res-action-btn delete" onclick="deleteReservation(${r.id})">🗑️</button>
            </div>
        </div>`;
    }).join('');
}

function openReservationModal(res = null) {
    document.getElementById('reservation-modal-title').textContent = res ? 'Editar Reserva' : 'Nueva Reserva';
    document.getElementById('reservation-id').value = res ? res.id : '';
    document.getElementById('res-customer-name').value = res ? res.customer_name : '';
    document.getElementById('res-phone').value = res ? (res.phone || '') : '';
    document.getElementById('res-date').value = res ? res.reservation_date : new Date().toISOString().split('T')[0];
    document.getElementById('res-time').value = res ? res.reservation_time : '12:00';
    document.getElementById('res-party-size').value = res ? res.party_size : 2;
    document.getElementById('res-table-id').value = res ? (res.table_id || '') : '';
    document.getElementById('res-notes').value = res ? (res.notes || '') : '';
    document.getElementById('reservation-modal').classList.add('active');
}

async function saveReservation() {
    const id = document.getElementById('reservation-id').value;
    const customer_name = document.getElementById('res-customer-name').value.trim();
    const phone = document.getElementById('res-phone').value.trim();
    const reservation_date = document.getElementById('res-date').value;
    const reservation_time = document.getElementById('res-time').value;
    const party_size = parseInt(document.getElementById('res-party-size').value) || 1;
    const table_id = document.getElementById('res-table-id').value ? parseInt(document.getElementById('res-table-id').value) : null;
    const notes = document.getElementById('res-notes').value.trim();
    if (!customer_name || !reservation_date || !reservation_time) return alert('Nombre, fecha y hora son obligatorios');
    try {
        if (id) await supabaseClient.from('reservations').update({ customer_name, phone, reservation_date, reservation_time, party_size, table_id, notes }).eq('id', id);
        else await supabaseClient.from('reservations').insert([{ customer_name, phone, reservation_date, reservation_time, party_size, table_id, notes }]);
        closeModal('reservation-modal');
        loadReservations();
        showToast('pago', '✓ Reserva guardada', customer_name);
    } catch (error) { alert('Error: ' + error.message); }
}

async function updateReservationStatus(id, status) {
    await supabaseClient.from('reservations').update({ status }).eq('id', id);
    loadReservations();
    showToast('pago', `Reserva ${status}`, '');
}

async function deleteReservation(id) {
    if (!confirm('¿Eliminar esta reserva?')) return;
    await supabaseClient.from('reservations').delete().eq('id', id);
    loadReservations();
    showToast('pago', '🗑️ Reserva eliminada', '');
}

// ============ FIDELIDAD ============
function setupLoyaltySettingsEvents() {
    document.getElementById('btn-loyalty-settings').addEventListener('click', openLoyaltyModal);
    document.getElementById('btn-close-loyalty').addEventListener('click', () => closeModal('loyalty-settings-modal'));
    document.getElementById('btn-cancel-loyalty').addEventListener('click', () => closeModal('loyalty-settings-modal'));
    document.getElementById('btn-save-loyalty').addEventListener('click', saveLoyaltySettings);
    ['set-points-per-unit', 'set-point-value', 'set-birthday-mult'].forEach(id => {
        document.getElementById(id).addEventListener('input', updateLoyaltyPreview);
    });
}

function openLoyaltyModal() {
    document.getElementById('set-points-per-unit').value = loyaltySettings.points_per_unit;
    document.getElementById('set-point-value').value = loyaltySettings.point_value;
    document.getElementById('set-birthday-mult').value = loyaltySettings.birthday_multiplier;
    updateLoyaltyPreview();
    document.getElementById('loyalty-settings-modal').classList.add('active');
}

function updateLoyaltyPreview() {
    const ppu = parseFloat(document.getElementById('set-points-per-unit').value) || 0;
    const pv = parseFloat(document.getElementById('set-point-value').value) || 0;
    const bm = parseFloat(document.getElementById('set-birthday-mult').value) || 1;
    document.getElementById('loyalty-preview').innerHTML = `<strong>Resumen:</strong><br>• ${ppu} punto(s) por cada $1<br>• 100 puntos = $${Math.round(100 * pv).toLocaleString()}<br>• Cumpleaños: x${bm}<br><em>Ejemplo: $20.000 = ${Math.round(20000 * ppu)} puntos</em>`;
}

async function saveLoyaltySettings() {
    const points_per_unit = parseFloat(document.getElementById('set-points-per-unit').value) || 0;
    const point_value = parseFloat(document.getElementById('set-point-value').value) || 0;
    const birthday_multiplier = parseFloat(document.getElementById('set-birthday-mult').value) || 1;
    try {
        await supabaseClient.from('loyalty_settings').update({ points_per_unit, point_value, birthday_multiplier, updated_at: new Date().toISOString() }).eq('id', 1);
        loyaltySettings = { ...loyaltySettings, points_per_unit, point_value, birthday_multiplier };
        closeModal('loyalty-settings-modal');
        showToast('pago', '️ Reglas actualizadas', '');
    } catch (error) { alert('Error: ' + error.message); }
}

function setupCustomerEvents() {
    document.getElementById('btn-add-customer').addEventListener('click', () => openCustomerModal());
    document.getElementById('btn-close-customer').addEventListener('click', () => closeModal('customer-modal'));
    document.getElementById('btn-cancel-customer').addEventListener('click', () => closeModal('customer-modal'));
    document.getElementById('btn-save-customer').addEventListener('click', saveCustomer);
    document.getElementById('btn-close-history').addEventListener('click', () => closeModal('history-modal'));
    document.getElementById('btn-cancel-history').addEventListener('click', () => closeModal('history-modal'));
    document.getElementById('cust-search').addEventListener('input', renderCustomers);
    document.getElementById('customer-search').addEventListener('input', (e) => {
        const q = e.target.value.toLowerCase().trim();
        const box = document.getElementById('customer-suggestions');
        if (!q) { box.innerHTML = ''; return; }
        const matches = customers.filter(c => (c.name || '').toLowerCase().includes(q) || (c.phone || '').includes(q)).slice(0, 5);
        box.innerHTML = matches.map(c => `<div class="suggestion-item" onclick="selectCustomer(${c.id})"><span>${c.name} ${c.phone ? '· ' + c.phone : ''}</span><span class="suggestion-pts">${Math.round(c.points || 0)} pts</span></div>`).join('');
    });
    document.getElementById('btn-remove-customer').addEventListener('click', () => {
        selectedCustomer = null; redeemPoints = 0;
        document.getElementById('selected-customer').style.display = 'none';
        document.getElementById('redeem-row').style.display = 'none';
        document.getElementById('loyalty-search-box').style.display = 'block';
        document.getElementById('customer-search').value = '';
        document.getElementById('modal-discount-row').style.display = 'none';
        refreshPayTotals();
    });
    document.getElementById('redeem-points').addEventListener('input', (e) => {
        if (!selectedCustomer) return;
        let val = Math.max(0, Math.min(parseInt(e.target.value) || 0, Math.round(selectedCustomer.points || 0)));
        redeemPoints = val;
        document.getElementById('redeem-discount').textContent = '$' + Math.round(redeemPoints * loyaltySettings.point_value).toLocaleString();
        document.getElementById('modal-discount').textContent = '-$' + Math.round(redeemPoints * loyaltySettings.point_value).toLocaleString();
        document.getElementById('modal-discount-row').style.display = redeemPoints > 0 ? 'flex' : 'none';
        refreshPayTotals();
    });
}

async function loadCustomers() {
    const { data } = await supabaseClient.from('customers').select('*').order('name');
    customers = data || [];
    renderCustomers();
}

function isBirthday(c) {
    if (!c.birthday) return false;
    const b = new Date(c.birthday);
    const now = new Date();
    return b.getMonth() === now.getMonth() && b.getDate() === now.getDate();
}

function renderCustomers() {
    const grid = document.getElementById('customers-grid');
    if (!grid) return;
    const q = (document.getElementById('cust-search')?.value || '').trim().toLowerCase();
    document.getElementById('cust-total').textContent = customers.length;
    document.getElementById('cust-points').textContent = Math.round(customers.reduce((s, c) => s + (c.points || 0), 0)).toLocaleString();
    const top = [...customers].sort((a, b) => (b.total_spent || 0) - (a.total_spent || 0))[0];
    document.getElementById('cust-top').textContent = top ? top.name : '—';
    if (!q) {
        grid.innerHTML = `<div style="grid-column: 1/-1; text-align:center; color: var(--text-gray); padding: 3rem 1rem;"><div style="font-size: 2.5rem; margin-bottom: 0.5rem;">🔍</div>Escribe un nombre o teléfono para buscar un cliente<br><small>Hay ${customers.length} cliente(s) registrados</small></div>`;
        return;
    }
    const filtered = customers.filter(c => (c.name || '').toLowerCase().includes(q) || (c.phone || '').toLowerCase().includes(q) || (c.email || '').toLowerCase().includes(q));
    if (filtered.length === 0) {
        grid.innerHTML = `<div style="grid-column: 1/-1; text-align:center; color: var(--text-gray); padding: 2rem;">Sin resultados para "<strong>${q}</strong>"<br><button class="btn-secondary" style="margin-top:0.75rem;" onclick="clearCustomerSearch()">✕ Limpiar búsqueda</button></div>`;
        return;
    }
    grid.innerHTML = filtered.map(c => `
        <div class="customer-card ${isBirthday(c) ? 'birthday' : ''}">
            <div class="customer-header"><div class="customer-name">${isBirthday(c) ? '🎂 ' : ''}${c.name}</div><span class="customer-points-badge">${Math.round(c.points || 0)} pts</span></div>
            <div class="customer-phone">${c.phone || 'Sin teléfono'} ${c.email ? '· ' + c.email : ''}</div>
            <div class="customer-meta"><div>Visitas: <strong>${c.visits || 0}</strong></div><div>Gastado: <strong>$${Math.round(c.total_spent || 0).toLocaleString()}</strong></div></div>
            <div class="customer-actions">
                <button class="customer-action-btn edit" onclick="editCustomer(${c.id})">✏️ Editar</button>
                <button class="customer-action-btn history" onclick="viewHistory(${c.id})"> Historial</button>
                <button class="customer-action-btn" style="background:#fef2f2; color:#ef4444; border:1px solid #ef4444;" onclick="deleteCustomer(${c.id})">🗑️ Eliminar</button>
            </div>
        </div>
    `).join('');
}

function clearCustomerSearch() { document.getElementById('cust-search').value = ''; renderCustomers(); }

async function deleteCustomer(id) {
    const c = customers.find(x => x.id === id);
    if (!c) return;
    if (!confirm(`¿Eliminar a ${c.name}?\nSe borrará su historial de puntos.`)) return;
    await supabaseClient.from('points_history').delete().eq('customer_id', id);
    await supabaseClient.from('customers').delete().eq('id', id);
    loadCustomers();
    showToast('pago', '🗑️ Cliente eliminado', c.name);
}

function openCustomerModal(customer = null) {
    document.getElementById('customer-modal-title').textContent = customer ? 'Editar Cliente' : 'Nuevo Cliente';
    document.getElementById('customer-id').value = customer ? customer.id : '';
    document.getElementById('customer-name').value = customer ? customer.name : '';
    document.getElementById('customer-phone').value = customer ? (customer.phone || '') : '';
    document.getElementById('customer-email').value = customer ? (customer.email || '') : '';
    document.getElementById('customer-birthday').value = customer ? (customer.birthday || '') : '';
    document.getElementById('customer-modal').classList.add('active');
}

async function saveCustomer() {
    const id = document.getElementById('customer-id').value;
    const name = document.getElementById('customer-name').value.trim();
    const phone = document.getElementById('customer-phone').value.trim();
    const email = document.getElementById('customer-email').value.trim();
    const birthday = document.getElementById('customer-birthday').value || null;
    if (!name) return alert('El nombre es obligatorio');
    try {
        if (id) await supabaseClient.from('customers').update({ name, phone, email, birthday }).eq('id', id);
        else await supabaseClient.from('customers').insert([{ name, phone, email, birthday }]);
        closeModal('customer-modal');
        loadCustomers();
        showToast('pago', '✓ Cliente guardado', name);
    } catch (error) { alert('Error: ' + error.message); }
}

async function editCustomer(id) { const c = customers.find(x => x.id === id); if (c) openCustomerModal(c); }

async function viewHistory(id) {
    const c = customers.find(x => x.id === id);
    if (!c) return;
    document.getElementById('history-modal-title').textContent = `Historial - ${c.name}`;
    const { data } = await supabaseClient.from('points_history').select('*').eq('customer_id', id).order('created_at', { ascending: false });
    const list = data || [];
    document.getElementById('history-list').innerHTML = list.length === 0
        ? '<div style="text-align:center; color: var(--text-gray); padding: 1.5rem;">Sin movimientos de puntos</div>'
        : list.map(h => `<div class="history-item ${h.type}"><div><div>${h.type === 'ganados' ? '✅ Ganados' : '🎁 Canjeados'} ${h.note ? '· ' + h.note : ''}</div><div class="history-date">${new Date(h.created_at).toLocaleString('es-ES')}</div></div><span class="history-pts ${h.points >= 0 ? 'pos' : 'neg'}">${h.points >= 0 ? '+' : ''}${Math.round(h.points)}</span></div>`).join('');
    document.getElementById('history-modal').classList.add('active');
}

function selectCustomer(id) {
    selectedCustomer = customers.find(c => c.id === id) || null;
    redeemPoints = 0;
    document.getElementById('customer-suggestions').innerHTML = '';
    document.getElementById('customer-search').value = '';
    document.getElementById('loyalty-search-box').style.display = 'none';
    document.getElementById('selected-customer').style.display = 'flex';
    document.getElementById('sel-cust-name').textContent = selectedCustomer.name;
    document.getElementById('sel-cust-points').textContent = `${Math.round(selectedCustomer.points || 0)} puntos disponibles${isBirthday(selectedCustomer) ? ` · 🎂 ¡Cumpleaños hoy (x${loyaltySettings.birthday_multiplier})!` : ''}`;
    document.getElementById('redeem-row').style.display = 'block';
    document.getElementById('redeem-points').value = '';
    document.getElementById('redeem-discount').textContent = '$0';
    document.getElementById('modal-discount-row').style.display = 'none';
    updateRedeemLabel();
    refreshPayTotals();
}

function updateRedeemLabel() {
    document.getElementById('redeem-label').textContent = `Canjear puntos (100 pts = $${Math.round(100 * loyaltySettings.point_value)}):`;
}

function getBaseTotal() { return currentTableOrder ? currentTableOrder.total : cart.reduce((sum, i) => sum + (i.price * i.qty), 0); }

function refreshPayTotals() {
    const base = getBaseTotal();
    const discount = redeemPoints * loyaltySettings.point_value;
    const final = Math.max(0, base - discount);
    document.getElementById('modal-total').textContent = '$' + Math.round(final).toLocaleString();
    const received = parseFloat(document.getElementById('cash-received').value) || 0;
    document.getElementById('change-amount').textContent = '$' + Math.max(0, Math.round(received - final)).toLocaleString();
}

async function applyLoyalty(orderId, finalTotal) {
    if (!selectedCustomer) return null;
    const bday = isBirthday(selectedCustomer);
    let earned = Math.round(finalTotal * loyaltySettings.points_per_unit);
    if (bday) earned = Math.round(earned * loyaltySettings.birthday_multiplier);
    const newPoints = (selectedCustomer.points || 0) - redeemPoints + earned;
    await supabaseClient.from('customers').update({ points: newPoints, total_spent: (selectedCustomer.total_spent || 0) + finalTotal, visits: (selectedCustomer.visits || 0) + 1 }).eq('id', selectedCustomer.id);
    if (redeemPoints > 0) await supabaseClient.from('points_history').insert([{ customer_id: selectedCustomer.id, order_id: orderId, points: -redeemPoints, type: 'canjeados', note: 'Descuento en compra' }]);
    await supabaseClient.from('points_history').insert([{ customer_id: selectedCustomer.id, order_id: orderId, points: earned, type: 'ganados', note: bday ? `Puntos x${loyaltySettings.birthday_multiplier} cumpleaños` : 'Compra' }]);
    if (bday) addNotification('pago', ` ¡Cumpleaños de ${selectedCustomer.name}!`, 'Puntos multiplicados');
    const result = { name: selectedCustomer.name, earned, newBalance: newPoints };
    selectedCustomer = null; redeemPoints = 0;
    return result;
}

function resetLoyaltyUI() {
    selectedCustomer = null; redeemPoints = 0;
    document.getElementById('selected-customer').style.display = 'none';
    document.getElementById('redeem-row').style.display = 'none';
    document.getElementById('loyalty-search-box').style.display = 'block';
    document.getElementById('customer-search').value = '';
    document.getElementById('customer-suggestions').innerHTML = '';
    document.getElementById('modal-discount-row').style.display = 'none';
    updateRedeemLabel();
}

// ============ QR DE MESA ============
function openTableQR(tableId, tableName) {
    currentQRTable = { id: tableId, name: tableName };
    document.getElementById('qr-table-title').textContent = `QR - ${tableName}`;
    const container = document.getElementById('qr-table-code');
    container.innerHTML = '';
    new QRCode(container, { text: `${window.location.origin}/menu.html?mesa=${tableId}`, width: 200, height: 200, correctLevel: QRCode.CorrectLevel.M });
    document.getElementById('qr-table-modal').classList.add('active');
}

function setupQREvents() {
    document.getElementById('btn-close-qr-table').addEventListener('click', () => closeModal('qr-table-modal'));
    document.getElementById('btn-print-qr').addEventListener('click', () => {
        if (!currentQRTable) return;
        const url = `${window.location.origin}/menu.html?mesa=${currentQRTable.id}`;
        const win = window.open('', '_blank');
        win.document.write(`<html><head><title>QR ${currentQRTable.name}</title><style>body{font-family:sans-serif;text-align:center;padding:2rem;}</style></head><body><h2> TPV Punto Verde</h2><p>${currentQRTable.name} - Escanea para pedir</p><div id="q"></div><p style="font-size:0.7rem;margin-top:1rem;">${url}</p><script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"><\/script><script>new QRCode(document.getElementById('q'),{text:'${url}',width:250,height:250});setTimeout(()=>window.print(),600);<\/script></body></html>`);
        win.document.close();
    });
}

// ============ DIVIDIR CUENTA ============
function setupDivideEvents() {
    document.getElementById('btn-divide-account').addEventListener('click', openDivideModal);
    document.getElementById('btn-close-divide').addEventListener('click', () => closeModal('divide-modal'));
    document.getElementById('btn-cancel-divide').addEventListener('click', () => closeModal('divide-modal'));
    document.getElementById('btn-add-diner').addEventListener('click', addDiner);
    document.getElementById('btn-pay-all').addEventListener('click', () => { closeModal('divide-modal'); openPayModalForTable(); });
    document.getElementById('btn-close-diner-pay').addEventListener('click', () => closeModal('diner-pay-modal'));
    document.getElementById('btn-cancel-diner-pay').addEventListener('click', () => closeModal('diner-pay-modal'));
    document.getElementById('btn-confirm-diner-pay').addEventListener('click', confirmDinerPayment);
    document.querySelectorAll('#diner-method-buttons .method-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('#diner-method-buttons .method-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            currentDinerPayMethod = e.target.dataset.method;
            document.getElementById('diner-cash-section').style.display = currentDinerPayMethod === 'efectivo' ? 'block' : 'none';
        });
    });
    document.getElementById('diner-cash-received').addEventListener('input', (e) => {
        const diner = diners.find(d => d.id === currentDinerPayId);
        if (!diner) return;
        const total = diner.items.reduce((s, i) => s + (i.price * i.qty), 0);
        const received = parseFloat(e.target.value) || 0;
        document.getElementById('diner-change-amount').textContent = '$' + Math.max(0, Math.round(received - total)).toLocaleString();
    });
}

function openDivideModal() {
    if (!currentTableOrder || !currentTableOrder.order_items || currentTableOrder.order_items.length === 0) return alert('No hay productos en el pedido');
    diners = [{ id: 1, name: 'Comensal 1', items: [] }, { id: 2, name: 'Comensal 2', items: [] }];
    unassignedItems = currentTableOrder.order_items.map((item, idx) => ({ uid: idx, orderItemId: item.id, name: item.name, price: item.price, qty: item.qty }));
    renderDivideModal();
    document.getElementById('divide-modal').classList.add('active');
}

function addDiner() { const newId = diners.length > 0 ? Math.max(...diners.map(d => d.id)) + 1 : 1; diners.push({ id: newId, name: `Comensal ${newId}`, items: [] }); renderDivideModal(); }
function removeDiner(dinerId) { const diner = diners.find(d => d.id === dinerId); if (!diner) return; unassignedItems.push(...diner.items); diners = diners.filter(d => d.id !== dinerId); renderDivideModal(); }
function assignItemToDiner(uid, dinerId) { const itemIdx = unassignedItems.findIndex(i => i.uid === uid); if (itemIdx === -1) return; const item = unassignedItems.splice(itemIdx, 1)[0]; const diner = diners.find(d => d.id === dinerId); if (diner) diner.items.push(item); renderDivideModal(); }
function removeItemFromDiner(uid, dinerId) { const diner = diners.find(d => d.id === dinerId); if (!diner) return; const itemIdx = diner.items.findIndex(i => i.uid === uid); if (itemIdx === -1) return; const item = diner.items.splice(itemIdx, 1)[0]; unassignedItems.push(item); renderDivideModal(); }
function updateDinerName(dinerId, newName) { const diner = diners.find(d => d.id === dinerId); if (diner) diner.name = newName; }

function renderDivideModal() {
    const dinersList = document.getElementById('diners-list');
    const unassignedList = document.getElementById('unassigned-items');
    dinersList.innerHTML = diners.map(diner => {
        const total = diner.items.reduce((s, i) => s + (i.price * i.qty), 0);
        const itemsHtml = diner.items.map(item => `<div class="diner-item"><span class="diner-item-name">${item.qty}x ${item.name}</span><span>$${Math.round(item.price * item.qty).toLocaleString()}</span><div class="diner-item-controls"><button class="diner-item-btn remove" onclick="removeItemFromDiner(${item.uid}, ${diner.id})">✕</button></div></div>`).join('');
        return `<div class="diner-card"><div class="diner-header"><div class="diner-name"><input type="text" value="${diner.name}" onchange="updateDinerName(${diner.id}, this.value)"></div><div style="display:flex; align-items:center; gap:0.5rem;"><span class="diner-total">$${Math.round(total).toLocaleString()}</span>${total > 0 ? `<button class="btn-cobrar-diner" onclick="openDinerPayModal(${diner.id})">💰 Cobrar</button>` : ''}${diners.length > 1 ? `<button class="btn-remove-diner" onclick="removeDiner(${diner.id})">🗑️</button>` : ''}</div></div><div class="diner-items">${itemsHtml || '<div style="color: var(--text-gray); font-size: 0.8rem; text-align: center; padding: 0.5rem;">Sin productos</div>'}</div></div>`;
    }).join('');
    if (unassignedItems.length === 0) { unassignedList.innerHTML = '<div style="color: var(--text-gray); text-align: center; padding: 1rem;">Todos los productos asignados ✓</div>'; }
    else { unassignedList.innerHTML = unassignedItems.map(item => `<div class="unassigned-item"><div class="unassigned-item-info"><div class="unassigned-item-name">${item.qty}x ${item.name}</div><div class="unassigned-item-price">$${Math.round(item.price * item.qty).toLocaleString()}</div></div><select onchange="assignItemToDiner(${item.uid}, parseInt(this.value)); this.value='';" style="padding: 0.3rem; border-radius: 4px; border: 1px solid var(--border);"><option value="">Asignar a...</option>${diners.map(d => `<option value="${d.id}">${d.name}</option>`).join('')}</select></div>`).join(''); }
    document.getElementById('btn-pay-all').textContent = `💰 Cobrar Todo ($${Math.round(currentTableOrder.total).toLocaleString()})`;
}

async function openDinerPayModal(dinerId) {
    const diner = diners.find(d => d.id === dinerId);
    if (!diner || diner.items.length === 0) return alert('Este comensal no tiene productos');
    currentDinerPayId = dinerId; currentDinerPayMethod = 'efectivo';
    document.getElementById('diner-pay-title').textContent = `Cobrar ${diner.name}`;
    document.getElementById('diner-cart-items').innerHTML = diner.items.map(item => `<div class="cart-item"><div class="cart-item-name">${item.qty}x ${item.name}</div><div class="cart-item-price">$${Math.round(item.price * item.qty).toLocaleString()}</div></div>`).join('');
    document.getElementById('diner-total').textContent = '$' + Math.round(diner.items.reduce((s, i) => s + (i.price * i.qty), 0)).toLocaleString();
    document.getElementById('diner-cash-received').value = '';
    document.getElementById('diner-change-amount').textContent = '$0';
    document.querySelectorAll('#diner-method-buttons .method-btn').forEach(b => b.classList.remove('active'));
    document.querySelector('#diner-method-buttons .method-btn[data-method="efectivo"]').classList.add('active');
    document.getElementById('diner-cash-section').style.display = 'block';
    document.getElementById('diner-pay-modal').classList.add('active');
}

async function confirmDinerPayment() {
    const diner = diners.find(d => d.id === currentDinerPayId);
    if (!diner) return;
    const total = diner.items.reduce((s, i) => s + (i.price * i.qty), 0);
    if (currentDinerPayMethod === 'efectivo') { const cashReceived = parseFloat(document.getElementById('diner-cash-received').value); if (!cashReceived || cashReceived < total) return alert('Efectivo insuficiente'); }
    try {
        const { data: order, error: orderError } = await supabaseClient.from('orders').insert([{ type: 'mesa', status: 'nuevo', total, paid: true, pay_method: currentDinerPayMethod, source: 'tpv', user_email: currentUser?.email, table_id: activeTableId, diner_name: diner.name }]).select().single();
        if (orderError) throw orderError;
        await supabaseClient.from('order_items').insert(diner.items.map(item => ({ order_id: order.id, name: item.name, price: item.price, qty: item.qty })));
        printTicket(order, diner.items, null);
        await deductInventory(diner.items);
        await recordEmployeeSale(order.id, total);
        const remainingItems = currentTableOrder.order_items.filter(origItem => !diner.items.some(dinerItem => dinerItem.orderItemId === origItem.id));
        const newTotal = remainingItems.reduce((s, i) => s + (i.price * i.qty), 0);
        if (remainingItems.length === 0) { await supabaseClient.from('orders').update({ status: 'entregado', paid: true }).eq('id', currentTableOrder.id); await supabaseClient.from('tables').update({ status: 'libre', current_order_id: null }).eq('id', activeTableId); currentTableOrder = null; }
        else { await supabaseClient.from('orders').update({ total: newTotal }).eq('id', currentTableOrder.id); await supabaseClient.from('order_items').delete().in('id', diner.items.map(i => i.orderItemId)); currentTableOrder.order_items = remainingItems; currentTableOrder.total = newTotal; }
        addNotification('pago', `✓ ${diner.name} pagó`, `$${Math.round(total).toLocaleString()} | ${currentDinerPayMethod.toUpperCase()}`);
        closeModal('diner-pay-modal'); closeModal('divide-modal'); renderCart(); renderTableOrder(); loadTables();
    } catch (error) { alert('Error: ' + error.message); }
}

// ============ INVENTARIO ============
function setupInventoryEvents() {
    document.getElementById('btn-add-ingredient').addEventListener('click', () => openIngredientModal());
    document.getElementById('btn-close-ingredient').addEventListener('click', () => closeModal('ingredient-modal'));
    document.getElementById('btn-cancel-ingredient').addEventListener('click', () => closeModal('ingredient-modal'));
    document.getElementById('btn-save-ingredient').addEventListener('click', saveIngredient);
    document.getElementById('btn-close-recipe').addEventListener('click', () => closeModal('recipe-modal'));
    document.getElementById('btn-cancel-recipe').addEventListener('click', () => closeModal('recipe-modal'));
    document.getElementById('btn-add-recipe-item').addEventListener('click', addRecipeItem);
    document.getElementById('inv-search').addEventListener('input', renderInventory);
    document.getElementById('inv-filter-status').addEventListener('change', renderInventory);
}

async function loadIngredients() {
    const { data: ingData } = await supabaseClient.from('ingredients').select('*').order('name');
    ingredients = ingData || [];
    const { data: recData } = await supabaseClient.from('recipes').select('*');
    recipes = recData || [];
    renderInventory();
}

function getIngredientStatus(ing) { if (ing.stock <= 0) return 'out'; if (ing.stock <= ing.min_stock) return 'low'; return 'ok'; }

function renderInventory() {
    const grid = document.getElementById('inventory-grid');
    if (!grid) return;
    const search = (document.getElementById('inv-search')?.value || '').toLowerCase();
    const filter = document.getElementById('inv-filter-status')?.value || 'all';
    const filtered = ingredients.filter(ing => { const matchSearch = ing.name.toLowerCase().includes(search); const status = getIngredientStatus(ing); const matchFilter = filter === 'all' || status === filter; return matchSearch && matchFilter; });
    document.getElementById('inv-total').textContent = ingredients.length;
    document.getElementById('inv-ok').textContent = ingredients.filter(i => getIngredientStatus(i) === 'ok').length;
    document.getElementById('inv-low').textContent = ingredients.filter(i => getIngredientStatus(i) === 'low').length;
    document.getElementById('inv-out').textContent = ingredients.filter(i => getIngredientStatus(i) === 'out').length;
    if (filtered.length === 0) { grid.innerHTML = '<div style="grid-column: 1/-1; text-align:center; color: var(--text-gray); padding: 2rem;">No hay ingredientes</div>'; return; }
    grid.innerHTML = filtered.map(ing => {
        const status = getIngredientStatus(ing);
        const statusClass = status === 'out' ? 'stock-out' : status === 'low' ? 'stock-low' : '';
        const unitLabel = ing.unit === 'gramo' ? 'g' : ing.unit === 'kilogramo' ? 'kg' : ing.unit === 'litro' ? 'L' : ing.unit === 'mililitro' ? 'ml' : 'und';
        return `<div class="ingredient-card ${statusClass}"><div class="ingredient-header"><div class="ingredient-name">${ing.name}</div><div class="ingredient-actions"><button class="ingredient-action-btn" onclick="editIngredient(${ing.id})">️</button><button class="ingredient-action-btn" onclick="deleteIngredient(${ing.id})">🗑️</button></div></div><div class="ingredient-stock">${ing.stock} <span>${unitLabel}</span></div><div class="ingredient-meta"><span>Mínimo: ${ing.min_stock} ${unitLabel}</span><span class="ingredient-cost">$${ing.cost_per_unit}/${unitLabel}</span></div><button class="ingredient-recipe-btn" onclick="openRecipeModal(${ing.id})">📋 Ver Recetas</button></div>`;
    }).join('');
}

function openIngredientModal(ingredient = null) {
    document.getElementById('ingredient-modal-title').textContent = ingredient ? 'Editar Ingrediente' : 'Nuevo Ingrediente';
    document.getElementById('ingredient-id').value = ingredient ? ingredient.id : '';
    document.getElementById('ingredient-name').value = ingredient ? ingredient.name : '';
    document.getElementById('ingredient-stock').value = ingredient ? ingredient.stock : 0;
    document.getElementById('ingredient-unit').value = ingredient ? ingredient.unit : 'unidad';
    document.getElementById('ingredient-min-stock').value = ingredient ? ingredient.min_stock : 0;
    document.getElementById('ingredient-cost').value = ingredient ? ingredient.cost_per_unit : 0;
    document.getElementById('ingredient-modal').classList.add('active');
}

async function saveIngredient() {
    const id = document.getElementById('ingredient-id').value;
    const name = document.getElementById('ingredient-name').value.trim();
    const stock = parseFloat(document.getElementById('ingredient-stock').value) || 0;
    const unit = document.getElementById('ingredient-unit').value;
    const min_stock = parseFloat(document.getElementById('ingredient-min-stock').value) || 0;
    const cost_per_unit = parseFloat(document.getElementById('ingredient-cost').value) || 0;
    if (!name) return alert('El nombre es obligatorio');
    try {
        if (id) await supabaseClient.from('ingredients').update({ name, stock, unit, min_stock, cost_per_unit }).eq('id', id);
        else await supabaseClient.from('ingredients').insert([{ name, stock, unit, min_stock, cost_per_unit }]);
        closeModal('ingredient-modal'); loadIngredients(); showToast('pago', '✓ Ingrediente guardado', name);
    } catch (error) { alert('Error: ' + error.message); }
}

async function editIngredient(id) { const ing = ingredients.find(i => i.id === id); if (ing) openIngredientModal(ing); }
async function deleteIngredient(id) { if (!confirm('¿Eliminar este ingrediente?')) return; try { await supabaseClient.from('recipes').delete().eq('ingredient_id', id); await supabaseClient.from('ingredients').delete().eq('id', id); loadIngredients(); showToast('pago', '🗑️ Ingrediente eliminado', ''); } catch (error) { alert('Error: ' + error.message); } }

async function openRecipeModal(ingredientId) {
    const ing = ingredients.find(i => i.id === ingredientId);
    if (!ing) return;
    const { data: prods } = await supabaseClient.from('products').select('*').eq('active', true);
    const allProducts = prods || [];
    document.getElementById('recipe-modal-title').textContent = `Recetas que usan: ${ing.name}`;
    const select = document.getElementById('recipe-ingredient-select');
    select.innerHTML = '<option value="">Seleccionar ingrediente...</option>' + ingredients.filter(i => i.id !== ingredientId).map(i => `<option value="${i.id}">${i.name} (${i.stock} ${i.unit})</option>`).join('');
    const productIds = recipes.filter(r => r.ingredient_id === ingredientId).map(r => r.product_id);
    const relatedProducts = allProducts.filter(p => productIds.includes(p.id));
    const infoDiv = document.getElementById('recipe-product-info');
    if (relatedProducts.length === 0) { infoDiv.innerHTML = `<div style="color: var(--text-gray);">Este ingrediente no está asociado a ningún producto aún.</div>`; }
    else { infoDiv.innerHTML = `<div>Productos que usan ${ing.name}:</div>` + relatedProducts.map(p => `<div style="font-size: 0.9rem; padding: 0.25rem 0;">• ${p.name}</div>`).join(''); }
    document.getElementById('recipe-items-list').innerHTML = '';
    document.getElementById('recipe-modal').classList.add('active');
}

async function addRecipeItem() {
    const ingredientId = parseInt(document.getElementById('recipe-ingredient-select').value);
    const quantity = parseFloat(document.getElementById('recipe-quantity').value);
    if (!ingredientId || !quantity || quantity <= 0) return alert('Selecciona un ingrediente y cantidad válida');
    try {
        const { data: prods } = await supabaseClient.from('products').select('*').eq('active', true);
        for (const p of (prods || [])) { await supabaseClient.from('recipes').insert([{ product_id: p.id, ingredient_id: ingredientId, quantity }]); }
        document.getElementById('recipe-quantity').value = '';
        document.getElementById('recipe-ingredient-select').value = '';
        showToast('pago', '✓ Ingrediente agregado a recetas', '');
        loadIngredients();
    } catch (error) { alert('Error: ' + error.message); }
}

async function deductInventory(items) {
    try {
        for (const item of items) {
            const productRecipes = recipes.filter(r => r.product_id === item.id);
            for (const recipe of productRecipes) {
                const qtyToDeduct = recipe.quantity * item.qty;
                const { data: ing } = await supabaseClient.from('ingredients').select('stock, min_stock, name').eq('id', recipe.ingredient_id).single();
                if (!ing) continue;
                const newStock = Math.max(0, ing.stock - qtyToDeduct);
                await supabaseClient.from('ingredients').update({ stock: newStock }).eq('id', recipe.ingredient_id);
                if (newStock <= ing.min_stock && newStock > 0) addNotification('alerta', '⚠️ Stock Bajo', `${ing.name} quedó con ${newStock} (mínimo: ${ing.min_stock})`);
                else if (newStock === 0) addNotification('alerta', '🚨 Agotado', `${ing.name} se agotó`);
            }
        }
        loadIngredients();
    } catch (error) { console.error('Error descontando inventario:', error); }
}

// ============ PERSONAL ============
function setupStaffEvents() {
    document.getElementById('btn-add-staff').addEventListener('click', () => openStaffModal());
    document.getElementById('btn-close-staff').addEventListener('click', () => closeModal('staff-modal'));
    document.getElementById('btn-cancel-staff').addEventListener('click', () => closeModal('staff-modal'));
    document.getElementById('btn-save-staff').addEventListener('click', saveStaff);
}

async function loadStaff() {
    const { data: staffData } = await supabaseClient.from('profiles').select('*').order('full_name');
    staffList = staffData || [];
    const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0,0,0,0);
    const { data: salesData } = await supabaseClient.from('employee_sales').select('*').gte('created_at', monthStart.toISOString());
    staffSales = salesData || [];
    renderStaff();
}

function renderStaff() {
    const grid = document.getElementById('staff-grid');
    if (!grid) return;
    document.getElementById('staff-total').textContent = staffList.length;
    document.getElementById('staff-active').textContent = staffList.filter(s => s.active).length;
    const totalCommissions = staffSales.reduce((s, v) => s + (v.commission || 0), 0);
    document.getElementById('staff-commissions').textContent = '$' + Math.round(totalCommissions).toLocaleString();
    if (staffList.length === 0) { grid.innerHTML = '<div style="grid-column: 1/-1; text-align:center; color: var(--text-gray); padding: 2rem;">No hay empleados registrados</div>'; return; }
    grid.innerHTML = staffList.map(s => {
        const sales = staffSales.filter(v => v.employee_id === s.id);
        const monthSales = sales.reduce((sum, v) => sum + (v.amount || 0), 0);
        const monthComm = sales.reduce((sum, v) => sum + (v.commission || 0), 0);
        return `<div class="staff-card ${s.active ? '' : 'inactive'}">
            <div class="staff-header"><div class="staff-name">${s.full_name || s.email}</div><span class="staff-role-badge staff-role-${s.role}">${s.role}</span></div>
            <div class="staff-email">${s.email}</div>
            <div class="staff-meta"><span>Ventas mes: <strong>$${Math.round(monthSales).toLocaleString()}</strong></span><span class="staff-commission">Comisión: $${Math.round(monthComm).toLocaleString()}</span></div>
            <div class="staff-meta"><span>Rate: ${s.commission_rate || 0}%</span><span>${s.active ? '✅ Activo' : '⛔ Inactivo'}</span></div>
            <div class="staff-actions"><button class="staff-action-btn edit" onclick="editStaff('${s.id}')">✏️ Editar</button><button class="staff-action-btn delete" onclick="deleteStaff('${s.id}')">🗑️ Eliminar</button></div>
        </div>`;
    }).join('');
}

function openStaffModal(staff = null) {
    document.getElementById('staff-modal-title').textContent = staff ? 'Editar Empleado' : 'Nuevo Empleado';
    document.getElementById('staff-id').value = staff ? staff.id : '';
    document.getElementById('staff-name').value = staff ? (staff.full_name || '') : '';
    document.getElementById('staff-email').value = staff ? staff.email : '';
    document.getElementById('staff-password').value = '';
    document.getElementById('staff-role').value = staff ? staff.role : 'cajero';
    document.getElementById('staff-commission').value = staff ? (staff.commission_rate || 0) : 0;
    document.getElementById('staff-active').value = staff ? String(staff.active) : 'true';
    document.getElementById('staff-modal').classList.add('active');
}

async function saveStaff() {
    const id = document.getElementById('staff-id').value;
    const full_name = document.getElementById('staff-name').value.trim();
    const email = document.getElementById('staff-email').value.trim();
    const password = document.getElementById('staff-password').value;
    const role = document.getElementById('staff-role').value;
    const commission_rate = parseFloat(document.getElementById('staff-commission').value) || 0;
    const active = document.getElementById('staff-active').value === 'true';
    if (!full_name || !email) return alert('Nombre y email son obligatorios');
    try {
        if (id) { await supabaseClient.from('profiles').update({ full_name, email, role, commission_rate, active }).eq('id', id); }
        else {
            if (!password || password.length < 6) return alert('La contraseña debe tener al menos 6 caracteres');
            const { data: newUser, error: authError } = await supabaseClient.auth.signUp({ email, password });
            if (authError) throw authError;
            await supabaseClient.from('profiles').insert([{ id: newUser.user.id, email, full_name, role, commission_rate, active }]);
        }
        closeModal('staff-modal'); loadStaff(); showToast('pago', '✓ Empleado guardado', full_name);
    } catch (error) { alert('Error: ' + error.message); }
}

async function editStaff(id) { const s = staffList.find(x => x.id === id); if (s) openStaffModal(s); }
async function deleteStaff(id) {
    if (id === currentUser.id) return alert('No puedes eliminar tu propia cuenta');
    if (!confirm('¿Eliminar este empleado?')) return;
    await supabaseClient.from('profiles').delete().eq('id', id);
    loadStaff();
    showToast('pago', '🗑️ Empleado eliminado', '');
}

async function recordEmployeeSale(orderId, amount) {
    if (!currentProfile) return;
    const commission = amount * ((currentProfile.commission_rate || 0) / 100);
    await supabaseClient.from('employee_sales').insert([{ order_id: orderId, employee_id: currentProfile.id, amount, commission }]);
}

// ============ PRODUCTOS Y CARRITO (CAJA) ============
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
    if (!bar) return;
    bar.innerHTML = '<button class="cat-btn active" data-cat="all">Todos</button>';
    cats.forEach(cat => { if (cat) { const btn = document.createElement('button'); btn.className = 'cat-btn'; btn.dataset.cat = cat; btn.textContent = cat; bar.appendChild(btn); } });
}

function renderProducts() {
    const grid = document.getElementById('product-grid');
    if (!grid) return;
    const filtered = currentCategory === 'all' ? products : products.filter(p => p.category === currentCategory);
    grid.innerHTML = filtered.map(p => {
        const allergenIds = productAllergens[p.id] || [];
        const allergenBadges = allergenIds.map(aid => {
            const allergen = allergens.find(a => a.id === aid);
            return allergen ? `<span style="font-size:0.7rem; background:#fef3c7; padding:0.1rem 0.3rem; border-radius:3px; margin-left:0.2rem;">${allergen.icon}</span>` : '';
        }).join('');
        const imgUrl = p.image_url || 'https://via.placeholder.com/120x60?text=Sin+Imagen';
        return `<div class="product-card" data-id="${p.id}"><img class="product-img" src="${imgUrl}" alt="${p.name}"><div class="product-name">${p.name}${allergenBadges}</div><div class="product-price">$${Number(p.price).toLocaleString()}</div></div>`;
    }).join('');
}

function addToCart(productId) {
    const product = products.find(p => p.id === productId);
    if (!product) return;
    const existing = cart.find(i => i.id === productId);
    if (existing) { existing.qty++; } else { cart.push({ ...product, qty: 1 }); }
    renderCart(); renderTableOrder();
}

function renderCart() {
    const container = document.getElementById('cart-items');
    if (!container) return;
    if (cart.length === 0) { container.innerHTML = '<div class="empty-cart">Añade productos para empezar</div>'; updateTotals(0); return; }
    container.innerHTML = cart.map(item => `<div class="cart-item"><div><div class="cart-item-name">${item.name}</div><div class="qty-controls"><button class="qty-btn" onclick="changeQty(${item.id}, -1)">−</button><span>${item.qty}</span><button class="qty-btn" onclick="changeQty(${item.id}, 1)">+</button></div></div><div class="cart-item-price">$${(item.price * item.qty).toLocaleString()}</div></div>`).join('');
    updateTotals(cart.reduce((sum, i) => sum + (i.price * i.qty), 0));
}

function changeQty(id, delta) {
    const item = cart.find(i => i.id === id);
    if (!item) return;
    item.qty += delta;
    if (item.qty <= 0) cart = cart.filter(i => i.id !== id);
    renderCart(); renderTableOrder();
}

function updateTotals(total) {
    const tax = total * 0.19;
    document.getElementById('subtotal').textContent = '$' + Math.round(total - tax).toLocaleString();
    document.getElementById('tax').textContent = '$' + Math.round(tax).toLocaleString();
    document.getElementById('total').textContent = '$' + Math.round(total).toLocaleString();
    const btnPay = document.getElementById('btn-pay');
    if (activeTableId) { btnPay.textContent = currentTableOrder ? `AÑADIR MÁS A MESA ($${Math.round(total).toLocaleString()})` : `AÑADIR A MESA ($${Math.round(total).toLocaleString()})`; }
    else { btnPay.textContent = `COBRAR ($${Math.round(total).toLocaleString()})`; }
}

function setupPOSEvents() {
    document.getElementById('product-grid').addEventListener('click', e => { const card = e.target.closest('.product-card'); if (card) addToCart(Number(card.dataset.id)); });
    document.getElementById('categories-bar').addEventListener('click', e => { const btn = e.target.closest('.cat-btn'); if (btn) { document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active')); btn.classList.add('active'); currentCategory = btn.dataset.cat; renderProducts(); } });
    document.getElementById('btn-clear').addEventListener('click', () => { if (cart.length > 0 && confirm('¿Limpiar carrito?')) { cart = []; renderCart(); renderTableOrder(); } });
    document.getElementById('btn-pay').addEventListener('click', () => { if (activeTableId) addToTable(); else openPayModal(); });
    document.getElementById('btn-close-modal').addEventListener('click', () => closeModal('pay-modal'));
    document.getElementById('btn-cancel-pay').addEventListener('click', () => closeModal('pay-modal'));
    document.querySelectorAll('.type-btn').forEach(btn => btn.addEventListener('click', (e) => { document.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active')); e.target.classList.add('active'); orderType = e.target.dataset.type; }));
    document.querySelectorAll('.method-btn').forEach(btn => btn.addEventListener('click', (e) => { document.querySelectorAll('.method-btn').forEach(b => b.classList.remove('active')); e.target.classList.add('active'); payMethod = e.target.dataset.method; document.getElementById('cash-section').style.display = payMethod === 'efectivo' ? 'block' : 'none'; }));
    document.getElementById('cash-received').addEventListener('input', (e) => {
        const base = getBaseTotal();
        const discount = redeemPoints * loyaltySettings.point_value;
        const final = Math.max(0, base - discount);
        const received = parseFloat(e.target.value) || 0;
        document.getElementById('change-amount').textContent = '$' + Math.max(0, Math.round(received - final)).toLocaleString();
    });
    document.getElementById('btn-confirm-pay').addEventListener('click', () => { if (currentTableOrder) confirmPaymentForTable(); else confirmPayment(); });
}

// ============ MESAS ============
async function loadTables() {
    const { data: tablesData, error: tablesError } = await supabaseClient.from('tables').select('*').order('id');
    if (tablesError) return;
    const { data: ordersData, error: ordersError } = await supabaseClient.from('orders').select('*, order_items(*)').eq('paid', false).neq('status', 'entregado');
    if (ordersError) return;
    const ordersByTable = {};
    (ordersData || []).forEach(order => { 
        if (order.table_id) { 
            if (!ordersByTable[order.table_id]) ordersByTable[order.table_id] = []; 
            ordersByTable[order.table_id].push(order); 
        } 
    });
    tables = (tablesData || []).map(table => {
        const tableOrders = ordersByTable[table.id] || [];
        const pendingItems = tableOrders.flatMap(o => o.order_items || []);
        const pendingTotal = tableOrders.reduce((sum, o) => sum + (o.total || 0), 0);
        let visualStatus = pendingItems.length > 0 ? 'ocupada' : 'libre';
        const today = new Date().toISOString().split('T')[0];
        if (reservations.some(r => r.table_id === table.id && r.reservation_date === today && r.status === 'confirmada')) visualStatus = 'reservada';
        return { ...table, pendingOrders: tableOrders, pendingItems, pendingTotal, visualStatus };
    });
    renderTables(); renderMiniTables();
}

function renderTables() {
    const grid = document.getElementById('tables-grid');
    if (!grid) return;
    if (tables.length === 0) { grid.innerHTML = '<p style="text-align:center; color: #6b7280; padding: 2rem;">No hay mesas disponibles</p>'; return; }
    grid.innerHTML = tables.map(table => {
        const hasOrders = table.pendingItems && table.pendingItems.length > 0;
        const status = hasOrders ? table.visualStatus : (table.visualStatus === 'reservada' ? 'reservada' : 'libre');
        const itemsGrouped = {};
        (table.pendingItems || []).forEach(item => { const key = item.name; if (!itemsGrouped[key]) itemsGrouped[key] = { name: item.name, qty: 0, price: item.price }; itemsGrouped[key].qty += item.qty; });
        const itemsHtml = hasOrders ? Object.values(itemsGrouped).map(item => `<div class="table-order-item"><span>${item.qty}x ${item.name}</span><span>$${Math.round(item.price * item.qty).toLocaleString()}</span></div>`).join('') : '';
        const statusText = status === 'reservada' ? 'RESERVADA' : (hasOrders ? 'OCUPADA' : 'LIBRE');
        return `<div class="table-card status-${status}" onclick="selectTable(${table.id}, '${table.name}')">
            <button style="position:absolute; top:0.5rem; right:0.5rem; background:#3b82f6; color:white; border:none; padding:0.3rem 0.6rem; border-radius:6px; font-weight:700; cursor:pointer; font-size:0.7rem; z-index:10;" onclick="event.stopPropagation(); openTableQR(${table.id}, '${table.name}')"> QR</button>
            <div class="table-name">${table.name}</div><div class="table-status">${statusText}</div>
            ${hasOrders ? `<div class="table-orders-list">${itemsHtml}</div><div class="table-order-total"><span>Total:</span><span>$${Math.round(table.pendingTotal).toLocaleString()}</span></div><button class="btn-cobrar-mesa-card" onclick="event.stopPropagation(); cobrarMesaDirecta(${table.id})">💰 COBRAR</button>` : '<div style="flex:1;"></div>'}
        </div>`;
    }).join('');
}

function renderMiniTables() {
    const bar = document.getElementById('mini-tables-bar');
    if (!bar) return;
    if (tables.length === 0) { bar.innerHTML = '<span style="color: var(--text-gray); font-size: 0.85rem;">Cargando mesas...</span>'; return; }
    bar.innerHTML = tables.map(table => {
        const hasOrders = table.pendingItems && table.pendingItems.length > 0;
        const status = hasOrders ? table.visualStatus : (table.visualStatus === 'reservada' ? 'reservada' : 'libre');
        const isActive = table.id === activeTableId ? 'active' : '';
        return `<div class="mini-table status-${status} ${isActive}" onclick="selectTable(${table.id}, '${table.name}')">${table.name}</div>`;
    }).join('');
}

async function selectTable(id, name) {
    activeTableId = id; cart = [];
    const table = tables.find(t => t.id === id);
    if (table && table.pendingOrders && table.pendingOrders.length > 0) {
        currentTableOrder = {
            id: table.pendingOrders[0].id,
            order_items: table.pendingItems,
            total: table.pendingTotal,
            table_id: id,
            source: table.pendingOrders[0].source,
            _allOrderIds: table.pendingOrders.map(o => o.id)
        };
    } else { currentTableOrder = null; }
    renderCart(); renderTableOrder(); renderMiniTables();
    document.getElementById('pos-title').textContent = `Caja - ${name}`;
    document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
    const cajaItem = document.querySelector('[data-view="pos"]');
    if (cajaItem) cajaItem.classList.add('active');
    const posView = document.getElementById('view-pos');
    if (!posView.classList.contains('active')) { document.querySelectorAll('.view').forEach(v => v.classList.remove('active')); posView.classList.add('active'); }
}

async function cobrarMesaDirecta(tableId) {
    const table = tables.find(t => t.id === tableId);
    if (!table || !table.pendingOrders || table.pendingOrders.length === 0) return;
    activeTableId = tableId;
    currentTableOrder = {
        id: table.pendingOrders[0].id,
        order_items: table.pendingItems,
        total: table.pendingTotal,
        table_id: tableId,
        source: table.pendingOrders[0].source,
        _allOrderIds: table.pendingOrders.map(o => o.id)
    };
    openPayModalForTable();
}

function renderTableOrder() {
    const section = document.getElementById('table-order-section');
    const itemsContainer = document.getElementById('table-order-items');
    const totalElement = document.getElementById('table-order-total');
    const btnPay = document.getElementById('btn-pay');
    const btnDivide = document.getElementById('btn-divide-account');
    if (!currentTableOrder || !currentTableOrder.order_items || currentTableOrder.order_items.length === 0) {
        section.style.display = 'none';
        if (activeTableId) btnPay.textContent = `AÑADIR A MESA ($${Math.round(cart.reduce((sum, i) => sum + (i.price * i.qty), 0)).toLocaleString()})`;
        else btnPay.textContent = `COBRAR ($${Math.round(cart.reduce((sum, i) => sum + (i.price * i.qty), 0)).toLocaleString()})`;
        if (btnDivide) btnDivide.style.display = 'none';
        return;
    }
    section.style.display = 'block';
    if (btnDivide) btnDivide.style.display = 'inline-block';
    const itemsGrouped = {};
    currentTableOrder.order_items.forEach(item => { const key = item.name; if (!itemsGrouped[key]) itemsGrouped[key] = { name: item.name, qty: 0, price: item.price }; itemsGrouped[key].qty += item.qty; });
    itemsContainer.innerHTML = Object.values(itemsGrouped).map(item => `<div class="order-item"><span>${item.qty}x ${item.name}</span><span>$${Math.round(item.price * item.qty).toLocaleString()}</span></div>`).join('');
    totalElement.textContent = `$${Math.round(currentTableOrder.total).toLocaleString()}`;
    btnPay.textContent = `AÑADIR MÁS A MESA ($${Math.round(cart.reduce((sum, i) => sum + (i.price * i.qty), 0)).toLocaleString()})`;
}

async function addToTable() {
    if (cart.length === 0) return alert('Carrito vacío');
    const total = cart.reduce((sum, i) => sum + (i.price * i.qty), 0);
    try {
        if (currentTableOrder) {
            await supabaseClient.from('orders').update({ total: currentTableOrder.total + total }).eq('id', currentTableOrder.id);
            await supabaseClient.from('order_items').insert(cart.map(item => ({ order_id: currentTableOrder.id, name: item.name, price: item.price, qty: item.qty })));
            currentTableOrder.total += total;
            currentTableOrder.order_items = [...currentTableOrder.order_items, ...cart];
        } else {
            const { data: order, error: orderError } = await supabaseClient.from('orders').insert([{ type: 'mesa', status: 'nuevo', total, paid: false, pay_method: 'pendiente', source: 'tpv', user_email: currentUser?.email, table_id: activeTableId }]).select().single();
            if (orderError) throw orderError;
            await supabaseClient.from('order_items').insert(cart.map(item => ({ order_id: order.id, name: item.name, price: item.price, qty: item.qty })));
            currentTableOrder = order;
            addNotification('nuevo', '📝 Pedido en Mesa', `${tables.find(t => t.id === activeTableId)?.name}: $${Math.round(total).toLocaleString()}`);
        }
        cart = []; renderCart(); renderTableOrder();
        showToast('pago', '✓ Añadido a la mesa', 'Los productos se guardaron en el pedido');
        loadTables();
    } catch (error) { alert('Error: ' + error.message); }
}

function openPayModal() {
    if (cart.length === 0) return alert('Carrito vacío');
    resetLoyaltyUI();
    document.getElementById('modal-title').textContent = 'Finalizar Pedido (Mostrador)';
    document.getElementById('modal-cart-items').innerHTML = cart.map(item => `<div class="cart-item"><div class="cart-item-name">${item.name} x${item.qty}</div><div class="cart-item-price">$${(item.price * item.qty).toLocaleString()}</div></div>`).join('');
    const total = cart.reduce((sum, i) => sum + (i.price * i.qty), 0);
    document.getElementById('modal-subtotal').textContent = '$' + Math.round(total - (total * 0.19)).toLocaleString();
    document.getElementById('modal-tax').textContent = '$' + Math.round(total * 0.19).toLocaleString();
    document.getElementById('modal-total').textContent = '$' + Math.round(total).toLocaleString();
    document.getElementById('cash-received').value = '';
    document.getElementById('change-amount').textContent = '$0';
    document.getElementById('pay-modal').classList.add('active');
}

function openPayModalForTable() {
    if (!currentTableOrder) return;
    resetLoyaltyUI();
    document.getElementById('modal-title').textContent = `Cobrar Mesa ${tables.find(t => t.id === activeTableId)?.name}`;
    const itemsGrouped = {};
    currentTableOrder.order_items.forEach(item => { const key = item.name; if (!itemsGrouped[key]) itemsGrouped[key] = { name: item.name, qty: 0, price: item.price }; itemsGrouped[key].qty += item.qty; });
    document.getElementById('modal-cart-items').innerHTML = Object.values(itemsGrouped).map(item => `<div class="cart-item"><div class="cart-item-name">${item.name} x${item.qty}</div><div class="cart-item-price">$${Math.round(item.price * item.qty).toLocaleString()}</div></div>`).join('');
    document.getElementById('modal-subtotal').textContent = '$' + Math.round(currentTableOrder.total - (currentTableOrder.total * 0.19)).toLocaleString();
    document.getElementById('modal-tax').textContent = '$' + Math.round(currentTableOrder.total * 0.19).toLocaleString();
    document.getElementById('modal-total').textContent = '$' + Math.round(currentTableOrder.total).toLocaleString();
    document.getElementById('cash-received').value = '';
    document.getElementById('change-amount').textContent = '$0';
    document.getElementById('pay-modal').classList.add('active');
}

async function confirmPayment() {
    const base = cart.reduce((sum, i) => sum + (i.price * i.qty), 0);
    const discount = redeemPoints * loyaltySettings.point_value;
    const total = Math.max(0, base - discount);
    if (payMethod === 'efectivo') { const cashReceived = parseFloat(document.getElementById('cash-received').value); if (!cashReceived || cashReceived < total) return alert('Efectivo insuficiente'); }
    try {
        const { data: order, error: orderError } = await supabaseClient.from('orders').insert([{ type: orderType, status: 'nuevo', total, paid: true, pay_method: payMethod, source: 'tpv', user_email: currentUser?.email, table_id: null }]).select().single();
        if (orderError) throw orderError;
        await supabaseClient.from('order_items').insert(cart.map(item => ({ order_id: order.id, name: item.name, price: item.price, qty: item.qty })));
        const loyalty = await applyLoyalty(order.id, total);
        printTicket(order, cart, loyalty);
        await deductInventory(cart);
        await recordEmployeeSale(order.id, total);
        addNotification('pago', `✓ Pedido #${order.id} cobrado`, `Total: $${Math.round(total).toLocaleString()} | ${payMethod.toUpperCase()}`);
        cart = []; renderCart(); renderTableOrder(); closeModal('pay-modal');
        const cashView = document.getElementById('view-cash');
        if (cashView.classList.contains('active')) loadCashStatus();
    } catch (error) { alert('Error: ' + error.message); }
}

async function confirmPaymentForTable() {
    const base = currentTableOrder.total;
    const discount = redeemPoints * loyaltySettings.point_value;
    const total = Math.max(0, base - discount);
    if (payMethod === 'efectivo') { const cashReceived = parseFloat(document.getElementById('cash-received').value); if (!cashReceived || cashReceived < total) return alert('Efectivo insuficiente'); }
    try {
        const orderIds = currentTableOrder._allOrderIds || [currentTableOrder.id];
        for (let i = 0; i < orderIds.length; i++) {
            const updateData = { paid: true, pay_method: payMethod };
            if (i === 0) updateData.total = total;
            await supabaseClient.from('orders').update(updateData).eq('id', orderIds[i]);
        }
        await supabaseClient.from('tables').update({ status: 'libre', current_order_id: null }).eq('id', activeTableId);
        const loyalty = await applyLoyalty(currentTableOrder.id, total);
        printTicket(currentTableOrder, currentTableOrder.order_items, loyalty);
        await deductInventory(currentTableOrder.order_items);
        await recordEmployeeSale(currentTableOrder.id, total);
        addNotification('pago', `✓ Mesa cobrada`, `${tables.find(t => t.id === activeTableId)?.name}: $${Math.round(total).toLocaleString()}`);
        currentTableOrder = null; cart = []; renderCart(); renderTableOrder(); closeModal('pay-modal');
        loadTables();
    } catch (error) { alert('Error: ' + error.message); }
}

function printTicket(order, items, loyalty) {
    const printArea = document.getElementById('ticket-print-area');
    const date = new Date().toLocaleString('es-ES');
    const qrUrl = `${window.location.origin}/valorar.html?p=${order.id}`;
    const tableText = order.table_id ? ` | Mesa: ${order.table_id}` : '';
    const dinerText = order.diner_name ? ` | ${order.diner_name}` : '';
    const loyaltyHtml = loyalty ? `<div class="ticket-divider"></div><div class="ticket-item"><span>Cliente: ${loyalty.name}</span><span></span></div><div class="ticket-item"><span>Puntos ganados</span><span>+${loyalty.earned}</span></div><div class="ticket-item"><span>Saldo de puntos</span><span>${Math.round(loyalty.newBalance)}</span></div>` : '';
    printArea.innerHTML = `<div class="ticket-header"><h3>TPV PUNTO VERDE</h3><p>${date}</p><p>Pedido #${order.id}${tableText}${dinerText}</p><p>Cajero: ${currentProfile?.full_name || currentUser?.email || 'N/A'}</p></div><div class="ticket-divider"></div>${items.map(i => `<div class="ticket-item"><span>${i.qty}x ${i.name.substring(0, 20)}</span><span>$${Math.round(i.price * i.qty).toLocaleString()}</span></div>`).join('')}<div class="ticket-divider"></div><div class="ticket-total">TOTAL: $${Math.round(order.total).toLocaleString()}</div>${loyaltyHtml}<div class="ticket-footer"><p>¡Gracias!</p><div id="qr-code"></div></div>`;
    setTimeout(() => { const qrContainer = document.getElementById('qr-code'); qrContainer.innerHTML = ''; new QRCode(qrContainer, { text: qrUrl, width: 100, height: 100, correctLevel: QRCode.CorrectLevel.L }); setTimeout(() => window.print(), 500); }, 100);
}

// ============ COCINA ============
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
            const dinerText = order.diner_name ? ` - ${order.diner_name}` : ''; 
            const webBadge = order.source === 'web' ? ' 📱' : ''; 
            // ✅ AGRUPAR items por nombre para evitar duplicados visuales
            const itemsGrouped = {};
            (order.order_items || []).forEach(item => {
                if (!itemsGrouped[item.name]) itemsGrouped[item.name] = { name: item.name, qty: 0 };
                itemsGrouped[item.name].qty += item.qty;
            });
            const itemsHtml = Object.values(itemsGrouped).map(item => `<div class="order-item"><span><span class="item-qty">${item.qty}x</span> ${item.name}</span></div>`).join(''); 
            let actionBtn = ''; 
            if (status === 'nuevo') actionBtn = `<button class="action-btn-kitchen btn-cocina" onclick="updateOrderStatus(${order.id}, 'cocina')">→ Cocina</button>`; 
            else if (status === 'cocina') actionBtn = `<button class="action-btn-kitchen btn-listo" onclick="updateOrderStatus(${order.id}, 'listo')">✓ Listo</button>`; 
            else if (status === 'listo') actionBtn = `<button class="action-btn-kitchen btn-entregado" onclick="updateOrderStatus(${order.id}, 'entregado')">✓ Entregado</button>`; 
            return `<div class="order-card status-${status}"><div class="order-header"><div class="order-id">#${order.id}${tableText}${dinerText}${webBadge}</div><div class="order-type">${order.type.toUpperCase()}</div></div><div class="order-time">${time}</div><div class="order-items">${itemsHtml}</div><div class="order-actions">${actionBtn}</div></div>`; 
        }).join(''); 
    }); 
}

function updateKitchenStats() { 
    document.getElementById('count-nuevo').textContent = kitchenOrders.filter(o => o.status === 'nuevo').length; 
    document.getElementById('count-cocina').textContent = kitchenOrders.filter(o => o.status === 'cocina').length; 
    document.getElementById('count-listo').textContent = kitchenOrders.filter(o => o.status === 'listo').length; 
}

async function updateOrderStatus(orderId, newStatus) {
    const order = kitchenOrders.find(o => o.id === orderId);
    await supabaseClient.from('orders').update({ status: newStatus }).eq('id', orderId);
    loadKitchenOrders();
    if (newStatus === 'entregado') {
        if (order && order.table_id) {
            await supabaseClient.from('tables').update({ status: 'ocupada' }).eq('id', order.table_id);
        }
        loadTables();
    } else if (newStatus === 'listo') { 
        if (order && order.table_id) await supabaseClient.from('tables').update({ status: 'ocupada' }).eq('id', order.table_id); 
    }
}

// ============ CAJA / ARQUEOS ============
async function loadCashStatus() { 
    const { data: session, error } = await supabaseClient.from('cash_sessions').select('*').is('closed_at', null).single(); 
    if (error || !session) { 
        currentSession = null; 
        document.getElementById('cash-status').innerHTML = '<span class="status-closed">🔴 Caja Cerrada</span>'; 
        document.getElementById('action-buttons').innerHTML = '<button class="action-btn btn-open" onclick="openModal(\'modal-open-cash\')">🔓 Abrir Caja</button>'; 
        document.getElementById('cash-summary').style.display = 'none'; 
    } else { 
        currentSession = session; 
        document.getElementById('cash-status').innerHTML = `<span class="status-open">🟢 Caja Abierta</span><br><small>Abierta: ${new Date(session.opened_at).toLocaleString('es-ES')}</small><br><small>Fondo inicial: $${session.fondo.toLocaleString()}</small>`; 
        document.getElementById('action-buttons').innerHTML = `<button class="action-btn btn-movement" onclick="openModal('modal-movement')">💵 Movimiento</button><button class="action-btn btn-count" onclick="openModal('modal-count')">🔢 Arqueo Ciego</button><button class="action-btn btn-close" onclick="closeCashSession()">🔒 Cerrar Caja</button>`; 
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
    document.getElementById('summary-content').innerHTML = `<div class="summary-grid"><div class="summary-card"><div class="summary-label">Total Ventas</div><div class="summary-value">$${totalVentas.toLocaleString()}</div></div><div class="summary-card"><div class="summary-label">Pedidos</div><div class="summary-value">${totalPedidos}</div></div><div class="summary-card"><div class="summary-label">Efectivo</div><div class="summary-value">$${efectivo.toLocaleString()}</div></div><div class="summary-card"><div class="summary-label">Tarjeta</div><div class="summary-value">$${tarjeta.toLocaleString()}</div></div><div class="summary-card"><div class="summary-label">Bizum</div><div class="summary-value">$${bizum.toLocaleString()}</div></div><div class="summary-card highlight"><div class="summary-label">Total en Caja</div><div class="summary-value">$${totalCaja.toLocaleString()}</div></div></div><div class="movements-section"><h4>Movimientos registrados: ${movements.length}</h4>${movements.length > 0 ? movements.map(m => `<div class="movement-item ${m.tipo}"><span>${m.tipo === 'entrada' ? '📥' : '📤'} ${m.nota || m.metodo}</span><span>$${m.importe.toLocaleString()}</span></div>`).join('') : '<p style="color: var(--text-gray); font-size: 0.9rem;">Sin movimientos</p>'}</div>`; 
}

document.getElementById('btn-confirm-open').addEventListener('click', async () => { const fund = parseFloat(document.getElementById('opening-fund').value) || 0; const { error } = await supabaseClient.from('cash_sessions').insert([{ fondo: fund, user_email: currentUser.email }]); if (error) { alert('Error: ' + error.message); } else { closeModal('modal-open-cash'); loadCashStatus(); } });
document.getElementById('btn-confirm-movement').addEventListener('click', async () => { const type = document.getElementById('movement-type').value; const method = document.getElementById('movement-method').value; const amount = parseFloat(document.getElementById('movement-amount').value) || 0; const note = document.getElementById('movement-note').value; if (!currentSession) return alert('Caja no abierta'); const { error } = await supabaseClient.from('cash_movements').insert([{ session_id: currentSession.id, tipo: type, metodo: method, importe: amount, nota: note }]); if (error) { alert('Error: ' + error.message); } else { closeModal('modal-movement'); document.getElementById('movement-amount').value = ''; document.getElementById('movement-note').value = ''; loadCashStatus(); } });
document.querySelectorAll('.bill-count').forEach(input => { input.addEventListener('input', () => { let total = 0; document.querySelectorAll('.bill-count').forEach(i => { total += parseInt(i.dataset.value) * (parseInt(i.value) || 0); }); document.getElementById('counted-total').textContent = '$' + total.toLocaleString(); }); });
document.getElementById('btn-confirm-count').addEventListener('click', async () => { if (!currentSession) return alert('Caja no abierta'); let counted = 0; document.querySelectorAll('.bill-count').forEach(i => { counted += parseInt(i.dataset.value) * (parseInt(i.value) || 0); }); const { data: movements } = await supabaseClient.from('cash_movements').select('*').eq('session_id', currentSession.id).eq('metodo', 'efectivo'); let entradas = 0, salidas = 0; movements.forEach(m => { if (m.tipo === 'entrada') entradas += m.importe; if (m.tipo === 'salida') salidas += m.importe; }); const { data: orders } = await supabaseClient.from('orders').select('total, pay_method').eq('source', 'tpv').gte('created_at', currentSession.opened_at).eq('paid', true); let ventasEfectivo = 0; orders.forEach(o => { if (o.pay_method === 'efectivo') ventasEfectivo += o.total; }); const esperado = currentSession.fondo + ventasEfectivo + entradas - salidas; const diferencia = counted - esperado; const { error } = await supabaseClient.from('cash_arqueos').insert([{ session_id: currentSession.id, fondo: currentSession.fondo, esperado, contado: counted, dif: diferencia, v_efectivo: ventasEfectivo, entradas, salidas, kind: 'X' }]); if (error) { alert('Error: ' + error.message); } else { closeModal('modal-count'); alert(`Arqueo registrado\nEsperado: $${esperado.toLocaleString()}\nContado: $${counted.toLocaleString()}\nDiferencia: $${diferencia.toLocaleString()}`); loadCashStatus(); } });
async function closeCashSession() { if (!currentSession) return alert('Caja no abierta'); if (!confirm('¿Cerrar caja?')) return; const { error } = await supabaseClient.from('cash_sessions').update({ closed_at: new Date().toISOString() }).eq('id', currentSession.id); if (error) { alert('Error: ' + error.message); } else { loadCashStatus(); } }

// ============ ALÉRGENOS ============
function setupAllergenEvents() {
    document.getElementById('btn-product-allergens').addEventListener('click', openProductAllergensModal);
    document.getElementById('btn-close-product-allergens').addEventListener('click', () => closeModal('product-allergens-modal'));
    document.getElementById('btn-cancel-product-allergens').addEventListener('click', () => closeModal('product-allergens-modal'));
    document.getElementById('btn-save-product-allergens').addEventListener('click', saveProductAllergens);
    document.getElementById('allergen-product-select').addEventListener('change', loadProductAllergens);
    document.getElementById('btn-close-technical-sheet').addEventListener('click', () => closeModal('technical-sheet-modal'));
    document.getElementById('btn-cancel-technical-sheet').addEventListener('click', () => closeModal('technical-sheet-modal'));
    document.getElementById('btn-print-technical-sheet').addEventListener('click', printTechnicalSheet);
    document.getElementById('allergen-category-bar').addEventListener('click', (e) => {
        const btn = e.target.closest('.allergen-cat-btn');
        if (!btn) return;
        document.querySelectorAll('.allergen-cat-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentAllergenCategory = btn.dataset.cat;
        renderAllergens();
    });
}

function renderAllergenCategories() {
    const bar = document.getElementById('allergen-category-bar');
    if (!bar) return;
    const cats = [...new Set(products.map(p => p.category || 'Sin categoría'))];
    bar.innerHTML = '<button class="allergen-cat-btn active" data-cat="all">📋 Todos</button>' + cats.map(cat => `<button class="allergen-cat-btn" data-cat="${cat}">${cat}</button>`).join('');
}

function openProductAllergensModal() {
    const select = document.getElementById('allergen-product-select');
    const filteredProducts = currentAllergenCategory === 'all' ? products : products.filter(p => (p.category || 'Sin categoría') === currentAllergenCategory);
    select.innerHTML = filteredProducts.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
    const checkboxes = document.getElementById('allergen-checkboxes');
    checkboxes.innerHTML = allergens.map(a => `
        <div class="allergen-checkbox">
            <input type="checkbox" id="allergen-${a.id}" value="${a.id}">
            <label for="allergen-${a.id}"><span class="allergen-icon">${a.icon}</span> ${a.name}</label>
        </div>
    `).join('');
    loadProductAllergens();
    document.getElementById('product-allergens-modal').classList.add('active');
}

function loadProductAllergens() {
    const productId = parseInt(document.getElementById('allergen-product-select').value);
    const allergenIds = productAllergens[productId] || [];
    allergens.forEach(a => {
        const checkbox = document.getElementById(`allergen-${a.id}`);
        if (checkbox) checkbox.checked = allergenIds.includes(a.id);
    });
}

async function saveProductAllergens() {
    const productId = parseInt(document.getElementById('allergen-product-select').value);
    const selectedAllergens = [];
    allergens.forEach(a => {
        const checkbox = document.getElementById(`allergen-${a.id}`);
        if (checkbox && checkbox.checked) selectedAllergens.push(a.id);
    });
    try {
        await supabaseClient.from('product_allergens').delete().eq('product_id', productId);
        if (selectedAllergens.length > 0) {
            const { error } = await supabaseClient.from('product_allergens').insert(selectedAllergens.map(aid => ({ product_id: productId, allergen_id: aid })));
            if (error) throw error;
        }
        await loadAllergens();
        renderAllergens();
        closeModal('product-allergens-modal');
        showToast('pago', '✓ Alérgenos guardados', '');
    } catch (error) { alert('Error: ' + error.message); }
}

function renderAllergens() {
    const legend = document.getElementById('allergen-legend-grid');
    if (legend) {
        legend.innerHTML = allergens.map(a => `<div class="allergen-legend-item"><span class="allergen-icon">${a.icon}</span><span class="allergen-name">${a.name}</span></div>`).join('');
    }
    const grid = document.getElementById('allergens-grid');
    if (!grid) return;

    const filtered = currentAllergenCategory === 'all' ? products : products.filter(p => (p.category || 'Sin categoría') === currentAllergenCategory);

    if (filtered.length === 0) {
        grid.innerHTML = '<div style="grid-column: 1/-1; text-align:center; color: var(--text-gray); padding: 2rem;">No hay productos en esta categoría</div>';
        return;
    }

    grid.innerHTML = filtered.map(p => {
        const allergenIds = productAllergens[p.id] || [];
        const hasAllergens = allergenIds.length > 0;
        const allergenBadges = allergenIds.map(aid => {
            const allergen = allergens.find(a => a.id === aid);
            return allergen ? `<span class="allergen-badge"><span class="allergen-icon">${allergen.icon}</span> ${allergen.name}</span>` : '';
        }).join('');
        return `
        <div class="product-allergen-card ${hasAllergens ? 'has-allergens' : ''}">
            <div class="product-allergen-header">
                <div class="product-allergen-name">${p.name}</div>
                <span class="product-allergen-category">${p.category || 'Sin categoría'}</span>
            </div>
            <div class="product-allergen-list">
                ${allergenBadges || '<span style="color: var(--text-gray); font-size: 0.85rem;">Sin alérgenos declarados</span>'}
            </div>
            <div class="product-allergen-actions">
                <button class="product-allergen-btn edit" onclick="editProductAllergens(${p.id})">✏️ Editar</button>
                <button class="product-allergen-btn sheet" onclick="viewTechnicalSheet(${p.id})">📋 Ficha Técnica</button>
            </div>
        </div>`;
    }).join('');
}

function editProductAllergens(productId) {
    document.getElementById('allergen-product-select').value = productId;
    loadProductAllergens();
    document.getElementById('product-allergens-modal').classList.add('active');
}

function viewTechnicalSheet(productId) {
    const product = products.find(p => p.id === productId);
    if (!product) return;
    const allergenIds = productAllergens[productId] || [];
    const allergenList = allergenIds.map(aid => {
        const allergen = allergens.find(a => a.id === aid);
        return allergen ? `<li>${allergen.icon} ${allergen.name}: ${allergen.description}</li>` : '';
    }).join('');
    document.getElementById('technical-sheet-title').textContent = `Ficha Técnica - ${product.name}`;
    document.getElementById('technical-sheet-body').innerHTML = `
        <div style="padding: 1rem;">
            <h3 style="margin-bottom: 1rem; color: var(--primary);">${product.name}</h3>
            <div style="margin-bottom: 1rem;"><strong>Categoría:</strong> ${product.category || 'No especificada'}<br><strong>Precio:</strong> €${Number(product.price).toFixed(2)}</div>
            <div style="background: #fef3c7; border: 1px solid #f59e0b; padding: 0.75rem; border-radius: 8px; margin-bottom: 1rem;">
                <strong>⚠️ Alérgenos presentes:</strong>
                <ul style="margin-top: 0.5rem; margin-left: 1.5rem;">${allergenList || '<li>Sin alérgenos declarados</li>'}</ul>
            </div>
            <div style="font-size: 0.85rem; color: var(--text-gray); margin-top: 1rem;"><strong>Nota legal:</strong> Esta ficha cumple con el Reglamento (UE) nº 1169/2011.</div>
        </div>
    `;
    document.getElementById('technical-sheet-modal').classList.add('active');
}

function printTechnicalSheet() {
    const content = document.getElementById('technical-sheet-body').innerHTML;
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`<!DOCTYPE html><html><head><title>Ficha Técnica</title><style>body{font-family:Arial,sans-serif;padding:2rem;max-width:800px;margin:0 auto}h3{color:#10b981}ul{margin:0.5rem 0}li{margin-bottom:0.5rem}@media print{body{padding:1rem}}</style></head><body>${content}</body></html>`);
    printWindow.document.close();
    setTimeout(() => printWindow.print(), 500);
}

// ============ GESTIÓN DE PRODUCTOS E IMÁGENES ============
function setupProductManagementEvents() {
    document.getElementById('product-search').addEventListener('input', renderProductManagement);
    document.getElementById('product-category-filter').addEventListener('change', renderProductManagement);
    document.getElementById('btn-close-image').addEventListener('click', () => closeModal('image-modal'));
    document.getElementById('btn-cancel-image').addEventListener('click', () => closeModal('image-modal'));
    document.getElementById('btn-save-image').addEventListener('click', saveProductImage);
    document.getElementById('btn-delete-image').addEventListener('click', deleteProductImage);
    document.getElementById('image-file-input').addEventListener('change', previewImage);
    setupProductEvents();
}

function setupProductEvents() {
    document.getElementById('btn-add-product').addEventListener('click', () => openProductModal());
    document.getElementById('btn-close-product').addEventListener('click', () => closeModal('product-modal'));
    document.getElementById('btn-cancel-product').addEventListener('click', () => closeModal('product-modal'));
    document.getElementById('btn-save-product').addEventListener('click', saveProduct);
}

async function loadProductManagement() {
    const { data } = await supabaseClient.from('products').select('*').eq('active', true).order('position');
    products = data || [];
    const cats = [...new Set(products.map(p => p.category || 'Sin categoría'))];
    const filter = document.getElementById('product-category-filter');
    if (filter) {
        filter.innerHTML = '<option value="all">Todas las categorías</option>' + cats.map(c => `<option value="${c}">${c}</option>`).join('');
    }
    renderProductManagement();
}

function renderProductManagement() {
    const grid = document.getElementById('products-management-grid');
    if (!grid) return;
    const search = (document.getElementById('product-search')?.value || '').toLowerCase();
    const categoryFilter = document.getElementById('product-category-filter')?.value || 'all';
    let filtered = products;
    if (search) filtered = filtered.filter(p => (p.name || '').toLowerCase().includes(search));
    if (categoryFilter !== 'all') filtered = filtered.filter(p => (p.category || 'Sin categoría') === categoryFilter);
    if (filtered.length === 0) {
        grid.innerHTML = '<div style="grid-column: 1/-1; text-align:center; color: var(--text-gray); padding: 2rem;">No hay productos</div>';
        return;
    }
    grid.innerHTML = filtered.map(p => {
        const imageUrl = p.image_url || '';
        const imageHtml = imageUrl ? `<img src="${imageUrl}" alt="${p.name}">` : '<div class="no-image"> Sin imagen</div>';
        return `
        <div class="product-management-card">
            <div class="product-management-header">
                <div class="product-management-name">${p.name}</div>
                <span class="product-management-category">${p.category || 'Sin categoría'}</span>
            </div>
            <div class="product-management-image">${imageHtml}</div>
            <div class="product-management-price">€${Number(p.price).toFixed(2)}</div>
            <div class="product-management-actions">
                <button class="product-management-btn image" onclick="openImageModal(${p.id})">📷 ${imageUrl ? 'Cambiar' : 'Añadir'} Imagen</button>
                <button class="product-management-btn edit" onclick="openProductModalById(${p.id})">✏️ Editar</button>
            </div>
        </div>`;
    }).join('');
}

function openProductModal(product = null) {
    document.getElementById('product-modal-title').textContent = product ? 'Editar Producto' : 'Nuevo Producto';
    document.getElementById('product-id').value = product ? product.id : '';
    document.getElementById('product-name').value = product ? product.name : '';
    document.getElementById('product-category').value = product ? (product.category || '') : '';
    document.getElementById('product-description').value = product ? (product.description || '') : '';
    document.getElementById('product-price').value = product ? product.price : '';
    document.getElementById('product-iva').value = product ? (product.iva_rate || 10) : '10';
    document.getElementById('product-active').value = product ? String(product.active) : 'true';
    document.getElementById('product-image-url').value = product ? (product.image_url || '') : '';
    const categories = [...new Set(products.map(p => p.category).filter(Boolean))];
    document.getElementById('category-list').innerHTML = categories.map(c => `<option value="${c}">`).join('');
    document.getElementById('product-modal').classList.add('active');
}

function openProductModalById(productId) {
    const product = products.find(p => p.id === productId);
    if (product) openProductModal(product);
}

async function saveProduct() {
    const id = document.getElementById('product-id').value;
    const name = document.getElementById('product-name').value.trim();
    const category = document.getElementById('product-category').value.trim();
    const description = document.getElementById('product-description').value.trim();
    const price = parseFloat(document.getElementById('product-price').value) || 0;
    const iva_rate = parseFloat(document.getElementById('product-iva').value) || 10;
    const active = document.getElementById('product-active').value === 'true';
    const image_url = document.getElementById('product-image-url').value.trim();
    if (!name) return alert('El nombre es obligatorio');
    if (price <= 0) return alert('El precio debe ser mayor a 0');
    try {
        if (id) {
            const { error } = await supabaseClient.from('products').update({ name, category, description, price, iva_rate, active, image_url, updated_at: new Date().toISOString() }).eq('id', id);
            if (error) throw error;
            showToast('pago', '✓ Producto actualizado', name);
        } else {
            const { error } = await supabaseClient.from('products').insert([{ name, category, description, price, iva_rate, active, image_url }]);
            if (error) throw error;
            showToast('pago', '✓ Producto creado', name);
        }
        closeModal('product-modal');
        loadProductManagement();
        loadProducts();
        loadAllergens();
    } catch (error) { alert('Error: ' + error.message); }
}

function openImageModal(productId) {
    const product = products.find(p => p.id === productId);
    if (!product) return;
    currentProductForImage = product;
    document.getElementById('image-modal-title').textContent = `Imagen: ${product.name}`;
    const preview = document.getElementById('image-preview');
    if (product.image_url) { preview.src = product.image_url; preview.style.display = 'block'; }
    else { preview.src = ''; preview.style.display = 'none'; }
    document.getElementById('image-file-input').value = '';
    document.getElementById('image-modal').classList.add('active');
}

function previewImage(e) {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { alert('La imagen es demasiado grande. Máximo 5MB.'); e.target.value = ''; return; }
    const reader = new FileReader();
    reader.onload = (event) => { const preview = document.getElementById('image-preview'); preview.src = event.target.result; preview.style.display = 'block'; };
    reader.readAsDataURL(file);
}

async function saveProductImage() {
    if (!currentProductForImage) return;
    const fileInput = document.getElementById('image-file-input');
    const file = fileInput.files[0];
    if (!file) { alert('Selecciona una imagen primero.'); return; }
    try {
        const fileExt = file.name.split('.').pop();
        const fileName = `${currentProductForImage.id}_${Date.now()}.${fileExt}`;
        const filePath = `products/${fileName}`;
        const { error: uploadError } = await supabaseClient.storage.from('product-images').upload(filePath, file, { upsert: true });
        if (uploadError) throw uploadError;
        const { data: { publicUrl } } = supabaseClient.storage.from('product-images').getPublicUrl(filePath);
        const { error: updateError } = await supabaseClient.from('products').update({ image_url: publicUrl }).eq('id', currentProductForImage.id);
        if (updateError) throw updateError;
        if (currentProductForImage.image_url && currentProductForImage.image_url.includes('product-images')) {
            const oldPath = currentProductForImage.image_url.split('/product-images/')[1];
            if (oldPath && oldPath !== filePath) {
                try { await supabaseClient.storage.from('product-images').remove([oldPath]); } catch (e) { console.log('No se pudo eliminar imagen anterior:', e); }
            }
        }
        closeModal('image-modal');
        loadProductManagement();
        loadProducts();
        showToast('pago', '✓ Imagen guardada', currentProductForImage.name);
    } catch (error) { alert('Error al subir la imagen: ' + error.message); }
}

async function deleteProductImage() {
    if (!currentProductForImage) return;
    if (!currentProductForImage.image_url) { alert('Este producto no tiene imagen.'); return; }
    if (!confirm('¿Eliminar la imagen de este producto?')) return;
    try {
        if (currentProductForImage.image_url && currentProductForImage.image_url.includes('product-images')) {
            const path = currentProductForImage.image_url.split('/product-images/')[1];
            if (path) { try { await supabaseClient.storage.from('product-images').remove([path]); } catch (e) { console.log('No se pudo eliminar del storage:', e); } }
        }
        const { error } = await supabaseClient.from('products').update({ image_url: null }).eq('id', currentProductForImage.id);
        if (error) throw error;
        closeModal('image-modal');
        loadProductManagement();
        loadProducts();
        showToast('pago', '🗑️ Imagen eliminada', currentProductForImage.name);
    } catch (error) { alert('Error al eliminar la imagen: ' + error.message); }
}

// ============ VISTA MESERO (CORREGIDA) ============
function setupWaiterEvents() {
    document.getElementById('btn-waiter-back').addEventListener('click', () => {
        document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
        document.querySelector('[data-view="tables"]').classList.add('active');
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        document.getElementById('view-tables').classList.add('active');
        waiterSelectedTable = null;
        loadTables();
    });
    document.getElementById('btn-send-waiter-order').addEventListener('click', sendWaiterOrder);
}

// ✅ NUEVA FUNCIÓN: Carga completa de la vista mesero
async function loadWaiterView() {
    // Asegurar que products esté cargado
    if (products.length === 0) {
        await loadProducts();
    }
    waiterSelectedTable = null;
    waiterCart = [];
    document.getElementById('waiter-order').style.display = 'none';
    await loadWaiterTables();
}

async function loadWaiterTables() {
    const { data: tablesData } = await supabaseClient.from('tables').select('*').order('id');
    const { data: ordersData } = await supabaseClient.from('orders').select('*').eq('paid', false).neq('status', 'entregado');
    
    const ordersByTable = {};
    (ordersData || []).forEach(order => {
        if (order.table_id) {
            if (!ordersByTable[order.table_id]) ordersByTable[order.table_id] = [];
            ordersByTable[order.table_id].push(order);
        }
    });
    
    const tables = (tablesData || []).map(table => {
        const hasOrders = ordersByTable[table.id] && ordersByTable[table.id].length > 0;
        return { ...table, hasOrders };
    });
    
    const grid = document.getElementById('waiter-table-grid');
    grid.innerHTML = tables.map(t => `
        <button class="waiter-table-btn ${t.hasOrders ? 'ocupada' : 'libre'} ${waiterSelectedTable?.id === t.id ? 'selected' : ''}" onclick="selectWaiterTable(${t.id}, '${t.name}')">
            ${t.name}
            <div style="font-size: 0.75rem; margin-top: 0.25rem; color: ${t.hasOrders ? 'var(--status-ocupada)' : 'var(--status-libre)'};">
                ${t.hasOrders ? '🟠 OCUPADA' : '🟢 LIBRE'}
            </div>
        </button>
    `).join('');
    
    if (!waiterSelectedTable) {
        document.getElementById('waiter-order').style.display = 'none';
    }
}

async function selectWaiterTable(tableId, tableName) {
    // ✅ Asegurar que products esté cargado
    if (products.length === 0) {
        await loadProducts();
    }
    
    waiterSelectedTable = { id: tableId, name: tableName };
    waiterCart = []; // ✅ Carrito SIEMPRE vacío al seleccionar
    waiterCategory = 'all';
    document.getElementById('waiter-table-name').textContent = `🍽️ ${tableName}`;
    document.getElementById('waiter-order').style.display = 'flex';
    
    // ✅ Mostrar productos existentes en sección amarilla (solo lectura)
    const existingItemsContainer = document.getElementById('existing-items-container');
    const existingTotalEl = document.getElementById('existing-total');
    const existingSection = document.getElementById('existing-section');
    
    const { data: ordersData } = await supabaseClient
        .from('orders')
        .select('*, order_items(*)')
        .eq('table_id', tableId)
        .eq('paid', false)
        .neq('status', 'entregado');
    
    if (ordersData && ordersData.length > 0 && existingItemsContainer) {
        const existingItems = ordersData.flatMap(o => o.order_items || []);
        if (existingItems.length > 0) {
            const itemsGrouped = {};
            existingItems.forEach(item => {
                const key = item.name;
                if (!itemsGrouped[key]) itemsGrouped[key] = { name: item.name, qty: 0, price: item.price };
                itemsGrouped[key].qty += item.qty;
            });
            
            existingItemsContainer.innerHTML = Object.values(itemsGrouped).map(item => `
                <div class="existing-item">
                    <span>${item.qty}x ${item.name}</span>
                    <span>$${(item.price * item.qty).toFixed(2)}</span>
                </div>
            `).join('');
            
            const existingTotal = Object.values(itemsGrouped).reduce((sum, item) => sum + (item.price * item.qty), 0);
            existingTotalEl.textContent = `$${existingTotal.toFixed(2)}`;
            existingSection.style.display = 'block';
        } else {
            existingItemsContainer.innerHTML = '';
            existingSection.style.display = 'none';
        }
    } else if (existingItemsContainer) {
        existingItemsContainer.innerHTML = '';
        existingSection.style.display = 'none';
    }
    
    renderWaiterCategories();
    renderWaiterProducts();
    renderWaiterCart();
}

function renderWaiterCategories() {
    const cats = ['all', ...new Set(products.map(p => p.category).filter(Boolean))];
    const container = document.getElementById('waiter-categories');
    if (!container) return;
    container.innerHTML = cats.map(cat => 
        `<button class="cat-btn ${cat === waiterCategory ? 'active' : ''}" onclick="setWaiterCategory('${cat}')">${cat === 'all' ? '📋 Todos' : cat}</button>`
    ).join('');
}

function setWaiterCategory(cat) {
    waiterCategory = cat;
    renderWaiterCategories();
    renderWaiterProducts();
}

function renderWaiterProducts() {
    const container = document.getElementById('waiter-products');
    if (!container) return;
    const filtered = waiterCategory === 'all' ? products : products.filter(p => p.category === waiterCategory);
    container.innerHTML = filtered.map(p => `
        <button class="waiter-prod-btn" onclick="addToWaiterCart(${p.id})">
            <div class="waiter-prod-name">${p.name}</div>
            <div class="waiter-prod-price">$${Number(p.price).toFixed(2)}</div>
        </button>
    `).join('');
}

function addToWaiterCart(productId) {
    const product = products.find(p => p.id === productId);
    if (!product) return;
    const existing = waiterCart.find(i => i.id === productId);
    if (existing) { existing.qty++; } else { waiterCart.push({ ...product, qty: 1 }); }
    renderWaiterCart();
}

function renderWaiterCart() {
    const container = document.getElementById('waiter-cart-items');
    const btnEnviar = document.getElementById('btn-send-waiter-order');
    if (!container) return;
    
    if (waiterCart.length === 0) {
        container.innerHTML = '<div style="text-align: center; color: var(--text-gray); padding: 1rem;">Añade productos nuevos</div>';
        if (btnEnviar) btnEnviar.disabled = true;
    } else {
        container.innerHTML = waiterCart.map(item => `
            <div class="waiter-cart-item">
                <span>${item.qty}x ${item.name}</span>
                <span>$${(item.price * item.qty).toFixed(2)}</span>
            </div>
        `).join('');
        if (btnEnviar) btnEnviar.disabled = false;
    }
    const total = waiterCart.reduce((sum, i) => sum + (i.price * i.qty), 0);
    const totalEl = document.getElementById('waiter-total-amount');
    if (totalEl) totalEl.textContent = `$${total.toFixed(2)}`;
}

async function sendWaiterOrder() {
    if (waiterCart.length === 0) return alert('Añade productos al pedido');
    if (!waiterSelectedTable) return alert('Selecciona una mesa');
    
    // ✅ Solo enviar los productos NUEVOS del carrito
    const newItemsTotal = waiterCart.reduce((sum, i) => sum + (i.price * i.qty), 0);
    
    try {
        // ✅ Buscar si ya existe un pedido pendiente para esta mesa
        const { data: existingOrder } = await supabaseClient
            .from('orders')
            .select('id, total')
            .eq('table_id', waiterSelectedTable.id)
            .eq('paid', false)
            .neq('status', 'entregado')
            .limit(1)
            .single();
        
        let orderId;
        
        if (existingOrder) {
            // ✅ Agregar SOLO los nuevos items al pedido existente
            orderId = existingOrder.id;
            const newTotal = (existingOrder.total || 0) + newItemsTotal;
            await supabaseClient
                .from('orders')
                .update({ total: newTotal })
                .eq('id', orderId);
        } else {
            // ✅ Crear nuevo pedido solo con los items nuevos
            const { data: order, error: orderError } = await supabaseClient
                .from('orders')
                .insert([{
                    type: 'mesa',
                    status: 'nuevo',
                    total: newItemsTotal,
                    paid: false,
                    pay_method: 'pendiente',
                    source: 'tpv',
                    user_email: currentUser?.email,
                    table_id: waiterSelectedTable.id,
                    waiter_name: currentProfile?.full_name || 'Mesero'
                }])
                .select()
                .single();
            
            if (orderError) throw orderError;
            orderId = order.id;
            
            await supabaseClient
                .from('tables')
                .update({ status: 'ocupada', current_order_id: orderId })
                .eq('id', waiterSelectedTable.id);
        }
        
        // ✅ Insertar SOLO los nuevos items
        const orderItems = waiterCart.map(item => ({
            order_id: orderId,
            name: item.name,
            price: item.price,
            qty: item.qty
        }));
        
        const { error: itemsError } = await supabaseClient
            .from('order_items')
            .insert(orderItems);
        
        if (itemsError) throw itemsError;
        
        alert(`✅ Pedido enviado para ${waiterSelectedTable.name}\nNuevos items: $${newItemsTotal.toFixed(2)}`);
        
        waiterCart = [];
        waiterSelectedTable = null;
        document.getElementById('waiter-order').style.display = 'none';
        loadWaiterTables();
        loadTables();
    } catch (error) {
        alert('Error: ' + error.message);
    }
}

// ============ REALTIME + POLLING ============
function setupRealtimeGlobal() {
    if (realtimeChannel) {
        supabaseClient.removeChannel(realtimeChannel);
        realtimeChannel = null;
    }
    if (pollingInterval) {
        clearInterval(pollingInterval);
        pollingInterval = null;
    }

    pollingInterval = setInterval(() => {
        const tablesView = document.getElementById('view-tables');
        const posView = document.getElementById('view-pos');
        const kitchenView = document.getElementById('view-kitchen');
        const waiterView = document.getElementById('view-waiter');
        
        if (tablesView.classList.contains('active') || posView.classList.contains('active')) {
            loadTables();
        }
        if (kitchenView.classList.contains('active')) {
            loadKitchenOrders();
        }
        // ✅ Solo recargar mesas del mesero si NO hay pedido abierto
        if (waiterView.classList.contains('active') && !waiterSelectedTable) {
            loadWaiterTables();
        }
    }, 3000);

    realtimeChannel = supabaseClient
        .channel('orders-global')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, (payload) => {
            const order = payload.new;
            const tableText = order.table_id ? ` (Mesa ${order.table_id})` : '';
            const webText = order.source === 'web' ? ' 📱 (QR)' : '';
            
            addNotification('nuevo', ` Nuevo Pedido #${order.id}${tableText}`, `Tipo: ${order.type.toUpperCase()}${webText} | Total: $${Math.round(order.total).toLocaleString()}`);
            loadTables();
            loadKitchenOrders();
        })
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders' }, (payload) => {
            const order = payload.new;
            const oldStatus = payload.old.status;
            const newStatus = order.status;
            let tipo = '', title = '', message = '';
            const tableText = order.table_id ? ` (Mesa ${order.table_id})` : '';
            
            if (oldStatus === 'nuevo' && newStatus === 'cocina') { tipo = 'cocina'; title = `🔥 Pedido #${order.id}${tableText} en preparación`; message = 'La cocina está preparando el pedido'; }
            else if (oldStatus === 'cocina' && newStatus === 'listo') { tipo = 'listo'; title = `✅ Pedido #${order.id}${tableText} listo`; message = 'El pedido está listo para entregar'; loadTables(); }
            else if (newStatus === 'entregado') { tipo = 'pago'; title = `✓ Pedido #${order.id}${tableText} entregado`; message = 'Pedido completado'; loadTables(); }
            if (title) addNotification(tipo, title, message);
            loadTables();
            loadKitchenOrders();
        })
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'tables' }, () => { loadTables(); })
        .subscribe((status) => {
            console.log(' Realtime status:', status);
        });
}

function openModal(id) { document.getElementById(id).classList.add('active'); }
function closeModal(id) { document.getElementById(id).classList.remove('active'); }

window.openDinerPayModal = openDinerPayModal;
window.removeItemFromDiner = removeItemFromDiner;
window.removeDiner = removeDiner;
window.updateDinerName = updateDinerName;
window.assignItemToDiner = assignItemToDiner;
window.editIngredient = editIngredient;
window.deleteIngredient = deleteIngredient;
window.openRecipeModal = openRecipeModal;
window.editStaff = editStaff;
window.deleteStaff = deleteStaff;
window.openTableQR = openTableQR;
window.selectCustomer = selectCustomer;
window.editCustomer = editCustomer;
window.viewHistory = viewHistory;
window.clearCustomerSearch = clearCustomerSearch;
window.deleteCustomer = deleteCustomer;
window.updateReservationStatus = updateReservationStatus;
window.deleteReservation = deleteReservation;
window.updateInvoiceItem = updateInvoiceItem;
window.removeInvoiceItem = removeInvoiceItem;
window.viewInvoice = viewInvoice;
window.sendInvoice = sendInvoice;
window.voidInvoice = voidInvoice;
window.printInvoiceById = printInvoiceById;
window.editProductAllergens = editProductAllergens;
window.viewTechnicalSheet = viewTechnicalSheet;
window.openImageModal = openImageModal;
window.openProductModal = openProductModal;
window.openProductModalById = openProductModalById;
window.selectWaiterTable = selectWaiterTable;
window.addToWaiterCart = addToWaiterCart;
window.setWaiterCategory = setWaiterCategory;

init();