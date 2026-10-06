// ============ CONFIG SUPABASE ============
const SUPABASE_URL = 'https://tjohhybyvfqqjummuedk.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_B6wSHIVowVjWL_086rafEA_g7-STvzI';
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============ ESTADO ============
let orders = [];
let lastOrderCount = 0;

// ============ INICIO ============
async function init() {
    await loadOrders();
    renderOrders();
    setupRealtime();
    
    // Reproducir sonido de inicio
    playAlert();
}

// ============ CARGAR PEDIDOS ============
async function loadOrders() {
    const { data, error } = await supabaseClient
        .from('orders')
        .select(`
            *,
            order_items(*)
        `)
        .neq('status', 'entregado')
        .order('created_at', { ascending: false });
    
    if (error) {
        console.error('Error cargando pedidos:', error);
        return;
    }
    
    orders = data || [];
    updateStats();
}

// ============ RENDERIZAR PEDIDOS ============
function renderOrders() {
    // Limpiar columnas
    document.getElementById('orders-nuevo').innerHTML = '';
    document.getElementById('orders-cocina').innerHTML = '';
    document.getElementById('orders-listo').innerHTML = '';
    
    // Filtrar por estado
    const ordersByStatus = {
        nuevo: orders.filter(o => o.status === 'nuevo'),
        cocina: orders.filter(o => o.status === 'cocina'),
        listo: orders.filter(o => o.status === 'listo')
    };
    
    // Renderizar cada columna
    renderColumn('nuevo', ordersByStatus.nuevo);
    renderColumn('cocina', ordersByStatus.cocina);
    renderColumn('listo', ordersByStatus.listo);
}

function renderColumn(status, ordersList) {
    const container = document.getElementById(`orders-${status}`);
    
    if (ordersList.length === 0) {
        container.innerHTML = '<div class="empty-state">No hay pedidos</div>';
        return;
    }
    
    container.innerHTML = ordersList.map(order => {
        const time = new Date(order.created_at).toLocaleTimeString('es-ES', { 
            hour: '2-digit', 
            minute: '2-digit' 
        });
        
        const itemsHtml = order.order_items.map(item => `
            <div class="order-item">
                <span><span class="item-qty">${item.qty}x</span> <span class="item-name">${item.name}</span></span>
            </div>
        `).join('');
        
        const notesHtml = order.notes ? `<div class="order-notes">📝 ${order.notes}</div>` : '';
        
        let actionsHtml = '';
        if (status === 'nuevo') {
            actionsHtml = `<button class="action-btn btn-cocina" onclick="updateStatus(${order.id}, 'cocina')">→ Cocina</button>`;
        } else if (status === 'cocina') {
            actionsHtml = `<button class="action-btn btn-listo" onclick="updateStatus(${order.id}, 'listo')">✓ Listo</button>`;
        } else if (status === 'listo') {
            actionsHtml = `<button class="action-btn btn-entregado" onclick="updateStatus(${order.id}, 'entregado')">✓ Entregado</button>`;
        }
        
        return `
            <div class="order-card status-${status}">
                <div class="order-header">
                    <div class="order-id">#${order.id}</div>
                    <div class="order-type">${order.type.toUpperCase()}</div>
                </div>
                <div class="order-time">🕐 ${time}</div>
                <div class="order-items">${itemsHtml}</div>
                ${notesHtml}
                <div class="order-actions">${actionsHtml}</div>
            </div>
        `;
    }).join('');
}

// ============ ACTUALIZAR ESTADO ============
async function updateStatus(orderId, newStatus) {
    try {
        const { error } = await supabaseClient
            .from('orders')
            .update({ status: newStatus })
            .eq('id', orderId);
        
        if (error) throw error;
        
        // Recargar pedidos
        await loadOrders();
        renderOrders();
        
        // Sonido de confirmación
        playAlert();
        
    } catch (error) {
        console.error('Error actualizando estado:', error);
        alert('Error al actualizar el estado del pedido');
    }
}

// ============ ACTUALIZAR ESTADÍSTICAS ============
function updateStats() {
    const counts = {
        nuevo: orders.filter(o => o.status === 'nuevo').length,
        cocina: orders.filter(o => o.status === 'cocina').length,
        listo: orders.filter(o => o.status === 'listo').length
    };
    
    document.getElementById('count-nuevo').textContent = counts.nuevo;
    document.getElementById('count-cocina').textContent = counts.cocina;
    document.getElementById('count-listo').textContent = counts.listo;
}

// ============ TIEMPO REAL ============
function setupRealtime() {
    supabaseClient
        .channel('orders-channel')
        .on('postgres_changes', 
            { 
                event: '*', 
                schema: 'public', 
                table: 'orders' 
            }, 
            async (payload) => {
                console.log('Cambio detectado:', payload);
                
                // Verificar si es un pedido nuevo
                if (payload.eventType === 'INSERT') {
                    const newCount = orders.length + 1;
                    if (newCount > lastOrderCount) {
                        playAlert();
                    }
                }
                
                // Recargar y renderizar
                await loadOrders();
                renderOrders();
            }
        )
        .subscribe();
}

// ============ SONIDO DE ALERTA ============
function playAlert() {
    const audio = document.getElementById('alert-sound');
    if (audio) {
        audio.volume = 0.5;
        audio.play().catch(e => console.log('Audio no pudo reproducirse:', e));
    }
}

// ============ ARRANQUE ============
init();