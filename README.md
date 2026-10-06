# MaxiKiosko KP

Aplicación web para administrar un kiosco o almacén de barrio: **control de
créditos ("fiado"), inventario, punto de venta, gastos e historial de ventas**.
Funciona en el celular del dueño del comercio, también sin internet, y
sincroniza con la nube cuando vuelve la conexión.

Es una **aplicación web estática** (HTML + CSS + JavaScript sin framework ni
dependencias) conectada a **Supabase/PostgreSQL** como base de datos.

🔗 **Demo en línea:** https://kiosko-kp-web.vercel.app

---

## Qué resuelve

El problema real de un kiosco o almacén de barrio: el fiado se anota en un
cuaderno o en mensajes sueltos, y nadie sabe con certeza cuánto debe cada
cliente ni qué pasó con el stock. Esta app reemplaza ese cuaderno con:

- **Fiado por cliente** con historial de movimientos, abonos y saldo
- **Recargo por mora** configurable (días de grace + porcentaje por período)
- **Ciclos de deuda**: cuando una cuenta se liquida, se archivan sus
  movimientos en un ciclo y arranca un historial nuevo, sin perder el pasado
- **Inventario** con control de stock y valorización
- **Punto de venta** rápido (fiado o pago directo)
- **Gastos** con carga por categorías
- **Historial de ventas** con búsqueda y filtro por medio de pago
- **10 indicadores** en el inicio: total fiado, mayor deudor, plata en
  productos, ventas del mes, ganancia mensual, etc.

---

## Características técnicas

### Funciona sin conexión (offline-first)

La app guarda todo en `localStorage` y trabaja con normalidad sin internet.
Cada cambio queda en una **cola de pendientes** y se sube a Supabase en
segundo plano.

- **`localStorage`** = fuente local de verdad; **PostgREST** = nube
- **Reintentos automáticos**: cada 30 s si todo va bien, 60 s si falla
- **Debounce de 1,2 s** para agrupar operaciones y no spamear la API
- Indicador visual de estado online/offline en el header

### Sincronización con paridad de borrado

El problema difícil: si borrás un cliente en el celular A, el celular B no debe
"resucitarlo" al volver a subir su copia. Se resuelve con **tombstones**:

- Cada borrado deja un registro (`tomb`) del id eliminado
- Los tombstones **nunca se borran** hasta que la nube confirma el borrado
- Al hacer `pull`, los registros locales cuyo id está en `tomb` se descartan
- Esto replica exactamente el mismo comportamiento que la app móvil

### Conflictos de datos

- **Upsert por lote** con `Prefer: resolution=merge-duplicates`
- **Snapshot + reattach**: antes de subir se toma un snapshot del estado; si
  el servidor devuelve algo distinto, los ids se re-asocia en lugar de perder
  datos
- Detección de capacidades: `probe()` verifica qué tablas existen en la base
  (para que la app funcione con esquemas viejos o parciales)
- **Detección de unidades**: reconoce si los productos se venden por unidad o
  por kilogramo, y ajusta la interfaz automáticamente

### Formato numérico argentino

`format.js` implementa aritmética y parseo de importes en formato `es_AR`
(punto de miles, coma decimal):

```
$12.500,06   ->  12500.06
0,5 kg       ->  cantidad fraccionaria
```

Incluye heurística para desambiguar `"12.500"` (milares) vs `"12.5"` (decimal).

### Interfaz

- **Routing por hash** (`#/fiados`, `#/inventario`, `#/cobrar`): URLs
  compartibles, botones atrás/adelante del navegador funcionan, y en celular
  el botón "atrás" cierra modales y detalles antes de salir de la vista
- **Autocompletado** de clientes y productos por nombre, con prellenado de precio
- **Feedback sonoro** en momentos clave (fiar, abono, cuenta saldada, borrar
  fiado, venta, gasto) con mute persistente
- **Toasts** para confirmar cada acción
- **Exportar / importar** datos en formato texto compatible 100% con la app
  móvil, e importación de tickets de venta
- Responsive, pensado para usar desde el celular en el mostrador

### Arquitectura

JavaScript modular sin build ni bundler, cada módulo en su propio namespace
global:

| Archivo | Responsabilidad |
|---|---|
| `js/config.js` | Credenciales de Supabase y tiempos de sincronización |
| `js/store.js` | Estado, persistencia local, cola de sync, lógica de negocio |
| `js/db.js` | Capa de datos contra Supabase vía PostgREST directo |
| `js/format.js` | Formato y aritmética de moneda/cantidad `es_AR` |
| `js/parsers.js` | Parser del formato de backup/ticket (compartido con Flutter) |
| `js/app.js` | Render de las 6 vistas y todo el manejo de UI |
| `css/styles.css` | Estilos, animaciones de transición y layout responsive |

~3.200 líneas de código propio.

---

## Base de datos

Esquema en 10 tablas (disponible en `supabase_schema.sql` en el repositorio
Flutter):

`customers` · `movements` · `debt_cycles` · `archived_movements` · `products` ·
`sales` · `sale_items` · `expenses` · `pending_sales` ·
`pending_sale_items`

Con Row Level Security habilitado y política `anon` abierta, por eso la clave
pública se puede exponer en una página estática sin riesgo.

---

## Cómo correrlo

Es un sitio estático, no necesita build.

```bash
# Con cualquier servidor local
npx serve .
```

O directamente abrí `index.html` en el navegador para probar la interfaz
(la sincronización con Supabase requiere el archivo servido por HTTP).

### Deploy

Pensado para Vercel, Netlify o GitHub Pages. Incluye `.nojekyll` para que
GitHub Pages no interfiera con los archivos que empiezan con `_`.

---

## Stack

- **HTML5 + CSS3 + JavaScript (ES5+)** — sin framework, sin build, sin `npm install`
- **Supabase** — PostgreSQL + API REST (PostgREST)
- **IndexedDB/localStorage** — persistencia local
- **Vercel** — hosting
- **Material Icons** y **Google Fonts** — iconografía y tipografía

## Créditos

Efectos de sonido de [Mixkit](https://mixkit.co/free-sound-effects/) bajo su
licencia de uso libre (ver `sounds/CREDITS.txt`).

---

## Relacionado

Este proyecto es la **versión web** de una app móvil nativa en Flutter/Dart
con la misma lógica de negocio. Los parsers de backup/export son compatibles
con la app móvil en ambos sentidos: lo que exporta una, lo importa la otra.