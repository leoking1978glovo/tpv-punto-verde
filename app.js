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
let currentTableOrder = null;

let chartHoras = null;
let chartProductos = null;
let currentReportPeriod = 'today';

let diners = [];
let unassignedItems = [];
let currentDinerPayId = null;
let currentDinerPayMethod = 'efectivo';

async function init() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session) { currentUser = session.user; showApp(); } else { showLogin(); }
    setupLoginEvents();
    setupNavigation();
    setupNotificationsPanel();
    setupReportFilters();
    setupDivideEvents();
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
            const view = item.dataset.view;
            document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
            item.classList.add('active');

            if (view === 'tables') {
                activeTableId = null;
                currentTableOrder = null;
                cart = [];
                renderCart();
                renderTableOrder();
                document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
                document.getElementById('view-tables').classList.add('active');
                loadTables();
            } else if (view === 'pos') {
                if (!activeTableId) {
                    currentTableOrder = null;
                    cart = [];
                    renderCart();
                    renderTableOrder();
                    document.getElementById('pos-title').textContent = 'Caja - Mostrador';
                }
                document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
                document.getElementById('view-pos').classList.add('active');
                renderMiniTables();
            } else if (view === 'kitchen') {
                document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
                document.getElementById('view-kitchen').classList.add('active');
                loadKitchenOrders();
            } else if (view === 'reports') {
                document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
                document.getElementById('view-reports').classList.add('active');
                loadReports(currentReportPeriod);
            } else if (view === 'cash') {
                document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
                document.getElementById('view-cash').classList.add('active');
                loadCashStatus();
            }
        });
    });

    document.getElementById('btn-back-to-tables').addEventListener('click', () => {
        activeTableId = null;
        currentTableOrder = null;
        cart = [];
        renderCart();
        renderTableOrder();
        document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
        document.querySelector('[data-view="tables"]').classList.add('active');
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        document.getElementById('view-tables').classList.add('active');
        loadTables();
    });
}

function setupDivideEvents() {
    document.getElementById('btn-divide-account').addEventListener('click', openDivideModal);
    document.getElementById('btn-close-divide').addEventListener('click', () => closeModal('divide-modal'));
    document.getElementById('btn-cancel-divide').addEventListener('click', () => closeModal('divide-modal'));
    document.getElementById('btn-add-diner').addEventListener('click', addDiner);
    document.getElementById('btn-pay-all').addEventListener('click', () => {
        closeModal('divide-modal');
        openPayModalForTable();
    });
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
    if (!currentTableOrder || !currentTableOrder.order_items || currentTableOrder.order_items.length === 0) {
        return alert('No hay productos en el pedido');
    }
    
    diners = [
        { id: 1, name: 'Comensal 1', items: [] },
        { id: 2, name: 'Comensal 2', items: [] }
    ];
    
    unassignedItems = currentTableOrder.order_items.map((item, idx) => ({
        uid: idx,
        orderItemId: item.id,
        name: item.name,
        price: item.price,
        qty: item.qty
    }));
    
    renderDivideModal();
    document.getElementById('divide-modal').classList.add('active');
}

function addDiner() {
    const newId = diners.length > 0 ? Math.max(...diners.map(d => d.id)) + 1 : 1;
    diners.push({ id: newId, name: `Comensal ${newId}`, items: [] });
    renderDivideModal();
}

function removeDiner(dinerId) {
    const diner = diners.find(d => d.id === dinerId);
    if (!diner) return;
    unassignedItems.push(...diner.items);
    diners = diners.filter(d => d.id !== dinerId);
    renderDivideModal();
}

function assignItemToDiner(uid, dinerId) {
    const itemIdx = unassignedItems.findIndex(i => i.uid === uid);
    if (itemIdx === -1) return;
    const item = unassignedItems.splice(itemIdx, 1)[0];
    const diner = diners.find(d => d.id === dinerId);
    if (diner) {
        diner.items.push(item);
    }
    renderDivideModal();
}

