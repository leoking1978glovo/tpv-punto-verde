const SUPABASE_URL = 'https://tjohhybyvfqqjummuedk.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_B6wSHIVowVjWL_086rafEA_g7-STvzI';
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const POINTS_PER_UNIT = 1;
const POINT_VALUE = 0.05;

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

const ROLE_PERMISSIONS = {
    admin: ['tables', 'pos', 'kitchen', 'customers', 'inventory', 'reports', 'cash', 'staff'],
    cajero: ['tables', 'pos', 'kitchen', 'customers', 'reports', 'cash'],
    mesero: ['tables', 'pos'],
    cocina: ['kitchen']
};

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
}

async function loadProfile() {
    const { data } = await supabaseClient.from('profiles').select('*').eq('id', currentUser.id).single();
    currentProfile = data || { id: currentUser.id, email: currentUser.email, full_name: 'Usuario', role: 'admin', commission_rate: 0, active: true };
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

function showApp() {
    document.getElementById('login-overlay').style.display = 'none';
    document.getElementById('main-app').style.display = 'flex';
    document.getElementById('user-name').textContent = currentProfile?.full_name || currentUser.email;
    applyPermissions();
    loadProducts();
    loadTables();
    loadCashStatus();
    loadIngredients();
    loadStaff();
    loadCustomers();
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
        else {
            currentUser = data.user;
            await loadProfile();
            if (currentProfile && currentProfile.active === false) {
                await supabaseClient.auth.signOut();
                currentUser = null;
                document.getElementById('login-error').textContent = 'Tu cuenta está desactivada. Contacta al administrador.';
                return;
            }
            showApp();
        }
    });
    document.getElementById('btn-logout').addEventListener('click', async () => {
        await supabaseClient.auth.signOut();
        currentUser = null;
        currentProfile = null;
        showLogin();
    });
}

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
            else if (view === 'kitchen') loadKitchenOrders();
            else if (view === 'customers') loadCustomers();
            else if (view === 'inventory') loadIngredients();
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

// ============ FIDELIDAD ============
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
        let val = parseInt(e.target.value) || 0;
        val = Math.max(0, Math.min(val, Math.round(selectedCustomer.points || 0)));
        redeemPoints = val;
        document.getElementById('redeem-discount').textContent = '$' + Math.round(redeemPoints * POINT_VALUE).toLocaleString();
        document.getElementById('modal-discount').textContent = '-$' + Math.round(redeemPoints * POINT_VALUE).toLocaleString();
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
        grid.innerHTML = `<div style="grid-column: 1/-1; text-align:center; color: var(--text-gray); padding: 3rem 1rem;">
            <div style="font-size: 2.5rem; margin-bottom: 0.5rem;">🔍</div>
            Escribe un nombre o teléfono para buscar un cliente<br>
            <small>Hay ${customers.length} cliente(s) registrados</small>
        </div>`;
        return;
    }

    const filtered = customers.filter(c => (c.name || '').toLowerCase().includes(q) || (c.phone || '').toLowerCase().includes(q) || (c.email || '').toLowerCase().includes(q));
    if (filtered.length === 0) {
        grid.innerHTML = `<div style="grid-column: 1/-1; text-align:center; color: var(--text-gray); padding: 2rem;">Sin resultados para "<strong>${q}</strong>"<br><button class="btn-secondary" style="margin-top:0.75rem;" onclick="clearCustomerSearch()">✕ Limpiar búsqueda</button></div>`;
        return;
    }

    grid.innerHTML = filtered.map(c => `
        <div class="customer-card ${isBirthday(c) ? 'birthday' : ''}">
            <div class="customer-header">
                <div class="customer-name">${isBirthday(c) ? '🎂 ' : ''}${c.name}</div>
                <span class="customer-points-badge">${Math.round(c.points || 0)} pts</span>
            </div>
            <div class="customer-phone">${c.phone || 'Sin teléfono'} ${c.email ? '· ' + c.email : ''}</div>
            <div class="customer-meta">
                <div>Visitas: <strong>${c.visits || 0}</strong></div>
                <div>Gastado: <strong>$${Math.round(c.total_spent || 0).toLocaleString()}</strong></div>
            </div>
            <div class="customer-actions">
                <button class="customer-action-btn edit" onclick="editCustomer(${c.id})">✏️ Editar</button>
                <button class="customer-action-btn history" onclick="viewHistory(${c.id})">📜 Historial</button>
                <button class="customer-action-btn" style="background:#fef2f2; color:#ef4444; border:1px solid #ef4444;" onclick="deleteCustomer(${c.id})">🗑️ Eliminar</button>
            </div>
        </div>
    `).join('');
}

function clearCustomerSearch() {
    document.getElementById('cust-search').value = '';
    renderCustomers();
}

