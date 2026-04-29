# Capturas · Itsas Lagunak

Aplicación Next.js (App Router) + TypeScript + PostgreSQL + Prisma + Zod + Tailwind para gestionar capturas pesqueras del barco **ITSAS LAGUNAK** a partir de facturas PDF emitidas por distintos puertos y cofradías.

## Requisitos previos
- Node.js 18.18+ (recomendado 20 LTS)
- PostgreSQL 14+ en local (o Docker)
- npm / pnpm
- Dropbox instalado y sincronizado (si se usa el watcher)

## Instalación y arranque

```bash
# 1) Instalar dependencias
npm install

# 2) Configurar entorno
cp .env.example .env
# Edita DATABASE_URL y AUTH_SECRET

# 3) Crear BD y esquema
npx prisma migrate dev --name init

# 4) Semillas (usuario admin, puertos, barco, especies, formatos, equivalencias base)
npm run prisma:seed

# 5) Arrancar la app
npm run dev
# → http://localhost:3000

# 6) (Opcional) Arrancar el watcher en OTRO terminal
npm run watch
```

Usuario inicial:
- **admin@capturas.local / admin1234**

## Arquitectura

```
src/
 ├─ middleware.ts           # Autenticación por cookie (redirige a /login)
 ├─ app/                    # App Router (páginas y API routes)
 │   ├─ api/                # Route Handlers (backend REST)
 │   └─ (pages)             # UI
 ├─ components/             # Componentes de UI reutilizables
 └─ lib/
     ├─ prisma.ts           # cliente Prisma singleton
     ├─ auth.ts, session.ts # JWT cookie, requireSession/requireRole
     ├─ audit.ts            # registro de cambios
     ├─ zod/schemas.ts      # validaciones
     ├─ repositories/       # acceso a datos (masters, documents, invoices)
     ├─ services/           # lógica de negocio
     │   ├─ import-document.ts   # orquesta subida + parser + persistencia
     │   ├─ species-normalizer.ts
     │   ├─ invoices.ts          # save/verify con auditoría
     │   └─ dashboard.ts
     ├─ parsers/
     │   ├─ base.ts              # tipos compartidos
     │   ├─ classifier.ts        # elige parser según signatures o matches()
     │   ├─ pdf-text.ts          # extracción de texto vía pdf-parse
     │   ├─ generic.ts           # fallback
     │   └─ hondarribia-sanmartin.ts
     └─ export/ csv.ts · excel.ts · pdf.ts
```

## Cómo añadir un parser para un puerto nuevo

1. Crear `src/lib/parsers/<puerto>-<cofradia>.ts` exportando un `ParserHandler` que:
   - implemente `matches(ctx)` (puede apoyarse en `ctx.formatConfig.signatures`)
   - implemente `parse(ctx)` devolviendo un `ParsedInvoice`
2. Registrarlo en `src/lib/parsers/index.ts`.
3. En la UI (`/formats`) o por seed, crear un `DocumentFormat` con:
   - `code`: identificador ej. `PASA_COFRADIAX`
   - `parserKey`: debe coincidir con el `key` del `ParserHandler`
   - `portId`: puerto asociado
   - `config.signatures`: listado de substrings detectables en el texto del PDF
   - `config.defaultVatRate`: IVA por defecto si procede

El clasificador (`classifier.ts`) resolverá automáticamente el parser al importar un nuevo PDF.

## Equivalencias de especies

`/equivalences` permite mapear denominaciones crudas del PDF (p.ej. `ANE/BOCARTE VIIIC`) a especies normalizadas (`ANE – Anchoa / Bocarte`). El alcance puede ser `GLOBAL` o específico de un puerto. El servicio `species-normalizer.ts` aplica primero equivalencias del puerto y, si no hay match, las globales.

## Watcher de carpeta Dropbox

La app puede vigilar automáticamente una carpeta local (p. ej. una ruta de Dropbox sincronizada) y auto-importar los PDFs que aparezcan. Se configura en `.env`:

```
WATCH_FOLDER="C:\\Users\\User\\Dropbox\\Itsas Lagunak\\Cuentas 2026\\Capturas Txanteles"
WATCH_RECURSIVE="true"
WATCH_PORT_HINT_FROM_SUBFOLDER="true"
WATCH_STABILITY_MS="1500"
```

Arrancarlo en un terminal aparte:

```bash
npm run watch
```

El watcher:
- Usa `chokidar` con `awaitWriteFinish` (espera a que Dropbox termine de escribir el fichero antes de procesarlo).
- Deduplica por `sha256` — si el PDF ya existe en BD, no se reimporta.
- Si `WATCH_PORT_HINT_FROM_SUBFOLDER=true`, usa el nombre de la subcarpeta inmediata como pista de puerto (ej. `.../Capturas Txanteles/Hondarribia/xx.pdf` → pista "Hondarribia"). Esto se pasa al clasificador como `portHint`.
- Registra cada archivo procesado en `AuditLog` con `action=UPLOAD` y `newValue.source="watcher"`.
- Persiste un `.watch-state.json` en el root del proyecto para que la UI (página Documentos) muestre el estado en tiempo real.

Desde la UI también se puede disparar un escaneo manual con el botón **"Escanear carpeta ahora"** en `/documents`, que llama a `POST /api/watcher/scan`.

### Señales útiles
- Si el badge de `/documents` aparece en ámbar: el watcher no está corriendo. Ejecuta `npm run watch`.
- Si un PDF no aparece aunque esté en la carpeta: puede que Dropbox siga sincronizándolo. El watcher esperará a que quede estable.

## Auditoría

Cada creación, modificación, verificación o re-parseo queda registrado en `AuditLog` con `userId`, `entity`, `entityId`, `field`, `oldValue`, `newValue` y `createdAt`.

## Exportación

- `GET /api/export/csv`
- `GET /api/export/xlsx`
- `GET /api/export/pdf`

Aceptan filtros `from`, `to`, `portId`, `boatId`, `supplierId`, `speciesId`.

## Parámetros / reglas pendientes de decisión

El seed y el parser de Hondarribia dejan configurables:

- **defaultVatRate** por formato (ahora 10 para Hondarribia) — se puede cambiar sin tocar código.
- **signatures** por formato — se añaden desde `/formats`.
- **IVA por línea** — actualmente se calcula aplicando `defaultVatRate` al importe, porque el PDF de San Martín **sólo reporta IVA a nivel factura** (no por línea). Si se desea un desglose exacto por línea, crear un parámetro en `DocumentFormat.config` con el reparto concreto.
- **Tratamiento de "Gastos"** (cofradía) — hoy van al campo `fees` de la factura, no se crea línea. Si en el futuro se quieren como línea de gasto, crear un parámetro `expensesAsLine=true`.
- **Códigos oficiales de especies (FAO)** — no se infieren automáticamente; se resuelven vía maestro `Species` + `SpeciesEquivalence`.

## Tests

```bash
npm run test
```

Sugerencia inicial: tests del parser de Hondarribia sobre texto crudo (ver fixture real en el issue del proyecto).

## Notas de despliegue

- `storage/` se crea al primer upload y contiene los PDFs originales indexados por sha256. En producción se recomienda mover a S3/Minio.
- `AUTH_SECRET` debe cambiarse en producción.
- Activar `prisma migrate deploy` en CI/CD.