function removeItemFromDiner(uid, dinerId) {
    const diner = diners.find(d => d.id === dinerId);
    if (!diner) return;
    const itemIdx = diner.items.findIndex(i => i.uid === uid);
    if (itemIdx === -1) return;
    const item = diner.items.splice(itemIdx, 1)[0];
    unassignedItems.push(item);
    renderDivideModal();
}

function updateDinerName(dinerId, newName) {
    const diner = diners.find(d => d.id === dinerId);
    if (diner) diner.name = newName;
}

function renderDivideModal() {
    const dinersList = document.getElementById('diners-list');
    const unassignedList = document.getElementById('unassigned-items');
    
    dinersList.innerHTML = diners.map(diner => {
        const total = diner.items.reduce((s, i) => s + (i.price * i.qty), 0);
        const itemsHtml = diner.items.map(item => `
            <div class="diner-item">
                <span class="diner-item-name">${item.qty}x ${item.name}</span>
                <span>$${Math.round(item.price * item.qty).toLocaleString()}</span>
                <div class="diner-item-controls">
                    <button class="diner-item-btn remove" onclick="removeItemFromDiner(${item.uid}, ${diner.id})">✕</button>
                </div>
            </div>
        `).join('');
        
        return `
            <div class="diner-card">
                <div class="diner-header">
                    <div class="diner-name">
                        <input type="text" value="${diner.name}" onchange="updateDinerName(${diner.id}, this.value)">
                    </div>
                    <div style="display:flex; align-items:center; gap:0.5rem;">
                        <span class="diner-total">$${Math.round(total).toLocaleString()}</span>
                        ${total > 0 ? `<button class="btn-cobrar-diner" onclick="openDinerPayModal(${diner.id})">💰 Cobrar</button>` : ''}
                        ${diners.length > 1 ? `<button class="btn-remove-diner" onclick="removeDiner(${diner.id})">️</button>` : ''}
                    </div>
                </div>
                <div class="diner-items">
                    ${itemsHtml || '<div style="color: var(--text-gray); font-size: 0.8rem; text-align: center; padding: 0.5rem;">Sin productos</div>'}
                </div>
            </div>
        `;
    }).join('');
    
    if (unassignedItems.length === 0) {
        unassignedList.innerHTML = '<div style="color: var(--text-gray); text-align: center; padding: 1rem;">Todos los productos asignados ✓</div>';
    } else {
        unassignedList.innerHTML = unassignedItems.map(item => `
            <div class="unassigned-item">
                <div class="unassigned-item-info">
                    <div class="unassigned-item-name">${item.qty}x ${item.name}</div>
                    <div class="unassigned-item-price">$${Math.round(item.price * item.qty).toLocaleString()}</div>
                </div>
                <select onchange="assignItemToDiner(${item.uid}, parseInt(this.value)); this.value='';" style="padding: 0.3rem; border-radius: 4px; border: 1px solid var(--border);">
                    <option value="">Asignar a...</option>
                    ${diners.map(d => `<option value="${d.id}">${d.name}</option>`).join('')}
                </select>
            </div>
        `).join('');
    }
    
    const totalMesa = currentTableOrder.total;
    document.getElementById('btn-pay-all').textContent = `💰 Cobrar Todo ($${Math.round(totalMesa).toLocaleString()})`;
}