async function deleteCustomer(id) {
    const c = customers.find(x => x.id === id);
    if (!c) return;
    if (!confirm(`¿Eliminar definitivamente a ${c.name}?\nSe borrará también su historial de puntos.`)) return;
    try {
        await supabaseClient.from('points_history').delete().eq('customer_id', id);
        const { error } = await supabaseClient.from('customers').delete().eq('id', id);
        if (error) throw error;
        loadCustomers();
        showToast('pago', '🗑️ Cliente eliminado', c.name);
    } catch (error) { alert('Error: ' + error.message); }
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
        if (id) { await supabaseClient.from('customers').update({ name, phone, email, birthday }).eq('id', id); }
        else { await supabaseClient.from('customers').insert([{ name, phone, email, birthday }]); }
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
        : list.map(h => `
            <div class="history-item ${h.type}">
                <div>
                    <div>${h.type === 'ganados' ? '✅ Ganados' : '🎁 Canjeados'} ${h.note ? '· ' + h.note : ''}</div>
                    <div class="history-date">${new Date(h.created_at).toLocaleString('es-ES')}</div>
                </div>
                <span class="history-pts ${h.points >= 0 ? 'pos' : 'neg'}">${h.points >= 0 ? '+' : ''}${Math.round(h.points)}</span>
            </div>
        `).join('');
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
    document.getElementById('sel-cust-points').textContent = `${Math.round(selectedCustomer.points || 0)} puntos disponibles${isBirthday(selectedCustomer) ? ' · 🎂 ¡Cumpleaños hoy (puntos x2)!' : ''}`;
    document.getElementById('redeem-row').style.display = 'block';
    document.getElementById('redeem-points').value = '';
    document.getElementById('redeem-discount').textContent = '$0';
    document.getElementById('modal-discount-row').style.display = 'none';
    refreshPayTotals();
}

function getBaseTotal() {
    return currentTableOrder ? currentTableOrder.total : cart.reduce((sum, i) => sum + (i.price * i.qty), 0);
}

function refreshPayTotals() {
    const base = getBaseTotal();
    const discount = redeemPoints * POINT_VALUE;
    const final = Math.max(0, base - discount);
    document.getElementById('modal-total').textContent = '$' + Math.round(final).toLocaleString();
    const cashInput = document.getElementById('cash-received');
    const received = parseFloat(cashInput.value) || 0;
    document.getElementById('change-amount').textContent = '$' + Math.max(0, Math.round(received - final)).toLocaleString();
}

async function applyLoyalty(orderId, finalTotal) {
    if (!selectedCustomer) return null;
    const bday = isBirthday(selectedCustomer);
    let earned = Math.round(finalTotal * POINTS_PER_UNIT);
    if (bday) earned *= 2;
    const newPoints = (selectedCustomer.points || 0) - redeemPoints + earned;
    await supabaseClient.from('customers').update({
        points: newPoints,
        total_spent: (selectedCustomer.total_spent || 0) + finalTotal,
        visits: (selectedCustomer.visits || 0) + 1
    }).eq('id', selectedCustomer.id);
    if (redeemPoints > 0) {
        await supabaseClient.from('points_history').insert([{ customer_id: selectedCustomer.id, order_id: orderId, points: -redeemPoints, type: 'canjeados', note: 'Descuento en compra' }]);
    }
    await supabaseClient.from('points_history').insert([{ customer_id: selectedCustomer.id, order_id: orderId, points: earned, type: 'ganados', note: bday ? 'Puntos x2 cumpleaños' : 'Compra' }]);
    if (bday) addNotification('pago', `🎂 ¡Cumpleaños de ${selectedCustomer.name}!`, 'Puntos dobles aplicados en esta compra');
    const result = { name: selectedCustomer.name, earned, newBalance: newPoints };
    selectedCustomer = null;
    redeemPoints = 0;
    return result;
}

function resetLoyaltyUI() {
    selectedCustomer = null;
    redeemPoints = 0;
    document.getElementById('selected-customer').style.display = 'none';
    document.getElementById('redeem-row').style.display = 'none';
    document.getElementById('loyalty-search-box').style.display = 'block';
    document.getElementById('customer-search').value = '';
    document.getElementById('customer-suggestions').innerHTML = '';
    document.getElementById('modal-discount-row').style.display = 'none';
}

// ============ QR DE MESA ============
function openTableQR(tableId, tableName) {
    currentQRTable = { id: tableId, name: tableName };
    document.getElementById('qr-table-title').textContent = `QR - ${tableName}`;
    const container = document.getElementById('qr-table-code');
    container.innerHTML = '';
    const url = `${window.location.origin}/menu.html?mesa=${tableId}`;
    new QRCode(container, { text: url, width: 200, height: 200, correctLevel: QRCode.CorrectLevel.M });
    document.getElementById('qr-table-modal').classList.add('active');
}

