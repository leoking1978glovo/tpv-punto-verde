# TPV · Restaurante Punto Verde (Gastronomía Colombiana)

> **Proyecto independiente.** Repo sugerido: `tpv-punto-verde` (NO es la web del restaurante).
> Tiene su propio Supabase, su propio Vercel y su propia URL. La integración con la web
> del restaurante (`restaurante-punto-verde`) se hace después, apuntando la web al
> Supabase de ESTE proyecto.

TPV web completo para restaurante: pedidos (recogida/domicilio/mostrador), cocina en tiempo real (KDS),
caja con arqueos X/Z y arqueo ciego, tickets con QR de valoración, roles de empleados, modo offline con cola,
stock, informes con CSV, fichaje, PWA instalable y pedidos online (web/agente conectado al TPV).


## Puesta en marcha

### 1. Supabase (proyecto NUEVO, propio de Punto Verde)
1. Crea el proyecto en [supabase.com](https://supabase.com) (región Frankfurt)
2. **SQL Editor** → pega TODO `supabase/schema.sql` → **Run** (crea tablas, seguridad, tiempo real,
   pedidos online, reinicio con PIN, bucket de fotos, configuración y la carta real)
3. **Authentication → Users → Add user**: un usuario por empleado (email + contraseña)
4. **Project Settings → API**: copia la **Project URL** y la clave **anon public**

### 2. Configurar el TPV
En `index.html` busca `TU_PROYECTO` y pon tus credenciales:
```js
const SUPABASE_URL = 'https://TU_PROYECTO.supabase.co';
const SUPABASE_ANON_KEY = 'TU_ANON_KEY';
```
Igual en `valorar.html`. Si dejas el placeholder, funciona en modo local (sin guardar).

### 3. GitHub + Vercel
```bash
git add .
git commit -m "TPV Punto Verde: sistema completo con carta real"
git push
```
Vercel → Import → framework Other → Deploy.

## Pedidos online (URLs propias)
La web de Punto Verde deberá apuntar a ESTE proyecto de Supabase:
- `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` en la web y en Vercel
- El agente (tool `enviar_pedido_tpv`) usa la URL `.../rest/v1/rpc/place_order` de ESTE proyecto
- El QR del ticket apunta a `https://TU-TPV-PUNTO-VERDE.vercel.app/valorar.html?p=ID`
  (cámbialo en `index.html` buscando `TU-TPV-PUNTO-VERDE`)

## Notas
- PIN de reinicio por defecto: `1234` (cámbialo en Control → Configuración)
- Los nombres de los platos deben coincidir EXACTAMENTE entre la web/agente y la carta