async function openDinerPayModal(dinerId) {
    const diner = diners.find(d => d.id === dinerId);
    if (!diner || diner.items.length === 0) return alert('Este comensal no tiene productos');
    
    currentDinerPayId = dinerId;
    currentDinerPayMethod = 'efectivo';
    
    document.getElementById('diner-pay-title').textContent = `Cobrar ${diner.name}`;
    document.getElementById('diner-cart-items').innerHTML = diner.items.map(item => `
        <div class="cart-item">
            <div class="cart-item-name">${item.qty}x ${item.name}</div>
            <div class="cart-item-price">$${Math.round(item.price * item.qty).toLocaleString()}</div>
        </div>
    `).join('');
    
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
    
    if (currentDinerPayMethod === 'efectivo') {
        const cashReceived = parseFloat(document.getElementById('diner-cash-received').value);
        if (!cashReceived || cashReceived < total) return alert('Efectivo insuficiente');
    }
    
    try {
        const { data: order, error: orderError } = await supabaseClient.from('orders').insert([{
            type: 'mesa',
            status: 'nuevo',
            total: total,
            paid: true,
            pay_method: currentDinerPayMethod,
            source: 'tpv',
            user_email: currentUser?.email,
            table_id: activeTableId,
            diner_name: diner.name
        }]).select().single();
        
        if (orderError) throw orderError;
        
        const orderItems = diner.items.map(item => ({
            order_id: order.id,
            name: item.name,
            price: item.price,
            qty: item.qty
        }));
        
        const { error: itemsError } = await supabaseClient.from('order_items').insert(orderItems);
        if (itemsError) throw itemsError;
        
        // ✅ Imprimir ticket del comensal
        printTicket(order, diner.items);
        
        const remainingItems = currentTableOrder.order_items.filter(origItem => {
            return !diner.items.some(dinerItem => dinerItem.orderItemId === origItem.id);
        });
        
        const newTotal = remainingItems.reduce((s, i) => s + (i.price * i.qty), 0);
        
        if (remainingItems.length === 0) {
            await supabaseClient.from('orders').update({
                status: 'nuevo',
                paid: true
            }).eq('id', currentTableOrder.id);
            
            await supabaseClient.from('tables').update({
                status: 'libre',
                current_order_id: null
            }).eq('id', activeTableId);
            
            currentTableOrder = null;
        } else {
            await supabaseClient.from('orders').update({
                total: newTotal
            }).eq('id', currentTableOrder.id);
            
            const paidItemIds = diner.items.map(i => i.orderItemId);
            await supabaseClient.from('order_items').delete().in('id', paidItemIds);
            
            currentTableOrder.order_items = remainingItems;
            currentTableOrder.total = newTotal;
        }
        
        addNotification('pago', `✓ ${diner.name} pagó`, `$${Math.round(total).toLocaleString()} | ${currentDinerPayMethod.toUpperCase()}`);
        
        closeModal('diner-pay-modal');
        closeModal('divide-modal');
        renderCart();
        renderTableOrder();
        loadTables();
        
    } catch (error) {
        alert('Error: ' + error.message);
    }
}

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
    const end = new Date(now);
    end.setHours(23, 59, 59, 999);
    const start = new Date(now);
    
    if (period === 'today') {
        start.setHours(0, 0, 0, 0);
    } else if (period === 'week') {
        const day = start.getDay();
        const diff = start.getDate() - day + (day === 0 ? -6 : 1);
        start.setDate(diff);
        start.setHours(0, 0, 0, 0);
    } else if (period === 'month') {
        start.setDate(1);
        start.setHours(0, 0, 0, 0);
    }
    
    return {
        start: start.toISOString(),
        end: end.toISOString(),
        prevStart: getPreviousPeriodStart(start, period),
        prevEnd: start.toISOString()
    };
}

function getPreviousPeriodStart(currentStart, period) {
    const d = new Date(currentStart);
    if (period === 'today') d.setDate(d.getDate() - 1);
    else if (period === 'week') d.setDate(d.getDate() - 7);
    else if (period === 'month') d.setMonth(d.getMonth() - 1);
    return d.toISOString();
}

async function loadReports(period) {
    const range = getDateRange(period);
    
    const { data: currentOrders, error: err1 } = await supabaseClient
        .from('orders')
        .select('*, order_items(*)')
        .eq('paid', true)
        .gte('created_at', range.start)
        .lte('created_at', range.end)
        .order('created_at', { ascending: false });
    
    const { data: prevOrders, error: err2 } = await supabaseClient
        .from('orders')
        .select('*')
        .eq('paid', true)
        .gte('created_at', range.prevStart)
        .lte('created_at', range.prevEnd);
    
    if (err1 || err2) {
        console.error('Error cargando reportes:', err1, err2);
        return;
    }
    
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
    
    document.getElementById('kpi-ventas').textContent = '$' + Math.round(totalVentas).toLocaleString();
    document.getElementById('kpi-pedidos').textContent = totalPedidos;
    document.getElementById('kpi-ticket').textContent = '$' + Math.round(ticketPromedio).toLocaleString();
    document.getElementById('kpi-metodo').textContent = metodoTop ? metodoTop[0].toUpperCase() : '—';
    document.getElementById('kpi-metodo-detail').textContent = metodoTop ? '$' + Math.round(metodoTop[1]).toLocaleString() : '—';
    
    renderTrend('kpi-ventas-trend', totalVentas, prevVentas);
    renderTrend('kpi-pedidos-trend', totalPedidos, prevPedidos);
    renderTrend('kpi-ticket-trend', ticketPromedio, prevPedidos > 0 ? prevVentas / prevPedidos : 0);
    
    renderChartHoras(orders);
    renderChartProductos(orders);
    renderRecentOrders(orders.slice(0, 10));
}