function setupQREvents() {
    document.getElementById('btn-close-qr-table').addEventListener('click', () => closeModal('qr-table-modal'));
    document.getElementById('btn-print-qr').addEventListener('click', () => {
        if (!currentQRTable) return;
        const url = `${window.location.origin}/menu.html?mesa=${currentQRTable.id}`;
        const win = window.open('', '_blank');
        win.document.write(`<html><head><title>QR ${currentQRTable.name}</title><style>body{font-family:sans-serif;text-align:center;padding:2rem;}h2{margin-bottom:0.5rem;}p{color:#666;}</style></head><body><h2>🌿 TPV Punto Verde</h2><p>${currentQRTable.name} - Escanea para pedir</p><div id="q"></div><p style="font-size:0.7rem;margin-top:1rem;">${url}</p><script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"><\/script><script>new QRCode(document.getElementById('q'),{text:'${url}',width:250,height:250});setTimeout(()=>window.print(),600);<\/script></body></html>`);
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
    const total = diner.items.reduce((s, i) => s + (i.price * i.qty), 0);
    document.getElementById('diner-total').textContent = '$' + Math.round(total).toLocaleString();
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
        const { data: order, error: orderError } = await supabaseClient.from('orders').insert([{ type: 'mesa', status: 'nuevo', total: total, paid: true, pay_method: currentDinerPayMethod, source: 'tpv', user_email: currentUser?.email, table_id: activeTableId, diner_name: diner.name }]).select().single();
        if (orderError) throw orderError;
        const orderItems = diner.items.map(item => ({ order_id: order.id, name: item.name, price: item.price, qty: item.qty }));
        const { error: itemsError } = await supabaseClient.from('order_items').insert(orderItems);
        if (itemsError) throw itemsError;
        printTicket(order, diner.items, null);
        await deductInventory(diner.items);
        await recordEmployeeSale(order.id, total);
        const remainingItems = currentTableOrder.order_items.filter(origItem => !diner.items.some(dinerItem => dinerItem.orderItemId === origItem.id));
        const newTotal = remainingItems.reduce((s, i) => s + (i.price * i.qty), 0);
        if (remainingItems.length === 0) { await supabaseClient.from('orders').update({ status: 'nuevo', paid: true }).eq('id', currentTableOrder.id); await supabaseClient.from('tables').update({ status: 'libre', current_order_id: null }).eq('id', activeTableId); currentTableOrder = null; }
        else { await supabaseClient.from('orders').update({ total: newTotal }).eq('id', currentTableOrder.id); const paidItemIds = diner.items.map(i => i.orderItemId); await supabaseClient.from('order_items').delete().in('id', paidItemIds); currentTableOrder.order_items = remainingItems; currentTableOrder.total = newTotal; }
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
        return `<div class="ingredient-card ${statusClass}"><div class="ingredient-header"><div class="ingredient-name">${ing.name}</div><div class="ingredient-actions"><button class="ingredient-action-btn" onclick="editIngredient(${ing.id})">✏️</button><button class="ingredient-action-btn" onclick="deleteIngredient(${ing.id})">🗑️</button></div></div><div class="ingredient-stock">${ing.stock} <span>${unitLabel}</span></div><div class="ingredient-meta"><span>Mínimo: ${ing.min_stock} ${unitLabel}</span><span class="ingredient-cost">$${ing.cost_per_unit}/${unitLabel}</span></div><button class="ingredient-recipe-btn" onclick="openRecipeModal(${ing.id})">📋 Ver Recetas</button></div>`;
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
        if (id) { await supabaseClient.from('ingredients').update({ name, stock, unit, min_stock, cost_per_unit }).eq('id', id); }
        else { await supabaseClient.from('ingredients').insert([{ name, stock, unit, min_stock, cost_per_unit }]); }
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
        const allProducts = prods || [];
        for (const p of allProducts) { await supabaseClient.from('recipes').insert([{ product_id: p.id, ingredient_id: ingredientId, quantity }]); }
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
            <div class="staff-header">
                <div class="staff-name">${s.full_name || s.email}</div>
                <span class="staff-role-badge staff-role-${s.role}">${s.role}</span>
            </div>
            <div class="staff-email">${s.email}</div>
            <div class="staff-meta">
                <span>Ventas mes: <strong>$${Math.round(monthSales).toLocaleString()}</strong></span>
                <span class="staff-commission">Comisión: $${Math.round(monthComm).toLocaleString()}</span>
            </div>
            <div class="staff-meta"><span>Rate: ${s.commission_rate || 0}%</span><span>${s.active ? '✅ Activo' : '⛔ Inactivo'}</span></div>
            <div class="staff-actions">
                <button class="staff-action-btn edit" onclick="editStaff('${s.id}')">✏️ Editar</button>
                <button class="staff-action-btn delete" onclick="deleteStaff('${s.id}')">🗑️ Eliminar</button>
            </div>
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
        if (id) {
            const { error } = await supabaseClient.from('profiles').update({ full_name, email, role, commission_rate, active }).eq('id', id);
            if (error) throw error;
        } else {
            if (!password || password.length < 6) return alert('La contraseña debe tener al menos 6 caracteres');
            const { data: newUser, error: authError } = await supabaseClient.auth.signUp({ email, password });
            if (authError) throw authError;
            if (!newUser.user) throw new Error('No se pudo crear el usuario');
            const { error: profError } = await supabaseClient.from('profiles').insert([{ id: newUser.user.id, email, full_name, role, commission_rate, active }]);
            if (profError) throw profError;
        }
        closeModal('staff-modal');
        loadStaff();
        showToast('pago', '✓ Empleado guardado', full_name);
    } catch (error) { alert('Error: ' + error.message); }
}

async function editStaff(id) { const s = staffList.find(x => x.id === id); if (s) openStaffModal(s); }

async function deleteStaff(id) {
    if (id === currentUser.id) return alert('No puedes eliminar tu propia cuenta');
    if (!confirm('¿Eliminar este empleado?')) return;
    try {
        const { error } = await supabaseClient.from('profiles').delete().eq('id', id);
        if (error) throw error;
        loadStaff();
        showToast('pago', '🗑️ Empleado eliminado', '');
    } catch (error) { alert('Error: ' + error.message); }
}

async function recordEmployeeSale(orderId, amount) {
    if (!currentProfile) return;
    const commission = amount * ((currentProfile.commission_rate || 0) / 100);
    await supabaseClient.from('employee_sales').insert([{ order_id: orderId, employee_id: currentProfile.id, amount, commission }]);
}

// ============ PRODUCTOS Y CARRITO ============
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
    cats.forEach(cat => { if (cat) { const btn = document.createElement('button'); btn.className = 'cat-btn'; btn.dataset.cat = cat; btn.textContent = cat; bar.appendChild(btn); } });
}

function renderProducts() {
    const grid = document.getElementById('product-grid');
    const filtered = currentCategory === 'all' ? products : products.filter(p => p.category === currentCategory);
    grid.innerHTML = filtered.map(p => `<div class="product-card" data-id="${p.id}"><img class="product-img" src="${p.image || 'https://via.placeholder.com/120x60?text=Sin+Imagen'}" alt="${p.name}"><div class="product-name">${p.name}</div><div class="product-price">$${Number(p.price).toLocaleString()}</div></div>`).join('');
}

