-- ============================================================
-- TPV RESTAURANTE PUNTO VERDE — Esquema completo (proyecto nuevo)
-- Ejecutar UNA vez en SQL Editor. Incluye todo: tablas, políticas,
-- tiempo real, pedidos online, reinicio con PIN, fotos y carta real.
-- ============================================================

-- ---------- TABLAS ----------
create table products (
  id bigint generated always as identity primary key,
  name text not null,
  price numeric(10,2) not null default 0,
  category text not null default 'General',
  position int not null default 0,
  active boolean not null default true,
  stock int,
  image text
);

create table drivers (
  id bigint generated always as identity primary key,
  name text not null unique,
  active boolean not null default true
);

create table orders (
  id bigint generated always as identity primary key,
  type text not null check (type in ('recogida','domicilio','mostrador')),
  status text not null default 'nuevo' check (status in ('nuevo','cocina','listo','entregado')),
  name text, phone text, addr text,
  pickup text, driver text, notes text,
  total numeric(10,2) default 0,
  paid boolean default false,
  tip numeric(10,2) default 0,
  pay_method text default '',
  source text default 'tpv',
  created_at timestamptz default now(),
  sent_at timestamptz
);
alter table orders add column if not exists tip numeric(10,2) default 0;
alter table orders add column if not exists source text default 'tpv';

create table order_items (
  id bigint generated always as identity primary key,
  order_id bigint references orders(id) on delete cascade,
  name text, price numeric(10,2) default 0, qty int default 1
);

create table cash_sessions (
  id bigint generated always as identity primary key,
  fondo numeric(10,2) default 0,
  opened_at timestamptz default now(),
  closed_at timestamptz,
  v_efectivo numeric(10,2) default 0,
  v_tarjeta numeric(10,2) default 0,
  v_bizum numeric(10,2) default 0,
  entradas numeric(10,2) default 0,
  salidas numeric(10,2) default 0
);

create table cash_movements (
  id bigint generated always as identity primary key,
  session_id bigint references cash_sessions(id) on delete cascade,
  tipo text, metodo text default '',
  importe numeric(10,2) default 0,
  nota text default '',
  created_at timestamptz default now()
);

create table cash_arqueos (
  id bigint generated always as identity primary key,
  closed_at timestamptz not null default now(),
  fondo numeric(10,2) default 0,
  esperado numeric(10,2) default 0,
  contado numeric(10,2) default 0,
  dif numeric(10,2) default 0,
  v_efectivo numeric(10,2) default 0,
  v_tarjeta numeric(10,2) default 0,
  v_bizum numeric(10,2) default 0,
  entradas numeric(10,2) default 0,
  salidas numeric(10,2) default 0,
  ventas_total numeric(10,2) default 0,
  kind text default 'X'
);

create table settings (
  key text primary key,
  value text
);

create table staff_roles (
  email text primary key,
  role text not null default 'caja' check (role in ('admin','caja','cocina')),
  name text
);

create table time_clock (
  id bigint generated always as identity primary key,
  email text, name text,
  action text check (action in ('in','out')),
  at timestamptz default now()
);

create table reviews (
  id bigint generated always as identity primary key,
  order_id bigint,
  rating text check (rating in ('up','down')),
  comment text default '',
  created_at timestamptz default now()
);

-- ---------- SEGURIDAD (RLS) ----------
alter table products enable row level security;
alter table drivers enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;
alter table cash_sessions enable row level security;
alter table cash_movements enable row level security;
alter table cash_arqueos enable row level security;
alter table settings enable row level security;
alter table staff_roles enable row level security;
alter table time_clock enable row level security;
alter table reviews enable row level security;