function renderTrend(elementId, current, previous) {
    const el = document.getElementById(elementId);
    if (previous === 0) {
        el.textContent = '—';
        el.className = 'kpi-trend neutral';
        return;
    }
    const change = ((current - previous) / previous) * 100;
    const arrow = change >= 0 ? '↑' : '↓';
    el.textContent = `${arrow} ${Math.abs(Math.round(change))}% vs período anterior`;
    el.className = 'kpi-trend ' + (change > 0 ? 'up' : change < 0 ? 'down' : 'neutral');
}

function renderChartHoras(orders) {
    const horas = new Array(24).fill(0);
    orders.forEach(o => {
        const h = new Date(o.created_at).getHours();
        horas[h] += o.total;
    });
    
    const labels = Array.from({length: 24}, (_, i) => `${i}:00`);
    
    if (chartHoras) chartHoras.destroy();
    const ctx = document.getElementById('chart-horas').getContext('2d');
    chartHoras = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Ventas ($)',
                data: horas,
                backgroundColor: 'rgba(16, 185, 129, 0.7)',
                borderColor: '#10b981',
                borderWidth: 1,
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { beginAtZero: true, ticks: { callback: v => '$' + v } },
                x: { ticks: { maxTicksLimit: 12 } }
            }
        }
    });
}

function renderChartProductos(orders) {
    const productos = {};
    orders.forEach(o => {
        (o.order_items || []).forEach(item => {
            if (!productos[item.name]) productos[item.name] = 0;
            productos[item.name] += item.qty;
        });
    });
    
    const sorted = Object.entries(productos).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const labels = sorted.map(p => p[0].length > 20 ? p[0].substring(0, 20) + '...' : p[0]);
    const data = sorted.map(p => p[1]);
    const colors = ['#10b981', '#f59e0b', '#3b82f6', '#ef4444', '#8b5cf6'];
    
    if (chartProductos) chartProductos.destroy();
    const ctx = document.getElementById('chart-productos').getContext('2d');
    chartProductos = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: colors,
                borderWidth: 2,
                borderColor: '#fff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom', labels: { font: { size: 11 } } }
            }
        }
    });
}

function renderRecentOrders(orders) {
    const tbody = document.getElementById('recent-orders-body');
    if (orders.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color: var(--text-gray); padding: 1rem;">Sin pedidos</td></tr>';
        return;
    }
    tbody.innerHTML = orders.map(o => {
        const date = new Date(o.created_at).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
        const tipo = (o.type || 'mostrador').toUpperCase();
        const metodo = (o.pay_method || '—').toUpperCase();
        return `<tr>
            <td>#${o.id}</td>
            <td>${date}</td>
            <td>${tipo}</td>
            <td>${metodo}</td>
            <td><strong>$${Math.round(o.total).toLocaleString()}</strong></td>
        </tr>`;
    }).join('');
}

async function loadTables() {
    const { data: tablesData, error: tablesError } = await supabaseClient.from('tables').select('*').order('id');
    if (tablesError) return;
    
    const { data: ordersData, error: ordersError } = await supabaseClient
        .from('orders')
        .select('*, order_items(*)')
        .eq('status', 'pendiente_pago');
    
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
        const visualStatus = pendingItems.length > 0 ? 'ocupada' : 'libre';
        
        return {
            ...table,
            pendingOrders: tableOrders,
            pendingItems: pendingItems,
            pendingTotal: pendingTotal,
            visualStatus: visualStatus
        };
    });
    
    renderTables();
    renderMiniTables();
}