function addToCart(productId) {
    const product = products.find(p => p.id === productId);
    if (!product) return;
    const existing = cart.find(i => i.id === productId);
    if (existing) { existing.qty++; } else { cart.push({ ...product, qty: 1 }); }
    renderCart();
    renderTableOrder();
}

function renderCart() {
    const container = document.getElementById('cart-items');
    if (cart.length === 0) { container.innerHTML = '<div class="empty-cart">Añade productos para empezar</div>'; updateTotals(0); return; }
    container.innerHTML = cart.map(item => `<div class="cart-item"><div><div class="cart-item-name">${item.name}</div><div class="qty-controls"><button class="qty-btn" onclick="changeQty(${item.id}, -1)">−</button><span>${item.qty}</span><button class="qty-btn" onclick="changeQty(${item.id}, 1)">+</button></div></div><div class="cart-item-price">$${(item.price * item.qty).toLocaleString()}</div></div>`).join('');
    updateTotals(cart.reduce((sum, i) => sum + (i.price * i.qty), 0));
}

function changeQty(id, delta) {
    const item = cart.find(i => i.id === id);
    if (!item) return;
    item.qty += delta;
    if (item.qty <= 0) cart = cart.filter(i => i.id !== id);
    renderCart();
    renderTableOrder();
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
        const discount = redeemPoints * POINT_VALUE;
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
    const { data: ordersData, error: ordersError } = await supabaseClient.from('orders').select('*, order_items(*)').eq('status', 'pendiente_pago');
    if (ordersError) return;
    const ordersByTable = {};
    (ordersData || []).forEach(order => { if (order.table_id) { if (!ordersByTable[order.table_id]) ordersByTable[order.table_id] = []; ordersByTable[order.table_id].push(order); } });
    tables = (tablesData || []).map(table => { const tableOrders = ordersByTable[table.id] || []; const pendingItems = tableOrders.flatMap(o => o.order_items || []); const pendingTotal = tableOrders.reduce((sum, o) => sum + (o.total || 0), 0); const visualStatus = pendingItems.length > 0 ? 'ocupada' : 'libre'; return { ...table, pendingOrders: tableOrders, pendingItems: pendingItems, pendingTotal: pendingTotal, visualStatus: visualStatus }; });
    renderTables();
    renderMiniTables();
}

function renderTables() {
    const grid = document.getElementById('tables-grid');
    if (!grid) return;
    if (tables.length === 0) { grid.innerHTML = '<p style="text-align:center; color: #6b7280; padding: 2rem;">No hay mesas disponibles</p>'; return; }
    grid.innerHTML = tables.map(table => {
        const hasOrders = table.pendingItems && table.pendingItems.length > 0;
        const status = hasOrders ? table.visualStatus : 'libre';
        const itemsGrouped = {};
        (table.pendingItems || []).forEach(item => { const key = item.name; if (!itemsGrouped[key]) itemsGrouped[key] = { name: item.name, qty: 0, price: item.price }; itemsGrouped[key].qty += item.qty; });
        const itemsHtml = hasOrders ? Object.values(itemsGrouped).map(item => `<div class="table-order-item"><span>${item.qty}x ${item.name}</span><span>$${Math.round(item.price * item.qty).toLocaleString()}</span></div>`).join('') : '';
        return `<div class="table-card status-${status}" onclick="selectTable(${table.id}, '${table.name}')">
            <button style="position:absolute; top:0.5rem; right:0.5rem; background:#3b82f6; color:white; border:none; padding:0.3rem 0.6rem; border-radius:6px; font-weight:700; cursor:pointer; font-size:0.7rem; z-index:10;" onclick="event.stopPropagation(); openTableQR(${table.id}, '${table.name}')">📱 QR</button>
            <div class="table-name">${table.name}</div>
            <div class="table-status">${hasOrders ? 'OCUPADA' : 'LIBRE'}</div>
            ${hasOrders ? `<div class="table-orders-list">${itemsHtml}</div><div class="table-order-total"><span>Total:</span><span>$${Math.round(table.pendingTotal).toLocaleString()}</span></div><button class="btn-cobrar-mesa-card" onclick="event.stopPropagation(); cobrarMesaDirecta(${table.id})">💰 COBRAR</button>` : '<div style="flex:1;"></div>'}
        </div>`;
    }).join('');
}

function renderMiniTables() {
    const bar = document.getElementById('mini-tables-bar');
    if (!bar) return;
    if (tables.length === 0) { bar.innerHTML = '<span style="color: var(--text-gray); font-size: 0.85rem;">Cargando mesas...</span>'; return; }
    bar.innerHTML = tables.map(table => { const hasOrders = table.pendingItems && table.pendingItems.length > 0; const status = hasOrders ? table.visualStatus : 'libre'; const isActive = table.id === activeTableId ? 'active' : ''; return `<div class="mini-table status-${status} ${isActive}" onclick="selectTable(${table.id}, '${table.name}')">${table.name}</div>`; }).join('');
}

async function selectTable(id, name) {
    activeTableId = id; cart = [];
    const table = tables.find(t => t.id === id);
    if (table && table.pendingOrders && table.pendingOrders.length > 0) { currentTableOrder = table.pendingOrders[0]; const { data: fullOrder } = await supabaseClient.from('orders').select('*, order_items(*)').eq('id', currentTableOrder.id).single(); if (fullOrder) currentTableOrder = fullOrder; } else { currentTableOrder = null; }
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
    activeTableId = tableId; currentTableOrder = table.pendingOrders[0];
    const { data: fullOrder } = await supabaseClient.from('orders').select('*, order_items(*)').eq('id', currentTableOrder.id).single();
    if (fullOrder) currentTableOrder = fullOrder;
    openPayModalForTable();
}

