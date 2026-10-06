// ============ CONFIG SUPABASE ============
const SUPABASE_URL = 'https://tjohhybyvfqqjummuedk.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_B6wSHIVowVjWL_086rafEA_g7-STvzI';
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============ ESTADO ============
let cart = [];
let products = [];
let currentCategory = 'all';

// ============ INICIO ============
async function init() {
    await loadProducts();
    renderCategories();
    renderProducts();
    setupEvents();
    
    // Simulación de usuario (luego se conecta con Auth)
    document.getElementById('user-name').textContent = 'Caja Principal';
    document.getElementById('user-role').textContent = 'Admin';
}

// ============ PRODUCTOS ============
async function loadProducts() {
    const { data, error } = await supabase
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
    
    // Limpiar excepto el botón "Todos"
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
    const tax = total * 0.19; // Ajusta el 0.19 si tu IVA es diferente
    const subtotal = total - tax;
    document.getElementById('subtotal').textContent = '$' + Math.round(subtotal).toLocaleString();
    document.getElementById('tax').textContent = '$' + Math.round(tax).toLocaleString();
    document.getElementById('total').textContent = '$' + Math.round(total).toLocaleString();
    document.getElementById('btn-pay').textContent = `COBRAR ($${Math.round(total).toLocaleString()})`;
}

// ============ EVENTOS ============
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
        cart = [];
        renderCart();
    });
    
    document.getElementById('btn-pay').addEventListener('click', () => {
        if (cart.length === 0) return alert('El carrito está vacío');
        alert('¡Pedido listo para procesar! (Aquí irá el modal de pago)');
        // Aquí llamaremos a la función para guardar en Supabase (orders)
    });
}

// ============ ARRANQUE ============
init();