function renderTables() {
    const grid = document.getElementById('tables-grid');
    if (!grid) return;
    if (tables.length === 0) {
        grid.innerHTML = '<p style="text-align:center; color: #6b7280; padding: 2rem;">No hay mesas disponibles</p>';
        return;
    }
    grid.innerHTML = tables.map(table => {
        const hasOrders = table.pendingItems && table.pendingItems.length > 0;
        const status = hasOrders ? table.visualStatus : 'libre';
        
        const itemsGrouped = {};
        (table.pendingItems || []).forEach(item => {
            const key = item.name;
            if (!itemsGrouped[key]) {
                itemsGrouped[key] = { name: item.name, qty: 0, price: item.price };
            }
            itemsGrouped[key].qty += item.qty;
        });
        
        const itemsHtml = hasOrders ? Object.values(itemsGrouped).map(item => 
            `<div class="table-order-item"><span>${item.qty}x ${item.name}</span><span>$${Math.round(item.price * item.qty).toLocaleString()}</span></div>`
        ).join('') : '';
        
        return `
        <div class="table-card status-${status}" onclick="selectTable(${table.id}, '${table.name}')">
            <div class="table-name">${table.name}</div>
            <div class="table-status">${hasOrders ? 'OCUPADA' : 'LIBRE'}</div>
            ${hasOrders ? `
                <div class="table-orders-list">
                    ${itemsHtml}
                </div>
                <div class="table-order-total">
                    <span>Total:</span>
                    <span>$${Math.round(table.pendingTotal).toLocaleString()}</span>
                </div>
                <button class="btn-cobrar-mesa-card" onclick="event.stopPropagation(); cobrarMesaDirecta(${table.id})">💰 COBRAR</button>
            ` : '<div style="flex:1;"></div>'}
        </div>
        `;
    }).join('');
}

function renderMiniTables() {
    const bar = document.getElementById('mini-tables-bar');
    if (!bar) return;
    
    if (tables.length === 0) {
        bar.innerHTML = '<span style="color: var(--text-gray); font-size: 0.85rem;">Cargando mesas...</span>';
        return;
    }
    
    bar.innerHTML = tables.map(table => {
        const hasOrders = table.pendingItems && table.pendingItems.length > 0;
        const status = hasOrders ? table.visualStatus : 'libre';
        const isActive = table.id === activeTableId ? 'active' : '';
        return `<div class="mini-table status-${status} ${isActive}" onclick="selectTable(${table.id}, '${table.name}')">${table.name}</div>`;
    }).join('');
}

async function selectTable(id, name) {
    activeTableId = id;
    cart = [];
    
    const table = tables.find(t => t.id === id);
    
    if (table && table.pendingOrders && table.pendingOrders.length > 0) {
        currentTableOrder = table.pendingOrders[0];
        const { data: fullOrder } = await supabaseClient
            .from('orders')
            .select('*, order_items(*)')
            .eq('id', currentTableOrder.id)
            .single();
        if (fullOrder) currentTableOrder = fullOrder;
    } else {
        currentTableOrder = null;
    }
    
    renderCart();
    renderTableOrder();
    renderMiniTables();
    
    document.getElementById('pos-title').textContent = `Caja - ${name}`;
    document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
    const cajaItem = document.querySelector('[data-view="pos"]');
    if (cajaItem) cajaItem.classList.add('active');
    
    const posView = document.getElementById('view-pos');
    if (!posView.classList.contains('active')) {
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        posView.classList.add('active');
    }
}