create policy "auth_all" on products for all to authenticated using (true) with check (true);
create policy "auth_all" on drivers for all to authenticated using (true) with check (true);
create policy "auth_all" on orders for all to authenticated using (true) with check (true);
create policy "auth_all" on order_items for all to authenticated using (true) with check (true);
create policy "auth_all" on cash_sessions for all to authenticated using (true) with check (true);
create policy "auth_all" on cash_movements for all to authenticated using (true) with check (true);
create policy "auth_all" on cash_arqueos for all to authenticated using (true) with check (true);
create policy "auth_all" on settings for all to authenticated using (true) with check (true);
create policy "auth_all" on staff_roles for all to authenticated using (true) with check (true);
create policy "auth_all" on time_clock for all to authenticated using (true) with check (true);
create policy "auth_read" on reviews for select to authenticated using (true);
create policy "public_insert_reviews" on reviews for insert to anon, authenticated with check (true);

-- ---------- TIEMPO REAL ----------
alter publication supabase_realtime add table orders;
alter publication supabase_realtime add table order_items;
alter publication supabase_realtime add table cash_movements;
alter publication supabase_realtime add table products;
alter publication supabase_realtime add table drivers;

-- ---------- PEDIDOS ONLINE (función pública, precios en servidor) ----------
create or replace function public.place_order(payload jsonb)
returns jsonb
language plpgsql security definer
as $func$
declare
  v_name text; v_phone text; v_type text; v_addr text; v_pickup text; v_notes text;
  v_items jsonb; v_item jsonb;
  v_total numeric := 0; v_price numeric; v_fee numeric := 0; v_qty int; v_order_id bigint;
begin
  v_name := left(trim(payload->>'name'), 80);
  v_phone := left(trim(payload->>'phone'), 20);
  v_type := payload->>'type';
  v_addr := left(trim(payload->>'addr'), 200);
  v_pickup := left(trim(payload->>'pickup'), 20);
  v_notes := left(trim(payload->>'notes'), 400);
  v_items := payload->'items';
  if jsonb_typeof(v_items) = 'string' then
    begin v_items := (payload->>'items')::jsonb; exception when others then v_items := null; end;
  end if;
  if v_name is null or length(v_name) < 2 then return jsonb_build_object('ok', false, 'error', 'nombre'); end if;
  if v_phone is null or length(v_phone) < 6 then return jsonb_build_object('ok', false, 'error', 'telefono'); end if;
  if v_type not in ('recogida','domicilio') then return jsonb_build_object('ok', false, 'error', 'tipo'); end if;
  if v_type = 'domicilio' then
    if v_addr is null or length(v_addr) < 5 then return jsonb_build_object('ok', false, 'error', 'direccion'); end if;
    if coalesce((select value from settings where key='webDomicilio'), '0') <> '1' then return jsonb_build_object('ok', false, 'error', 'Solo disponible recogida en local'); end if;
  end if;
  if v_items is null or jsonb_typeof(v_items) <> 'array' or jsonb_array_length(v_items) = 0 or jsonb_array_length(v_items) > 30 then
    return jsonb_build_object('ok', false, 'error', 'pedido');
  end if;
  if coalesce((select value from settings where key='webOpen'), '1') <> '1' then return jsonb_build_object('ok', false, 'error', 'closed'); end if;
  if v_type = 'domicilio' then v_fee := coalesce((select nullif(value,'')::numeric from settings where key='deliveryFee'), 0); end if;
  v_total := v_fee;
  for v_item in select * from jsonb_array_elements(v_items) loop
    select price into v_price from products where active and lower(name) = lower(trim(v_item->>'name'));
    if v_price is null then return jsonb_build_object('ok', false, 'error', 'noexiste:' || coalesce(v_item->>'name','')); end if;
    v_qty := least(greatest(coalesce((v_item->>'qty')::int, 1), 1), 20);
    v_total := v_total + v_price * v_qty;
  end loop;
  insert into orders (type, status, name, phone, addr, pickup, driver, notes, total, paid, pay_method, source, created_at)
  values (v_type, 'nuevo', v_name, v_phone, v_addr, v_pickup, '', v_notes, round(v_total,2), false, '', 'web', now())
  returning id into v_order_id;
  for v_item in select * from jsonb_array_elements(v_items) loop
    select price into v_price from products where active and lower(name) = lower(trim(v_item->>'name'));
    v_qty := least(greatest(coalesce((v_item->>'qty')::int, 1), 1), 20);
    insert into order_items (order_id, name, price, qty) values (v_order_id, trim(v_item->>'name'), v_price, v_qty);
  end loop;
  return jsonb_build_object('ok', true, 'id', v_order_id);
