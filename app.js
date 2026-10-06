// ============ CONFIG SUPABASE ============
const SUPABASE_URL = 'https://tjohhybyvfqqjummuedk.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_B6wSHIVowVjWL_086rafEA_g7-STvzI';
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============ ESTADO ============
let cart = [];
let products = [];
let currentCategory = 'all';
let orderType = 'mostrador';
let payMethod = 'efectivo';
let activeOrders = [];

// ============ INICIO ============
async function init() {
    await loadProducts();
    renderCategories();
    renderProducts();
    setupEvents();
    setupModalEvents();
    setupActiveOrdersPanel();
    setupRealtimeOrders();
    
    document.getElementById('user-name').textContent = 'Caja Principal';
    document.getElementById('user-role').textContent = 'Admin';
}

// ============ PRODUCTOS ============
async function loadProducts() {
    const { data, error } = await supabaseClient
        .from('products')
        .select('*')
        .eq('active', true)
        .order('position', { ascending: true });
    
    if (error) { console.error('Error cargando productos:', error); return; }
    products = data || [];
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
    
    if (filtered.length === 0) {
        grid.innerHTML = '<div style="padding: 2rem; color: #6b7280;">No hay productos en esta categoría</div>';
        return;
    }

    grid.innerHTML = filtered.map(p => `
        <div class="product-card" data-id="${p.id}">
            <img class="product-img" src="${p.image || 'https://via.placeholder.com/160x100?text=Sin+Imagen'}" alt="${p.name}">
            <div class="product-name">${p.name}</div>
            <div class="product-price">$${Number(p.price).toLocaleString()}</div>
        </div>
    `).join('');
}

// ============ CARRITO ============
function addToCart(productId) {
    const product = products.find(p => p.id === productId);
    if (!product) return;
    const existing = cart.find(i => i.id === productId);
    if (existing) { existing.qty++; } 
    else { cart.push({ ...product, qty: 1 }); }
    renderCart();
}

function renderCart() {
    const container = document.getElementById('cart-items');
    if (cart.length === 0) {
        container.innerHTML = '<div class="empty-cart">Añade productos para empezar</div>';
        updateTotals(0);
        return;
    }
    container.innerHTML = cart.map(item => `
        <div class="cart-item">
            <div class="cart-item-info">
                <div class="cart-item-name">${item.name}</div>
                <div class="qty-controls">
                    <button class="qty-btn" onclick="changeQty(${item.id}, -1)">−</button>
                    <span class="cart-item-qty">${item.qty}</span>
                    <button class="qty-btn" onclick="changeQty(${item.id}, 1)">+</button>
                </div>
            </div>
            <div class="cart-item-price">$${(item.price * item.qty).toLocaleString()}</div>
        </div>
    `).join('');
    const total = cart.reduce((sum, i) => sum + (i.price * i.qty), 0);
    updateTotals(total);
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
    const subtotal = total - tax;
    document.getElementById('subtotal').textContent = '$' + Math.round(subtotal).toLocaleString();
    document.getElementById('tax').textContent = '$' + Math.round(tax).toLocaleString();
    document.getElementById('total').textContent = '$' + Math.round(total).toLocaleString();
    document.getElementById('btn-pay').textContent = `COBRAR ($${Math.round(total).toLocaleString()})`;
}

// ============ MODAL DE COBRO ============
function openPayModal() {
    if (cart.length === 0) return alert('El carrito está vacío');
    const modalItems = document.getElementById('modal-cart-items');
    modalItems.innerHTML = cart.map(item => `
        <div class="cart-item">
            <div class="cart-item-info"><div class="cart-item-name">${item.name} x${item.qty}</div></div>
            <div class="cart-item-price">$${(item.price * item.qty).toLocaleString()}</div>
        </div>
    `).join('');
    
    const total = cart.reduce((sum, i) => sum + (i.price * i.qty), 0);
    const tax = total * 0.19;
    document.getElementById('modal-subtotal').textContent = '$' + Math.round(total - tax).toLocaleString();
    document.getElementById('modal-tax').textContent = '$' + Math.round(tax).toLocaleString();
    document.getElementById('modal-total').textContent = '$' + Math.round(total).toLocaleString();
    document.getElementById('cash-received').value = '';
    document.getElementById('change-amount').textContent = '$0';
    document.getElementById('pay-modal').classList.add('active');
}

function closePayModal() { document.getElementById('pay-modal').classList.remove('active'); }

// ============ IMPRESIÓN DE TICKET ============
function printTicket(order, items) {
    const printArea = document.getElementById('ticket-print-area');
    const date = new Date().toLocaleString('es-ES');
    const total = order.total;
    const baseUrl = window.location.origin;
    const qrUrl = `${baseUrl}/valorar.html?p=${order.id}`;
    
    const ticketHtml = `
        <div class="ticket-header">
            <h3>TPV PUNTO VERDE</h3>
            <p>Gastronomía Colombiana</p>
            <p>${date}</p>
            <p>Pedido #${order.id}</p>
            <p>Tipo: ${order.type.toUpperCase()} | Pago: ${order.pay_method.toUpperCase()}</p>
        </div>
        <div class="ticket-divider"></div>
        ${items.map(i => `
            <div class="ticket-item">
                <span>${i.qty}x ${i.name.substring(0, 22)}</span>
                <span>$${Math.round(i.price * i.qty).toLocaleString()}</span>
            </div>
        `).join('')}
        <div class="ticket-divider"></div>
        <div class="ticket-total">TOTAL: $${Math.round(total).toLocaleString()}</div>
        <div class="ticket-footer">
            <p>¡Gracias por su visita!</p>
            <p>Valora tu experiencia:</p>
            <div id="qr-code"></div>
        </div>
    `;
    
    printArea.innerHTML = ticketHtml;
    
    setTimeout(() => {
        const qrContainer = document.getElementById('qr-code');
        qrContainer.innerHTML = '';
        new QRCode(qrContainer, {
            text: qrUrl,
            width: 100,
            height: 100,
            colorDark: "#000000",
            colorLight: "#ffffff",
            correctLevel: QRCode.CorrectLevel.L
        });
        setTimeout(() => window.print(), 500);
    }, 100);
}