async function cobrarMesaDirecta(tableId) {
    const table = tables.find(t => t.id === tableId);
    if (!table || !table.pendingOrders || table.pendingOrders.length === 0) return;
    
    activeTableId = tableId;
    currentTableOrder = table.pendingOrders[0];
    
    const { data: fullOrder } = await supabaseClient
        .from('orders')
        .select('*, order_items(*)')
        .eq('id', currentTableOrder.id)
        .single();
    if (fullOrder) currentTableOrder = fullOrder;
    
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
        if (activeTableId) {
            btnPay.textContent = `AÑADIR A MESA ($${Math.round(cart.reduce((sum, i) => sum + (i.price * i.qty), 0)).toLocaleString()})`;
        } else {
            btnPay.textContent = `COBRAR ($${Math.round(cart.reduce((sum, i) => sum + (i.price * i.qty), 0)).toLocaleString()})`;
        }
        if (btnDivide) btnDivide.style.display = 'none';
        return;
    }
    
    section.style.display = 'block';
    if (btnDivide) btnDivide.style.display = 'inline-block';
    
    const itemsGrouped = {};
    currentTableOrder.order_items.forEach(item => {
        const key = item.name;
        if (!itemsGrouped[key]) {
            itemsGrouped[key] = { name: item.name, qty: 0, price: item.price };
        }
        itemsGrouped[key].qty += item.qty;
    });
    
    itemsContainer.innerHTML = Object.values(itemsGrouped).map(item => `
        <div class="order-item">
            <span>${item.qty}x ${item.name}</span>
            <span>$${Math.round(item.price * item.qty).toLocaleString()}</span>
        </div>
    `).join('');
    
    totalElement.textContent = `$${Math.round(currentTableOrder.total).toLocaleString()}`;
    btnPay.textContent = `AÑADIR MÁS A MESA ($${Math.round(cart.reduce((sum, i) => sum + (i.price * i.qty), 0)).toLocaleString()})`;
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
    renderTableOrder();
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
    renderTableOrder();
}

function updateTotals(total) {
    const tax = total * 0.19;
    document.getElementById('subtotal').textContent = '$' + Math.round(total - tax).toLocaleString();
    document.getElementById('tax').textContent = '$' + Math.round(tax).toLocaleString();
    document.getElementById('total').textContent = '$' + Math.round(total).toLocaleString();
    
    const btnPay = document.getElementById('btn-pay');
    if (activeTableId) {
        btnPay.textContent = currentTableOrder ? `AÑADIR MÁS A MESA ($${Math.round(total).toLocaleString()})` : `AÑADIR A MESA ($${Math.round(total).toLocaleString()})`;
    } else {
        btnPay.textContent = `COBRAR ($${Math.round(total).toLocaleString()})`;
    }
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
        if (cart.length > 0 && confirm('¿Limpiar carrito?')) { cart = []; renderCart(); renderTableOrder(); }
    });
    document.getElementById('btn-pay').addEventListener('click', () => {
        if (activeTableId) {
            addToTable();
        } else {
            openPayModal();
        }
    });
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
        const total = currentTableOrder ? currentTableOrder.total : cart.reduce((sum, i) => sum + (i.price * i.qty), 0);
        const received = parseFloat(e.target.value) || 0;
        document.getElementById('change-amount').textContent = '$' + Math.max(0, Math.round(received - total)).toLocaleString();
    });
    document.getElementById('btn-confirm-pay').addEventListener('click', () => {
        if (currentTableOrder) confirmPaymentForTable();
        else confirmPayment();
    });
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
            const { data: order, error: orderError } = await supabaseClient.from('orders').insert([{ 
                type: 'mesa', status: 'pendiente_pago', total, paid: false, pay_method: 'pendiente', 
                source: 'tpv', user_email: currentUser?.email, table_id: activeTableId 
            }]).select().single();
            if (orderError) throw orderError;
            
            const orderItems = cart.map(item => ({ order_id: order.id, name: item.name, price: item.price, qty: item.qty }));
            const { error: itemsError } = await supabaseClient.from('order_items').insert(orderItems);
            if (itemsError) throw itemsError;
            
            currentTableOrder = order;
            addNotification('nuevo', `📝 Pedido en Mesa`, `${tables.find(t => t.id === activeTableId)?.name}: $${Math.round(total).toLocaleString()}`);
        }
        
        cart = [];
        renderCart();
        renderTableOrder();
        showToast('pago', '✓ Añadido a la mesa', 'Los productos se guardaron en el pedido');
        loadTables();
    } catch (error) {
        alert('Error: ' + error.message);
    }
}