function renderTableOrder() {
    const section = document.getElementById('table-order-section');
    const itemsContainer = document.getElementById('table-order-items');
    const totalElement = document.getElementById('table-order-total');
    const btnPay = document.getElementById('btn-pay');
    const btnDivide = document.getElementById('btn-divide-account');
    if (!currentTableOrder || !currentTableOrder.order_items || currentTableOrder.order_items.length === 0) { section.style.display = 'none'; if (activeTableId) btnPay.textContent = `AÑADIR A MESA ($${Math.round(cart.reduce((sum, i) => sum + (i.price * i.qty), 0)).toLocaleString()})`; else btnPay.textContent = `COBRAR ($${Math.round(cart.reduce((sum, i) => sum + (i.price * i.qty), 0)).toLocaleString()})`; if (btnDivide) btnDivide.style.display = 'none'; return; }
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
            const { error: orderError } = await supabaseClient.from('orders').update({ total: currentTableOrder.total + total }).eq('id', currentTableOrder.id);
            if (orderError) throw orderError;
            const orderItems = cart.map(item => ({ order_id: currentTableOrder.id, name: item.name, price: item.price, qty: item.qty }));
            const { error: itemsError } = await supabaseClient.from('order_items').insert(orderItems);
            if (itemsError) throw itemsError;
            currentTableOrder.total += total;
            currentTableOrder.order_items = [...currentTableOrder.order_items, ...cart];
        } else {
            const { data: order, error: orderError } = await supabaseClient.from('orders').insert([{ type: 'mesa', status: 'pendiente_pago', total, paid: false, pay_method: 'pendiente', source: 'tpv', user_email: currentUser?.email, table_id: activeTableId }]).select().single();
            if (orderError) throw orderError;
            const orderItems = cart.map(item => ({ order_id: order.id, name: item.name, price: item.price, qty: item.qty }));
            const { error: itemsError } = await supabaseClient.from('order_items').insert(orderItems);
            if (itemsError) throw itemsError;
            currentTableOrder = order;
            addNotification('nuevo', '📝 Pedido en Mesa', `${tables.find(t => t.id === activeTableId)?.name}: $${Math.round(total).toLocaleString()}`);
        }
        cart = []; renderCart(); renderTableOrder();
        showToast('pago', '✓ Añadido a la mesa', 'Los productos se guardaron en el pedido');
        loadTables();
    } catch (error) { alert('Error: ' + error.message); }
}

