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

// ============ INICIO ============
async function init() {
    await loadProducts();
    renderCategories();
    renderProducts();
    setupEvents();
    setupModalEvents();
    
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
    
    if (error) { 
        console.error('Error cargando productos:', error); 
        return; 
    }
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
    const filtered = currentCategory === 'all' 
        ? products 
        : products.filter(p => p.category === currentCategory);
    
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
    if (existing) {
        existing.qty++;
    } else {
        cart.push({ ...product, qty: 1 });
    }
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
    
    // Renderizar items en el modal
    const modalItems = document.getElementById('modal-cart-items');
    modalItems.innerHTML = cart.map(item => `
        <div class="cart-item">
            <div class="cart-item-info">
                <div class="cart-item-name">${item.name} x${item.qty}</div>
            </div>
            <div class="cart-item-price">$${(item.price * item.qty).toLocaleString()}</div>
        </div>
    `).join('');
    
    // Actualizar totales
    const total = cart.reduce((sum, i) => sum + (i.price * i.qty), 0);
    const tax = total * 0.19;
    const subtotal = total - tax;
    document.getElementById('modal-subtotal').textContent = '$' + Math.round(subtotal).toLocaleString();
    document.getElementById('modal-tax').textContent = '$' + Math.round(tax).toLocaleString();
    document.getElementById('modal-total').textContent = '$' + Math.round(total).toLocaleString();
    
    // Resetear inputs
    document.getElementById('cash-received').value = '';
    document.getElementById('change-amount').textContent = '$0';
    
    // Mostrar modal
    document.getElementById('pay-modal').classList.add('active');
}

function closePayModal() {
    document.getElementById('pay-modal').classList.remove('active');
}

async function confirmPayment() {
    const total = cart.reduce((sum, i) => sum + (i.price * i.qty), 0);
    
    // Validar efectivo si es el método
    if (payMethod === 'efectivo') {
        const cashReceived = parseFloat(document.getElementById('cash-received').value);
        if (!cashReceived || cashReceived < total) {
            return alert('El efectivo recibido es insuficiente');
        }
    }
    
    try {
        // 1. Crear pedido en Supabase
        const { data: order, error: orderError } = await supabaseClient
            .from('orders')
            .insert([{
                type: orderType,
                status: 'nuevo',
                total: total,
                paid: true,
                pay_method: payMethod,
                source: 'tpv'
            }])
            .select()
            .single();
        
        if (orderError) throw orderError;
        
        // 2. Crear items del pedido
        const orderItems = cart.map(item => ({
            order_id: order.id,
            name: item.name,
            price: item.price,
            qty: item.qty
        }));
        
        const { error: itemsError } = await supabaseClient
            .from('order_items')
            .insert(orderItems);
        
        if (itemsError) throw itemsError;
        
        // 3. Éxito
        alert(`✓ Pedido #${order.id} registrado correctamente\n\nTotal: $${Math.round(total).toLocaleString()}\nMétodo: ${payMethod}`);
        
        // 4. Limpiar carrito y cerrar modal
        cart = [];
        renderCart();
        closePayModal();
        
    } catch (error) {
        console.error('Error al procesar pago:', error);
        alert('Error al procesar el pago: ' + error.message);
    }
}

function setupModalEvents() {
    // Abrir modal
    document.getElementById('btn-pay').addEventListener('click', openPayModal);
    
    // Cerrar modal
    document.getElementById('btn-close-modal').addEventListener('click', closePayModal);
    document.getElementById('btn-cancel-pay').addEventListener('click', closePayModal);
    
    // Tipo de pedido
    document.querySelectorAll('.type-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            orderType = e.target.dataset.type;
        });
    });
    
    // Método de pago
    document.querySelectorAll('.method-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.method-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            payMethod = e.target.dataset.method;
            
            // Mostrar/ocultar input de efectivo
            const cashSection = document.getElementById('cash-section');
            cashSection.style.display = payMethod === 'efectivo' ? 'block' : 'none';
        });
    });
    
    // Calcular cambio
    document.getElementById('cash-received').addEventListener('input', (e) => {
        const total = cart.reduce((sum, i) => sum + (i.price * i.qty), 0);
        const received = parseFloat(e.target.value) || 0;
        const change = received - total;
        document.getElementById('change-amount').textContent = '$' + Math.max(0, Math.round(change)).toLocaleString();
    });
    
    // Confirmar pago
    document.getElementById('btn-confirm-pay').addEventListener('click', confirmPayment);
}

// ============ EVENTOS PRINCIPALES ============
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
        if (cart.length > 0 && confirm('¿Seguro que quieres limpiar el carrito?')) {
            cart = [];
            renderCart();
        }
    });
}

// ============ ARRANQUE ============
init();