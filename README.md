# Nóminas del Barco

Sistema de gestión de nóminas y liquidaciones para embarcaciones pesqueras.

## Arranque en local — paso a paso exacto

### 1. Requisitos previos

- Node.js 20+
- PostgreSQL 15+ corriendo en local
- npm o yarn

### 2. Clonar / descomprimir el proyecto

```bash
cd nominas-barco
```

### 3. Instalar dependencias

```bash
npm install
```

### 4. Configurar variables de entorno

```bash
cp .env.example .env
```

Edita `.env` y ajusta:

```env
DATABASE_URL="postgresql://TU_USUARIO:TU_PASSWORD@localhost:5432/nominas_barco"
JWT_SECRET="cambia-esto-por-una-cadena-aleatoria-de-32-caracteres"
UPLOAD_DIR="./uploads"
```

Para generar un JWT_SECRET seguro:
```bash
openssl rand -base64 32
```

### 5. Crear la base de datos

```bash
# Opción A — push directo (desarrollo)
npm run db:push

# Opción B — migraciones (recomendado para producción)
npm run db:migrate
```

### 6. Cargar datos de ejemplo

```bash
npm run db:seed
```

El seed crea:
- 2 barcos (Mar de Fisterra, Santa María del Mar)
- 4 puertos (Vigo, A Coruña, Marín, Burela)
- 5 tripulantes con categorías y IRPF
- 2 facturas reales de octubre 2024
- Gastos del período
- Regla de reparto 50/50 (ajusta antes de usar en producción)
- Parámetros SS orientativos (verifica con Tesorería)

### 7. Arrancar el servidor

```bash
npm run dev
```

Abre: **http://localhost:3000**

### 8. Credenciales de acceso

| Usuario | Contraseña | Rol |
|---|---|---|
| admin@nominas-barco.com | admin1234 | Admin (acceso total) |
| oficina@nominas-barco.com | oficina1234 | Oficina (lectura+escritura) |

---

## Flujo de trabajo completo

### 1. Configurar antes de calcular

Ve a **Configuración** y verifica/ajusta:
- ✅ **Reglas de reparto** — porcentajes armador/tripulación (verificar convenio)
- ✅ **Seguridad Social** — tasas empleado/empleador (verificar Tesorería SS Marítima)
- ✅ **Períodos** — crea el período del mes que quieres liquidar

Ve a **Maestros** y verifica:
- ✅ **Barcos** — están dados de alta
- ✅ **Tripulantes** — asignados al barco con categoría e IRPF correcto

### 2. Importar facturas de captura

1. Ve a **Facturas → Importar factura**
2. Arrastra un PDF, Excel o CSV
3. El sistema extrae los datos automáticamente (confianza variable)
4. Revisa y corrige la extracción en el formulario
5. Guarda y marca como revisada

### 3. Registrar gastos

1. Ve a **Gastos → Añadir gasto**
2. Selecciona tipo, importe, período y barco
3. Elige la imputación:
   - **AMBOS** → descuenta del monte mayor (ambas partes)
   - **BARCO** → ídem
   - **ARMADOR** → solo descuenta de la parte del armador
   - **TRIPULACIÓN** → solo descuenta de la parte de la tripulación

### 4. Calcular nómina

1. Ve a **Nóminas → Calcular**
2. Selecciona período y barco
3. Pulsa **Ejecutar cálculo**
4. El motor aplica: capturas → gastos → monte mayor → reparto → SS → IRPF → neto
5. Revisa los avisos de parametrización
6. Ve al detalle y **valida** la liquidación
7. Cuando sea definitiva, **cierra el período**

### 5. Exportar

Desde el detalle de la nómina:
- **↓ CSV** — datos tabulados
- **↓ Excel** — hoja resumen + detalle marineros con formato
- **↓ PDF** — liquidación con totales y detalle por marinero

---

## Estructura del proyecto

```
src/
├── app/
│   ├── (auth)/login/          # Login
│   ├── (dashboard)/           # Todas las pantallas autenticadas
│   │   ├── dashboard/         # KPIs y gráficos
│   │   ├── facturas/          # Listado, importación, detalle
│   │   ├── gastos/            # Listado y formulario
│   │   ├── nominas/           # Listado, cálculo, detalle
│   │   ├── maestros/          # Barcos, puertos, tripulantes
│   │   └── configuracion/     # Períodos, reglas, SS, fiscal
│   └── api/                   # Route handlers
│       ├── auth/              # login, logout, me
│       ├── facturas/          # CRUD + upload + review
│       ├── gastos/            # CRUD
│       ├── nominas/           # calcular, list, get, patch
│       ├── maestros/          # barcos, puertos, tripulantes…
│       ├── dashboard/stats    # KPIs agregados
│       └── export/            # csv, excel, pdf
├── lib/
│   ├── auth.ts                # JWT auth
│   ├── db.ts                  # Prisma client
│   ├── audit.ts               # Auditoría de cambios
│   ├── decimal.ts             # Helpers numéricos
│   ├── permissions.ts         # RBAC
│   ├── utils.ts               # Formatters, API helpers
│   ├── calc-engine/
│   │   ├── payroll.ts         # Motor de cálculo (CORE)
│   │   └── types.ts           # Tipos del motor
│   ├── parsers/
│   │   └── invoice-parser.ts  # CSV/PDF/Excel/imagen
│   └── validations/
│       └── index.ts           # Schemas Zod
├── components/
│   ├── ui/                    # Button, Input, Badge, Card, Modal, Toast
│   ├── layout/                # Sidebar, Topbar
│   └── tables/                # DataTable paginable
├── hooks/
│   ├── use-fetch.ts           # Fetching con estado
│   └── use-toast.ts           # Notificaciones
└── middleware.ts              # Protección de rutas JWT
```

---

## Parámetros pendientes de verificación ⚠

Antes de usar en producción, verifica con asesoría:

| Parámetro | Dónde | Estado |
|---|---|---|
| % armador / tripulación | Configuración → Reglas reparto | ⚠ Usar convenio colectivo real |
| % SS empleado | Configuración → Seguridad Social | ⚠ Verificar con Tesorería REASS |
| % SS empleador | Configuración → Seguridad Social | ⚠ Verificar con Tesorería REASS |
| Base cotización SS | lib/calc-engine/payroll.ts | ⚠ Actualmente: Total Capturas proporcional |
| IRPF por marinero | Maestros → Tripulantes | ✏ Editable individualmente |
| Retención mínima IRPF pesca | lib/calc-engine/payroll.ts | ⚠ Verificar con AEAT |

---

## Comandos disponibles

```bash
npm run dev          # Servidor de desarrollo
npm run build        # Build de producción
npm run start        # Servidor de producción
npm run db:generate  # Regenerar Prisma client
npm run db:push      # Sync schema sin migraciones
npm run db:migrate   # Crear migración
npm run db:seed      # Cargar datos de ejemplo
npm run db:studio    # Interfaz visual de la BD
npm run db:reset     # Reset completo + seed
```

---

## Próximos pasos para producción

1. **Autenticación robusta** — añadir 2FA, caducidad de sesiones, refresh tokens
2. **Almacenamiento** — mover uploads a S3/Cloudflare R2
3. **OCR real** — conectar Google Vision API o AWS Textract en `lib/parsers/invoice-parser.ts`
4. **Variables de entorno** — usar secrets manager en producción
5. **HTTPS** — configurar certificado SSL
6. **Backups** — configurar backups automáticos PostgreSQL
7. **Tests** — añadir tests del motor de cálculo (`lib/calc-engine/payroll.ts`)
8. **Logs** — configurar logging estructurado