end;
$func$;
grant execute on function public.place_order(jsonb) to anon, authenticated;

-- ---------- REINICIO DE OPERATIVA (con PIN) ----------
create or replace function public.reset_operativa(pin text)
returns jsonb
language plpgsql security definer
as $func$
declare
  v_pin text;
  c_orders int; c_items int; c_sess int; c_mov int; c_arq int; c_rev int; c_tc int;
begin
  select value into v_pin from settings where key = 'resetPin';
  if v_pin is null or pin is distinct from v_pin then
    return jsonb_build_object('ok', false, 'error', 'pin');
  end if;
  select count(*) into c_orders from orders;
  select count(*) into c_items from order_items;
  select count(*) into c_sess from cash_sessions;
  select count(*) into c_mov from cash_movements;
  select count(*) into c_arq from cash_arqueos;
  select count(*) into c_rev from reviews;
  select count(*) into c_tc from time_clock;
  delete from order_items where true;
  delete from orders where true;
  delete from cash_movements where true;
  delete from cash_sessions where true;
  delete from cash_arqueos where true;
  delete from reviews where true;
  delete from time_clock where true;
  alter table orders alter column id restart with 1;
  alter table order_items alter column id restart with 1;
  alter table cash_sessions alter column id restart with 1;
  alter table cash_movements alter column id restart with 1;
  alter table cash_arqueos alter column id restart with 1;
  alter table reviews alter column id restart with 1;
  alter table time_clock alter column id restart with 1;
  return jsonb_build_object('ok', true, 'borrados', jsonb_build_object(
    'pedidos', c_orders, 'lineas', c_items, 'sesiones', c_sess,
    'movimientos', c_mov, 'arqueos', c_arq, 'valoraciones', c_rev, 'fichajes', c_tc));
end;
$func$;
grant execute on function public.reset_operativa(text) to authenticated;

-- ---------- FOTOS (Storage) ----------
insert into storage.buckets (id, name, public) values ('productos','productos',true)
on conflict (id) do nothing;
create policy "productos read" on storage.objects for select to anon, authenticated using (bucket_id='productos');
create policy "productos insert" on storage.objects for insert to authenticated with check (bucket_id='productos');
create policy "productos update" on storage.objects for update to authenticated using (bucket_id='productos');
create policy "productos delete" on storage.objects for delete to authenticated using (bucket_id='productos');

-- ---------- CONFIGURACIÓN INICIAL ----------
insert into settings (key, value) values
 ('businessName', 'Restaurante Punto Verde'),
 ('businessAddr', ''), ('businessPhone', ''), ('businessNif', ''),
 ('ticketFooter', '¡Gracias por su compra!'),
 ('autoPrintKitchen', '1'), ('soundNewOrder', '1'),
 ('blindArqueo', '0'), ('deliveryFee', '0'),
 ('rateQr', '1'), ('webOpen', '1'), ('webDomicilio', '0'),
 ('resetPin', '1234'),
 ('favorites', '["Bandeja paisa","Sancocho mixto","Menú del día","Empanadas","Jugo natural en agua (personal)"]')
on conflict (key) do nothing;