function openPayModal() {
    if (cart.length === 0) return alert('Carrito vacío');
    document.getElementById('modal-title').textContent = 'Finalizar Pedido (Mostrador)';
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

function openPayModalForTable() {
    if (!currentTableOrder) return;
    document.getElementById('modal-title').textContent = `Cobrar Mesa ${tables.find(t => t.id === activeTableId)?.name}`;
    
    const itemsGrouped = {};
    currentTableOrder.order_items.forEach(item => {
        const key = item.name;
        if (!itemsGrouped[key]) {
            itemsGrouped[key] = { name: item.name, qty: 0, price: item.price };
        }
        itemsGrouped[key].qty += item.qty;
    });
    
    document.getElementById('modal-cart-items').innerHTML = Object.values(itemsGrouped).map(item => `
        <div class="cart-item"><div class="cart-item-name">${item.name} x${item.qty}</div><div class="cart-item-price">$${Math.round(item.price * item.qty).toLocaleString()}</div></div>
    `).join('');
    document.getElementById('modal-subtotal').textContent = '$' + Math.round(currentTableOrder.total - (currentTableOrder.total * 0.19)).toLocaleString();
    document.getElementById('modal-tax').textContent = '$' + Math.round(currentTableOrder.total * 0.19).toLocaleString();
    document.getElementById('modal-total').textContent = '$' + Math.round(currentTableOrder.total).toLocaleString();
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
            source: 'tpv', user_email: currentUser?.email, table_id: null
        }]).select().single();
        if (orderError) throw orderError;
        const orderItems = cart.map(item => ({ order_id: order.id, name: item.name, price: item.price, qty: item.qty }));
        const { error: itemsError } = await supabaseClient.from('order_items').insert(orderItems);
        if (itemsError) throw itemsError;
        printTicket(order, cart);
        addNotification('pago', `✓ Pedido #${order.id} cobrado`, `Total: $${Math.round(total).toLocaleString()} | ${payMethod.toUpperCase()}`);
        cart = []; renderCart(); renderTableOrder(); closeModal('pay-modal');
        const cashView = document.getElementById('view-cash');
        if (cashView.classList.contains('active')) loadCashStatus();
    } catch (error) { alert('Error: ' + error.message); }
}

async function confirmPaymentForTable() {
    const total = currentTableOrder.total;
    if (payMethod === 'efectivo') {
        const cashReceived = parseFloat(document.getElementById('cash-received').value);
        if (!cashReceived || cashReceived < total) return alert('Efectivo insuficiente');
    }
    try {
        const { error } = await supabaseClient.from('orders').update({ 
            status: 'nuevo', paid: true, pay_method: payMethod 
        }).eq('id', currentTableOrder.id);
        if (error) throw error;
        
        await supabaseClient.from('tables').update({ status: 'libre', current_order_id: null }).eq('id', activeTableId);
        
        // ✅ Imprimir ticket al cobrar mesa
        printTicket(currentTableOrder, currentTableOrder.order_items);
        
        addNotification('pago', `✓ Mesa cobrada`, `${tables.find(t => t.id === activeTableId)?.name}: $${Math.round(total).toLocaleString()}`);
        
        currentTableOrder = null;
        cart = [];
        renderCart();
        renderTableOrder();
        closeModal('pay-modal');
        loadTables();
    } catch (error) {
        alert('Error: ' + error.message);
    }
}

