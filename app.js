// ============ CONFIG SUPABASE ============
const SUPABASE_URL = const SUPABASE_URL = 'https://tjohhybyvfqqjummuedk.supabase.co';
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
}

// ============ PRODUCTOS ============
async function loadProducts() {
    const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('active', true)
        .order('position');
    
    if (error) { console.error(error); return; }
    products = data || [];
}

function renderCategories() {
    const cats = [...new Set(products.map(p => p.category))];
    const bar = document.getElementById('categories-bar');
    cats.forEach(cat => {
        const btn = document.createElement('button');
        btn.className = 'cat-btn';
        btn.dataset.cat = cat;
        btn.textContent = cat;
        bar.appendChild(btn);
    });
}

function renderProducts() {
    const grid = document.getElementById('product-grid');
    const filtered = currentCategory === 'all' 
        ? products 
        : products.filter(p => p.category === currentCategory);
    
    grid.innerHTML = filtered.map(p => `
        <div class="product-card" data-id="${p.id}">
            <img class="product-img" src="${p.image || ''}" alt="${p.name}" onerror="this.style.display='none'">
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
    document.getElementById('subtotal').textContent = '$' + subtotal.toFixed(0);
    document.getElementById('tax').textContent = '$' + tax.toFixed(0);
    document.getElementById('total').textContent = '$' + total.toLocaleString();
    document.getElementById('btn-pay').textContent = `COBRAR ($${total.toLocaleString()})`;
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
        if (cart.length === 0) return alert('Carrito vacío');
        alert('Aquí irá el modal de cobro (paso siguiente)');
    });
}

// ============ ARRANQUE ============
init();