-- ---------- CARTA REAL ----------
insert into products (name, price, category, position) values
('Calentado con chicharrón, arepa y queso', 10.00, 'Desayunos', 1),
('Calentado con chorizo, arepa y queso', 8.00, 'Desayunos', 2),
('Calentado con huevos pericos', 7.00, 'Desayunos', 3),
('Arepa y queso', 6.50, 'Desayunos', 4),
('Chorizo, huevos pericos, arepa y queso', 6.50, 'Desayunos', 5),
('Morcilla con arepa', 8.00, 'Desayunos', 6),
('Huevos pericos, arepa y queso', 5.50, 'Desayunos', 7),
('Pandebono', 1.60, 'Desayunos', 8),
('Chorizo', 1.50, 'Adicionales', 9),
('Huevos pericos', 2.50, 'Adicionales', 10),
('Huevo frito', 1.00, 'Adicionales', 11),
('Aguacate', 1.00, 'Adicionales', 12),
('Arepa tela', 1.20, 'Adicionales', 13),
('Arepa pequeña', 0.60, 'Adicionales', 14),
('Menú del día (arroz, frijoles, ensalada, papa, sopa, proteína y bebida)', 12.00, 'Menú del día', 15),
('Menú infantil', 8.00, 'Menú del día', 16),
('Bandeja paisa', 14.50, 'A la carta', 17),
('Sobre barriga en salsa', 13.50, 'A la carta', 18),
('Lengua en salsa', 13.50, 'A la carta', 19),
('Pescado frito', 14.00, 'A la carta', 20),
('Chuleta valluna', 13.50, 'A la carta', 21),
('Ternera a la plancha o en bistec', 13.50, 'A la carta', 22),
('Mondongo (viernes y sábados)', 14.00, 'A la carta', 23),
('Tamal', 10.00, 'A la carta', 24),
('Sancocho de gallina', 13.00, 'Especialidad fin de semana', 25),
('Sancocho de costilla', 14.00, 'Especialidad fin de semana', 26),
('Sancocho mixto', 15.00, 'Especialidad fin de semana', 27),
('Chicharrón con arepa o patacón o papa frita', 8.00, 'Raciones y porciones', 28),
('Churrasco con arepa o patacón o papa frita', 10.00, 'Raciones y porciones', 29),
('Maduro con queso', 6.50, 'Raciones y porciones', 30),
('Porción de ensalada', 3.00, 'Raciones y porciones', 31),
('Porción de patatas', 3.00, 'Raciones y porciones', 32),
('Porción de arroz', 2.50, 'Raciones y porciones', 33),
('Porción de tajada maduro', 3.00, 'Raciones y porciones', 34),
('Ají adicional', 1.00, 'Raciones y porciones', 35),
('Empanadas', 1.80, 'Entradas y para compartir', 36),
('Patacones con guiso', 4.00, 'Entradas y para compartir', 37),
('Patacones con queso y guiso', 5.50, 'Entradas y para compartir', 38),
('Picada de chorizo, morcilla y papa vapor', 8.00, 'Entradas y para compartir', 39),
('Café', 1.20, 'Bebidas y jugos naturales', 40),
('Café con leche', 1.50, 'Bebidas y jugos naturales', 41),
('Milo frío o caliente', 4.00, 'Bebidas y jugos naturales', 42),
('Chocolate', 2.50, 'Bebidas y jugos naturales', 43),
('Gaseosa manzana/uva/colombiana/malta', 2.80, 'Bebidas y jugos naturales', 44),
('Coca Cola / Fanta / Aquarius', 2.30, 'Bebidas y jugos naturales', 45),
('Borojo personal', 4.50, 'Bebidas y jugos naturales', 46),
('Jugo natural en agua (personal)', 3.50, 'Bebidas y jugos naturales', 47),
('Jugo natural en agua (jarra)', 6.00, 'Bebidas y jugos naturales', 48),
('Jugo natural en leche (personal)', 4.50, 'Bebidas y jugos naturales', 49),
('Jugo natural en leche (jarra)', 7.50, 'Bebidas y jugos naturales', 50),
('Amstel botella', 2.50, 'Cervezas', 51),
('Heineken / Corona / Alhambra', 3.50, 'Cervezas', 52),
('Cerveza cero', 3.00, 'Cervezas', 53);
