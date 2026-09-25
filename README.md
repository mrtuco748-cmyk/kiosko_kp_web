# MaxiKiosko KP — Versión Web

Página web del kiosco con **las mismas funcionalidades que la app Flutter** (`Kiosko-kp`),
conectada a la **misma base de datos Supabase**. Sin dependencias, sin build:
HTML + CSS + JS puro.

## Funcionalidades (paridad con la app)

- **Inicio**: total fiado, clientes, mayor deudor, productos, plata en stock
  (ordenado por valor), ventas del mes, ganado hoy, gastado/ganancia del mes,
  ganancia total, gasto rápido, Guardar Datos (export).
- **Fiados**: alta/baja/renombre de clientes, fiar por unidad o kg
  (diálogo de peso: `0,5` · `1.400` · `700g`), deuda manual, abonos con tope
  visible + segunda confirmación si supera la deuda + vuelto como saldo a favor,
  saldar todo, recargo por período (lineal, no compuesto), semáforo
  (verde/azul/amarillo/rojo), cuenta regresiva al vencimiento, ciclos/historial
  con archivado manual, ticket por cliente (copiar + descargar `.txt`).
- **Inventario**: CRUD con unidad `u/kg`, búsqueda por nombre o marca,
  filtros (todo / sin stock / stock bajo), valor en stock en vivo.
- **Cobrar**: POS con carrito, catálogo con buscador, 3 métodos de pago,
  control de stock con epsilon en kg, edición de peso en carrito, ticket
  descargable, mini deuda (cobro rápido sin carrito, no toca stock).
- **Gastos**: alta/baja agrupados por mes con subtotales.
- **Ventas (historial)**: agrupadas por mes, búsqueda, filtro por método,
  paginación de 100, ticket y anulación con devolución de stock.
- **Importar ticket / Cargar datos**: formatos de texto 100% compatibles con
  la app Flutter (exportar de un lado, importar del otro). Cargar exige
  escribir `REEMPLAZAR`.
- **Sync Supabase**: misma URL y tablas que la app, fetch paginado (500),
  upserts y deletes por lote, caché local en `localStorage`, cola de
  pendientes + tombstones, reintento cada 30 s y al volver la conexión.
- **Formato es_AR** en todo lo visible: `$12.500,06`, coma decimal, diálogo
  anti-trampa del punto (`1500.000` pregunta miles vs decimal).

## Probar en local (0 errores, 0 instalación)

Abrí `index.html`... no: por `fetch`/CORS hay que servir la carpeta.
Con Python (ya instalado en casi todos lados):

```bash
cd web
python -m http.server 8080
# abrir http://localhost:8080
```

O con VS Code: extensión **Live Server** → "Open with Live Server".

## Subirlo a GitHub y deployarlo (gratis)

Esta carpeta `web/` es un repo aparte listo para subir:

```bash
cd web
git init
git add .
git commit -m "Kiosko KP web v1"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/kiosko-kp-web.git
git push -u origin main
```

**Deploy con GitHub Pages** (recomendado, gratis):

1. En el repo → Settings → Pages → Source: **Deploy from a branch**,
   Branch: `main`, carpeta `/ (root)`.
2. La página queda en `https://TU_USUARIO.github.io/kiosko-kp-web/`.

**Alternativas**: Netlify (arrastrar la carpeta a app.netlify.com/drop),
Vercel (`vercel` en la carpeta), Cloudflare Pages. Todas sirven archivos
estáticos sin configuración.

## Estructura

```
index.html      # las 6 vistas + modales
css/styles.css  # tema verde oscuro (igual que la app)
js/config.js    # URL + anon key de Supabase (misma BD que la app)
js/format.js    # fmt/parse es_AR, pesos kg, UUID v4  (port de helpers.dart)
js/parsers.js   # parse de export/ticket (port de backup_parser.dart)
js/db.js        # PostgREST directo, paginado + batch (port de cloud_gateway.dart)
js/store.js     # estado + totales + recargo + ciclos + sync (port de storage_service.dart)
js/app.js       # UI de las 6 pantallas (port de screens/)
```

## Notas

- La anon key es pública por diseño (igual que en `lib/main.dart` de Flutter);
  el acceso lo gobierna RLS en Supabase (`supabase_schema.sql`).
- Si tu Supabase aún no tiene las columnas `unit` / `debt_cycles`, la web
  funciona igual (detecta y degrada: kg e historial quedan solo-local hasta
  migrar — mismo comportamiento que la app).