async function confirmPayment() {
    const total = cart.reduce((sum, i) => sum + (i.price * i.qty), 0);
    
    if (payMethod === 'efectivo') {
        const cashReceived = parseFloat(document.getElementById('cash-received').value);
        if (!cashReceived || cashReceived < total) return alert('El efectivo recibido es insuficiente');
    }
    
    try {
        const { data: order, error: orderError } = await supabaseClient
            .from('orders')
            .insert([{ type: orderType, status: 'nuevo', total: total, paid: true, pay_method: payMethod, source: 'tpv' }])
            .select()
            .single();
        
        if (orderError) throw orderError;
        
        const orderItems = cart.map(item => ({ order_id: order.id, name: item.name, price: item.price, qty: item.qty }));
        const { error: itemsError } = await supabaseClient.from('order_items').insert(orderItems);
        if (itemsError) throw itemsError;
        
        printTicket(order, cart);
        cart = [];
        renderCart();
        closePayModal();
        
    } catch (error) {
        console.error('Error al procesar pago:', error);
        alert('Error al procesar el pago: ' + error.message);
    }
}

// ============ PANEL DE PEDIDOS ACTIVOS ============
function setupActiveOrdersPanel() {
    const panel = document.getElementById('active-orders-panel');
    const btnOpen = document.getElementById('btn-active-orders');
    const btnClose = document.getElementById('btn-close-panel');
    
    btnOpen.addEventListener('click', () => {
        panel.classList.add('open');
        loadActiveOrders();
    });
    
    btnClose.addEventListener('click', () => {
        panel.classList.remove('open');
    });
}

async function loadActiveOrders() {
    const { data, error } = await supabaseClient
        .from('orders')
        .select('*')
        .neq('status', 'entregado')
        .order('created_at', { ascending: false });
    
    if (error) {
        console.error('Error cargando pedidos activos:', error);
        return;
    }
    
    activeOrders = data || [];
    renderActiveOrders();
}

function renderActiveOrders() {
    const container = document.getElementById('active-orders-list');
    const badgeCount = document.getElementById('badge-count');
    
    badgeCount.textContent = activeOrders.length;
    
    if (activeOrders.length === 0) {
        container.innerHTML = '<div class="empty-orders">No hay pedidos activos</div>';
        return;
    }
    
    container.innerHTML = activeOrders.map(order => {
        const statusText = {
            'nuevo': 'Nuevo',
            'cocina': 'En Cocina',
            'listo': 'Listo'
        }[order.status] || order.status;
        
        return `
            <div class="active-order-card status-${order.status}">
                <div class="active-order-header">
                    <span class="active-order-id">#${order.id}</span>
                    <span class="active-order-status status-${order.status}">${statusText}</span>
                </div>
                <div class="active-order-items">
                    ${order.type.toUpperCase()} | $${Math.round(order.total).toLocaleString()}
                </div>
            </div>
        `;
    }).join('');
}

// ============ TIEMPO REAL ============
function setupRealtimeOrders() {
    supabaseClient
        .channel('orders-channel')
        .on('postgres_changes', 
            { 
                event: 'UPDATE', 
                schema: 'public', 
                table: 'orders' 
            }, 
            (payload) => {
                console.log('Pedido actualizado:', payload);
                const order = payload.new;
                
                // Mostrar notificación
                const statusText = {
                    'cocina': '🔥 En preparación',
                    'listo': '✅ Listo para entregar'
                }[order.status];
                
                if (statusText) {
                    showToast(`Pedido #${order.id}: ${statusText}`);
                }
                
                // Recargar pedidos activos si el panel está abierto
                const panel = document.getElementById('active-orders-panel');
                if (panel.classList.contains('open')) {
                    loadActiveOrders();
                } else {
                    // Actualizar badge
                    loadActiveOrders();
                }
            }
        )
        .subscribe();
}

function showToast(message) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.add('show');
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// ============ EVENTOS ============
function setupModalEvents() {
    document.getElementById('btn-pay').addEventListener('click', openPayModal);
    document.getElementById('btn-close-modal').addEventListener('click', closePayModal);
    document.getElementById('btn-cancel-pay').addEventListener('click', closePayModal);
    
    document.querySelectorAll('.type-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            orderType = e.target.dataset.type;
        });
    });
    
    document.querySelectorAll('.method-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.method-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            payMethod = e.target.dataset.method;
            document.getElementById('cash-section').style.display = payMethod === 'efectivo' ? 'block' : 'none';
        });
    });
    
    document.getElementById('cash-received').addEventListener('input', (e) => {
        const total = cart.reduce((sum, i) => sum + (i.price * i.qty), 0);
        const received = parseFloat(e.target.value) || 0;
        document.getElementById('change-amount').textContent = '$' + Math.max(0, Math.round(received - total)).toLocaleString();
    });
    
    document.getElementById('btn-confirm-pay').addEventListener('click', confirmPayment);
}

function setupEvents() {
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
        if (cart.length > 0 && confirm('¿Seguro que quieres limpiar el carrito?')) { cart = []; renderCart(); }
    });
}

init();