// ============ PAGOS ============
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
    const discount = redeemPoints * POINT_VALUE;
    const total = Math.max(0, base - discount);
    if (payMethod === 'efectivo') { const cashReceived = parseFloat(document.getElementById('cash-received').value); if (!cashReceived || cashReceived < total) return alert('Efectivo insuficiente'); }
    try {
        const { data: order, error: orderError } = await supabaseClient.from('orders').insert([{ type: orderType, status: 'nuevo', total, paid: true, pay_method: payMethod, source: 'tpv', user_email: currentUser?.email, table_id: null }]).select().single();
        if (orderError) throw orderError;
        const orderItems = cart.map(item => ({ order_id: order.id, name: item.name, price: item.price, qty: item.qty }));
        const { error: itemsError } = await supabaseClient.from('order_items').insert(orderItems);
        if (itemsError) throw itemsError;
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
    const discount = redeemPoints * POINT_VALUE;
    const total = Math.max(0, base - discount);
    if (payMethod === 'efectivo') { const cashReceived = parseFloat(document.getElementById('cash-received').value); if (!cashReceived || cashReceived < total) return alert('Efectivo insuficiente'); }
    try {
        const { error } = await supabaseClient.from('orders').update({ status: 'nuevo', paid: true, pay_method: payMethod, total }).eq('id', currentTableOrder.id);
        if (error) throw error;
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
async function loadKitchenOrders() { const { data, error } = await supabaseClient.from('orders').select('*, order_items(*)').neq('status', 'entregado').neq('status', 'pendiente_pago').order('created_at', { ascending: false }); if (error) return; kitchenOrders = data || []; renderKitchenOrders(); updateKitchenStats(); }

function renderKitchenOrders() { ['nuevo', 'cocina', 'listo'].forEach(status => { const container = document.getElementById(`orders-${status}`); const orders = kitchenOrders.filter(o => o.status === status); if (orders.length === 0) { container.innerHTML = '<div class="empty-cart">No hay pedidos</div>'; return; } container.innerHTML = orders.map(order => { const time = new Date(order.created_at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }); const tableText = order.table_id ? ` (Mesa ${order.table_id})` : ''; const dinerText = order.diner_name ? ` - ${order.diner_name}` : ''; const webBadge = order.source === 'web' ? ' 📱' : ''; const itemsHtml = order.order_items.map(item => `<div class="order-item"><span><span class="item-qty">${item.qty}x</span> ${item.name}</span></div>`).join(''); let actionBtn = ''; if (status === 'nuevo') actionBtn = `<button class="action-btn-kitchen btn-cocina" onclick="updateOrderStatus(${order.id}, 'cocina')">→ Cocina</button>`; else if (status === 'cocina') actionBtn = `<button class="action-btn-kitchen btn-listo" onclick="updateOrderStatus(${order.id}, 'listo')">✓ Listo</button>`; else if (status === 'listo') actionBtn = `<button class="action-btn-kitchen btn-entregado" onclick="updateOrderStatus(${order.id}, 'entregado')">✓ Entregado</button>`; return `<div class="order-card status-${status}"><div class="order-header"><div class="order-id">#${order.id}${tableText}${dinerText}${webBadge}</div><div class="order-type">${order.type.toUpperCase()}</div></div><div class="order-time">${time}</div><div class="order-items">${itemsHtml}</div><div class="order-actions">${actionBtn}</div></div>`; }).join(''); }); }

function updateKitchenStats() { document.getElementById('count-nuevo').textContent = kitchenOrders.filter(o => o.status === 'nuevo').length; document.getElementById('count-cocina').textContent = kitchenOrders.filter(o => o.status === 'cocina').length; document.getElementById('count-listo').textContent = kitchenOrders.filter(o => o.status === 'listo').length; }

async function updateOrderStatus(orderId, newStatus) {
    const order = kitchenOrders.find(o => o.id === orderId);
    const { error } = await supabaseClient.from('orders').update({ status: newStatus }).eq('id', orderId);
    if (error) { alert('Error: ' + error.message); return; }
    loadKitchenOrders();
    if (newStatus === 'entregado') {
        if (order && order.table_id && !order.paid) {
            await supabaseClient.from('orders').update({ status: 'pendiente_pago' }).eq('id', orderId);
            await supabaseClient.from('tables').update({ status: 'ocupada' }).eq('id', order.table_id);
        } else if (order && order.table_id) {
            await supabaseClient.from('tables').update({ status: 'libre', current_order_id: null }).eq('id', order.table_id);
        }
        loadTables();
    } else if (newStatus === 'listo') {
        if (order && order.table_id) await supabaseClient.from('tables').update({ status: 'pendiente' }).eq('id', order.table_id);
    }
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

function getDateRange(period) { const now = new Date(); const end = new Date(now); end.setHours(23, 59, 59, 999); const start = new Date(now); if (period === 'today') start.setHours(0, 0, 0, 0); else if (period === 'week') { const day = start.getDay(); const diff = start.getDate() - day + (day === 0 ? -6 : 1); start.setDate(diff); start.setHours(0, 0, 0, 0); } else if (period === 'month') { start.setDate(1); start.setHours(0, 0, 0, 0); } const d = new Date(start); if (period === 'today') d.setDate(d.getDate() - 1); else if (period === 'week') d.setDate(d.getDate() - 7); else if (period === 'month') d.setMonth(d.getMonth() - 1); return { start: start.toISOString(), end: end.toISOString(), prevStart: d.toISOString(), prevEnd: start.toISOString() }; }

async function loadReports(period) {
    const range = getDateRange(period);
    const { data: currentOrders } = await supabaseClient.from('orders').select('*, order_items(*)').eq('paid', true).gte('created_at', range.start).lte('created_at', range.end).order('created_at', { ascending: false });
    const { data: prevOrders } = await supabaseClient.from('orders').select('*').eq('paid', true).gte('created_at', range.prevStart).lte('created_at', range.prevEnd);
    const orders = currentOrders || []; const prev = prevOrders || [];
    const totalVentas = orders.reduce((s, o) => s + (o.total || 0), 0); const totalPedidos = orders.length; const ticketPromedio = totalPedidos > 0 ? totalVentas / totalPedidos : 0;
    const prevVentas = prev.reduce((s, o) => s + (o.total || 0), 0); const prevPedidos = prev.length;
    const metodos = {}; orders.forEach(o => { metodos[o.pay_method] = (metodos[o.pay_method] || 0) + o.total; }); const metodoTop = Object.entries(metodos).sort((a, b) => b[1] - a[1])[0];
    document.getElementById('kpi-ventas').textContent = '$' + Math.round(totalVentas).toLocaleString();
    document.getElementById('kpi-pedidos').textContent = totalPedidos;
    document.getElementById('kpi-ticket').textContent = '$' + Math.round(ticketPromedio).toLocaleString();
    document.getElementById('kpi-metodo').textContent = metodoTop ? metodoTop[0].toUpperCase() : '—';
    document.getElementById('kpi-metodo-detail').textContent = metodoTop ? '$' + Math.round(metodoTop[1]).toLocaleString() : '—';
    const renderTrend = (elId, cur, prev) => { const el = document.getElementById(elId); if (prev === 0) { el.textContent = '—'; el.className = 'kpi-trend neutral'; return; } const change = ((cur - prev) / prev) * 100; el.textContent = `${change >= 0 ? '↑' : '↓'} ${Math.abs(Math.round(change))}% vs anterior`; el.className = 'kpi-trend ' + (change > 0 ? 'up' : change < 0 ? 'down' : 'neutral'); };
    renderTrend('kpi-ventas-trend', totalVentas, prevVentas); renderTrend('kpi-pedidos-trend', totalPedidos, prevPedidos); renderTrend('kpi-ticket-trend', ticketPromedio, prevPedidos > 0 ? prevVentas / prevPedidos : 0);
    const horas = new Array(24).fill(0); orders.forEach(o => { horas[new Date(o.created_at).getHours()] += o.total; });
    if (chartHoras) chartHoras.destroy(); chartHoras = new Chart(document.getElementById('chart-horas').getContext('2d'), { type: 'bar', data: { labels: Array.from({length: 24}, (_, i) => `${i}:00`), datasets: [{ label: 'Ventas ($)', data: horas, backgroundColor: 'rgba(16, 185, 129, 0.7)', borderColor: '#10b981', borderWidth: 1, borderRadius: 4 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { callback: v => '$' + v } }, x: { ticks: { maxTicksLimit: 12 } } } } });
    const productos = {}; orders.forEach(o => { (o.order_items || []).forEach(item => { if (!productos[item.name]) productos[item.name] = 0; productos[item.name] += item.qty; }); });
    const sorted = Object.entries(productos).sort((a, b) => b[1] - a[1]).slice(0, 5);
    if (chartProductos) chartProductos.destroy(); chartProductos = new Chart(document.getElementById('chart-productos').getContext('2d'), { type: 'doughnut', data: { labels: sorted.map(p => p[0].length > 20 ? p[0].substring(0, 20) + '...' : p[0]), datasets: [{ data: sorted.map(p => p[1]), backgroundColor: ['#10b981', '#f59e0b', '#3b82f6', '#ef4444', '#8b5cf6'], borderWidth: 2, borderColor: '#fff' }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { font: { size: 11 } } } } } });
    const tbody = document.getElementById('recent-orders-body');
    tbody.innerHTML = orders.slice(0, 10).map(o => { const date = new Date(o.created_at).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); return `<tr><td>#${o.id}</td><td>${date}</td><td>${(o.type || 'mostrador').toUpperCase()}</td><td>${(o.pay_method || '—').toUpperCase()}</td><td><strong>$${Math.round(o.total).toLocaleString()}</strong></td></tr>`; }).join('') || '<tr><td colspan="5" style="text-align:center; color: var(--text-gray); padding: 1rem;">Sin pedidos</td></tr>';
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

function addNotification(tipo, title, message) { const notif = { id: Date.now(), tipo, title, message, time: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) }; notifications.unshift(notif); if (notifications.length > 50) notifications.pop(); unreadNotifs++; updateNotifBadge(); showToast(tipo, title, message); renderNotifications(); }
function updateNotifBadge() { const badge = document.getElementById('notif-badge'); badge.textContent = unreadNotifs; badge.style.display = unreadNotifs > 0 ? 'flex' : 'none'; }
function renderNotifications() { const list = document.getElementById('notif-list'); if (notifications.length === 0) { list.innerHTML = '<div class="notif-empty">No hay notificaciones</div>'; return; } list.innerHTML = notifications.map(n => `<div class="notif-item tipo-${n.tipo}"><div class="notif-title">${n.title}</div><div class="notif-message">${n.message}</div><div class="notif-time">${n.time}</div></div>`).join(''); }
function showToast(tipo, title, message) { const container = document.getElementById('toast-container'); const toast = document.createElement('div'); toast.className = `toast tipo-${tipo}`; toast.innerHTML = `<div class="toast-title">${title}</div><div class="toast-message">${message}</div>`; container.appendChild(toast); setTimeout(() => { toast.classList.add('removing'); setTimeout(() => toast.remove(), 300); }, 4000); }