function printTicket(order, items) {
    const printArea = document.getElementById('ticket-print-area');
    const date = new Date().toLocaleString('es-ES');
    const qrUrl = `${window.location.origin}/valorar.html?p=${order.id}`;
    const tableText = order.table_id ? ` | Mesa: ${order.table_id}` : '';
    const dinerText = order.diner_name ? ` | ${order.diner_name}` : '';
    printArea.innerHTML = `
        <div class="ticket-header"><h3>TPV PUNTO VERDE</h3><p>${date}</p><p>Pedido #${order.id}${tableText}${dinerText}</p><p>Cajero: ${currentUser?.email || 'N/A'}</p></div>
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
            const dinerText = order.diner_name ? ` - ${order.diner_name}` : '';
            const itemsHtml = order.order_items.map(item => `<div class="order-item"><span><span class="item-qty">${item.qty}x</span> ${item.name}</span></div>`).join('');
            let actionBtn = '';
            if (status === 'nuevo') actionBtn = `<button class="action-btn-kitchen btn-cocina" onclick="updateOrderStatus(${order.id}, 'cocina')">→ Cocina</button>`;
            else if (status === 'cocina') actionBtn = `<button class="action-btn-kitchen btn-listo" onclick="updateOrderStatus(${order.id}, 'listo')">✓ Listo</button>`;
            else if (status === 'listo') actionBtn = `<button class="action-btn-kitchen btn-entregado" onclick="updateOrderStatus(${order.id}, 'entregado')">✓ Entregado</button>`;
            return `<div class="order-card status-${status}"><div class="order-header"><div class="order-id">#${order.id}${tableText}${dinerText}</div><div class="order-type">${order.type.toUpperCase()}</div></div><div class="order-time"> ${time}</div><div class="order-items">${itemsHtml}</div><div class="order-actions">${actionBtn}</div></div>`;
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
    if (error) { 
        alert('Error: ' + error.message); 
    } else { 
        loadKitchenOrders(); 
        if (newStatus === 'entregado') {
            const order = kitchenOrders.find(o => o.id === orderId);
            if (order && order.table_id) {
                await supabaseClient.from('tables').update({ status: 'libre', current_order_id: null }).eq('id', order.table_id);
            }
        } else if (newStatus === 'listo') {
            const order = kitchenOrders.find(o => o.id === orderId);
            if (order && order.table_id) {
                await supabaseClient.from('tables').update({ status: 'pendiente' }).eq('id', order.table_id);
            }
        }
    }
}

function setupRealtimeGlobal() {
    supabaseClient.channel('orders-global')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, (payload) => {
            const order = payload.new;
            const tableText = order.table_id ? ` (Mesa ${order.table_id})` : '';
            addNotification('nuevo', `📝 Nuevo Pedido #${order.id}${tableText}`, `Tipo: ${order.type.toUpperCase()} | Total: $${Math.round(order.total).toLocaleString()}`);
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
            if (oldStatus === 'nuevo' && newStatus === 'cocina') { tipo = 'cocina'; title = `🔥 Pedido #${order.id}${tableText} en preparación`; message = 'La cocina está preparando el pedido'; }
            else if (oldStatus === 'cocina' && newStatus === 'listo') { tipo = 'listo'; title = `✅ Pedido #${order.id}${tableText} listo`; message = 'El pedido está listo para entregar'; loadTables(); }
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
        document.getElementById('cash-status').innerHTML = '<span class="status-closed">🔴 Caja Cerrada</span>';
        document.getElementById('action-buttons').innerHTML = '<button class="action-btn btn-open" onclick="openModal(\'modal-open-cash\')">🔓 Abrir Caja</button>';
        document.getElementById('cash-summary').style.display = 'none';
    } else {
        currentSession = session;
        document.getElementById('cash-status').innerHTML = `<span class="status-open">🟢 Caja Abierta</span><br><small>Abierta: ${new Date(session.opened_at).toLocaleString('es-ES')}</small><br><small>Fondo inicial: $${session.fondo.toLocaleString()}</small>`;
        document.getElementById('action-buttons').innerHTML = `
            <button class="action-btn btn-movement" onclick="openModal('modal-movement')">💵 Movimiento</button>
            <button class="action-btn btn-count" onclick="openModal('modal-count')">🔢 Arqueo Ciego</button>
            <button class="action-btn btn-close" onclick="closeCashSession()">🔒 Cerrar Caja</button>
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
            ${movements.length > 0 ? movements.map(m => `<div class="movement-item ${m.tipo}"><span>${m.tipo === 'entrada' ? '' : '📤'} ${m.nota || m.metodo}</span><span>$${m.importe.toLocaleString()}</span></div>`).join('') : '<p style="color: var(--text-gray); font-size: 0.9rem;">Sin movimientos</p>'}
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