// ============ REALTIME ============
function setupRealtimeGlobal() { supabaseClient.channel('orders-global').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, (payload) => { const order = payload.new; const tableText = order.table_id ? ` (Mesa ${order.table_id})` : ''; const webText = order.source === 'web' ? ' 📱 (QR)' : ''; addNotification('nuevo', `📝 Nuevo Pedido #${order.id}${tableText}`, `Tipo: ${order.type.toUpperCase()}${webText} | Total: $${Math.round(order.total).toLocaleString()}`); const kitchenView = document.getElementById('view-kitchen'); if (kitchenView.classList.contains('active')) loadKitchenOrders(); loadTables(); }).on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders' }, (payload) => { const order = payload.new; const oldStatus = payload.old.status; const newStatus = order.status; let tipo = '', title = '', message = ''; const tableText = order.table_id ? ` (Mesa ${order.table_id})` : ''; if (oldStatus === 'nuevo' && newStatus === 'cocina') { tipo = 'cocina'; title = `🔥 Pedido #${order.id}${tableText} en preparación`; message = 'La cocina está preparando el pedido'; } else if (oldStatus === 'cocina' && newStatus === 'listo') { tipo = 'listo'; title = `✅ Pedido #${order.id}${tableText} listo`; message = 'El pedido está listo para entregar'; loadTables(); } else if (newStatus === 'entregado') { tipo = 'pago'; title = `✓ Pedido #${order.id}${tableText} entregado`; message = 'Pedido completado'; loadTables(); } if (title) addNotification(tipo, title, message); const kitchenView = document.getElementById('view-kitchen'); if (kitchenView.classList.contains('active')) loadKitchenOrders(); }).on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'tables' }, () => { loadTables(); }).subscribe(); }

// ============ CAJA / ARQUEOS ============
async function loadCashStatus() { const { data: session, error } = await supabaseClient.from('cash_sessions').select('*').is('closed_at', null).single(); if (error || !session) { currentSession = null; document.getElementById('cash-status').innerHTML = '<span class="status-closed">🔴 Caja Cerrada</span>'; document.getElementById('action-buttons').innerHTML = '<button class="action-btn btn-open" onclick="openModal(\'modal-open-cash\')">🔓 Abrir Caja</button>'; document.getElementById('cash-summary').style.display = 'none'; } else { currentSession = session; document.getElementById('cash-status').innerHTML = `<span class="status-open">🟢 Caja Abierta</span><br><small>Abierta: ${new Date(session.opened_at).toLocaleString('es-ES')}</small><br><small>Fondo inicial: $${session.fondo.toLocaleString()}</small>`; document.getElementById('action-buttons').innerHTML = `<button class="action-btn btn-movement" onclick="openModal('modal-movement')">💵 Movimiento</button><button class="action-btn btn-count" onclick="openModal('modal-count')">🔢 Arqueo Ciego</button><button class="action-btn btn-close" onclick="closeCashSession()">🔒 Cerrar Caja</button>`; await loadCashSummary(); } }

async function loadCashSummary() { if (!currentSession) return; const { data: orders } = await supabaseClient.from('orders').select('*').gte('created_at', currentSession.opened_at).eq('paid', true); const { data: movements } = await supabaseClient.from('cash_movements').select('*').eq('session_id', currentSession.id); let efectivo = 0, tarjeta = 0, bizum = 0, totalPedidos = 0; orders.forEach(o => { totalPedidos++; if (o.pay_method === 'efectivo') efectivo += o.total; if (o.pay_method === 'tarjeta') tarjeta += o.total; if (o.pay_method === 'bizum') bizum += o.total; }); let entradas = 0, salidas = 0; movements.forEach(m => { if (m.tipo === 'entrada') entradas += m.importe; if (m.tipo === 'salida') salidas += m.importe; }); const totalVentas = efectivo + tarjeta + bizum; const totalCaja = currentSession.fondo + efectivo + entradas - salidas; document.getElementById('cash-summary').style.display = 'block'; document.getElementById('summary-content').innerHTML = `<div class="summary-grid"><div class="summary-card"><div class="summary-label">Total Ventas</div><div class="summary-value">$${totalVentas.toLocaleString()}</div></div><div class="summary-card"><div class="summary-label">Pedidos</div><div class="summary-value">${totalPedidos}</div></div><div class="summary-card"><div class="summary-label">Efectivo</div><div class="summary-value">$${efectivo.toLocaleString()}</div></div><div class="summary-card"><div class="summary-label">Tarjeta</div><div class="summary-value">$${tarjeta.toLocaleString()}</div></div><div class="summary-card"><div class="summary-label">Bizum</div><div class="summary-value">$${bizum.toLocaleString()}</div></div><div class="summary-card highlight"><div class="summary-label">Total en Caja</div><div class="summary-value">$${totalCaja.toLocaleString()}</div></div></div><div class="movements-section"><h4>Movimientos registrados: ${movements.length}</h4>${movements.length > 0 ? movements.map(m => `<div class="movement-item ${m.tipo}"><span>${m.tipo === 'entrada' ? '📥' : '📤'} ${m.nota || m.metodo}</span><span>$${m.importe.toLocaleString()}</span></div>`).join('') : '<p style="color: var(--text-gray); font-size: 0.9rem;">Sin movimientos</p>'}</div>`; }

document.getElementById('btn-confirm-open').addEventListener('click', async () => { const fund = parseFloat(document.getElementById('opening-fund').value) || 0; const { error } = await supabaseClient.from('cash_sessions').insert([{ fondo: fund, user_email: currentUser.email }]); if (error) { alert('Error: ' + error.message); } else { closeModal('modal-open-cash'); loadCashStatus(); } });
document.getElementById('btn-confirm-movement').addEventListener('click', async () => { const type = document.getElementById('movement-type').value; const method = document.getElementById('movement-method').value; const amount = parseFloat(document.getElementById('movement-amount').value) || 0; const note = document.getElementById('movement-note').value; if (!currentSession) return alert('Caja no abierta'); const { error } = await supabaseClient.from('cash_movements').insert([{ session_id: currentSession.id, tipo: type, metodo: method, importe: amount, nota: note }]); if (error) { alert('Error: ' + error.message); } else { closeModal('modal-movement'); document.getElementById('movement-amount').value = ''; document.getElementById('movement-note').value = ''; loadCashStatus(); } });
document.querySelectorAll('.bill-count').forEach(input => { input.addEventListener('input', () => { let total = 0; document.querySelectorAll('.bill-count').forEach(i => { total += parseInt(i.dataset.value) * (parseInt(i.value) || 0); }); document.getElementById('counted-total').textContent = '$' + total.toLocaleString(); }); });
document.getElementById('btn-confirm-count').addEventListener('click', async () => { if (!currentSession) return alert('Caja no abierta'); let counted = 0; document.querySelectorAll('.bill-count').forEach(i => { counted += parseInt(i.dataset.value) * (parseInt(i.value) || 0); }); const { data: movements } = await supabaseClient.from('cash_movements').select('*').eq('session_id', currentSession.id).eq('metodo', 'efectivo'); let entradas = 0, salidas = 0; movements.forEach(m => { if (m.tipo === 'entrada') entradas += m.importe; if (m.tipo === 'salida') salidas += m.importe; }); const { data: orders } = await supabaseClient.from('orders').select('total, pay_method').eq('source', 'tpv').gte('created_at', currentSession.opened_at).eq('paid', true); let ventasEfectivo = 0; orders.forEach(o => { if (o.pay_method === 'efectivo') ventasEfectivo += o.total; }); const esperado = currentSession.fondo + ventasEfectivo + entradas - salidas; const diferencia = counted - esperado; const { error } = await supabaseClient.from('cash_arqueos').insert([{ session_id: currentSession.id, fondo: currentSession.fondo, esperado, contado: counted, dif: diferencia, v_efectivo: ventasEfectivo, entradas, salidas, kind: 'X' }]); if (error) { alert('Error: ' + error.message); } else { closeModal('modal-count'); alert(`Arqueo registrado\nEsperado: $${esperado.toLocaleString()}\nContado: $${counted.toLocaleString()}\nDiferencia: $${diferencia.toLocaleString()}`); loadCashStatus(); } });
async function closeCashSession() { if (!currentSession) return alert('Caja no abierta'); if (!confirm('¿Cerrar caja?')) return; const { error } = await supabaseClient.from('cash_sessions').update({ closed_at: new Date().toISOString() }).eq('id', currentSession.id); if (error) { alert('Error: ' + error.message); } else { loadCashStatus(); } }

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

init();