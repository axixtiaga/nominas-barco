# Manual de supervivencia — Itsas Lagunak Capturas

> **Para imprimir, guardar y consultar cuando algo va mal.**
>
> Este manual está pensado para situaciones de urgencia: la app no arranca, faltan datos, el PC se ha roto, etc. **Imprímelo y guárdalo en un sitio físico** (carpeta del barco, despacho). También está en GitHub: https://github.com/axixtiaga/nominas-barco

Última actualización: 29 de abril de 2026.

---

## 1. Información clave a tener siempre a mano

### Datos de la aplicación

| Concepto | Valor |
|---|---|
| Nombre del proyecto | **Capturas Itsas Lagunak** |
| Carpeta del proyecto en el PC | `C:\Users\User\Documents\Claude\Projects\Capturas` |
| URL local cuando está en marcha | http://localhost:3000 |
| URL del código en GitHub | https://github.com/axixtiaga/nominas-barco |
| Carpeta de PDFs de capturas | `C:\Users\User\Dropbox\Itsas Lagunak\Cuentas 2026\Capturas Txanteles` |
| Carpeta de PDFs de gastos | `C:\Users\User\Dropbox\Itsas Lagunak\Cuentas 2026\Gastos Txanteles` |
| Carpeta de Excels SS | `C:\Users\User\Dropbox\Itsas Lagunak\Cuentas 2026\Seguridad Social` |
| Carpeta de backups | `C:\Users\User\Dropbox\Itsas Lagunak\Backups` |

### Acceso a la app

| Cuenta | Email | Contraseña |
|---|---|---|
| Administrador | `admin@capturas.local` | `admin1234` |
| (Apunta aquí los demás usuarios cuando los crees) | | |

### Cuentas externas relacionadas

| Servicio | Email | Para qué sirve |
|---|---|---|
| Gmail Itsas Lagunak | `itsaslagunak@gmail.com` | Cuenta del barco, envío automático de PDFs |
| GitHub | `axixtiaga@gmail.com` | Backup del código de la app |
| Dropbox | (la cuenta del barco) | Sincronización de carpetas y backups |

> **App passwords** (las de 16 letras de Google) **no se apuntan aquí**. Están en el `.env` del PC. Si las necesitas regenerar: https://myaccount.google.com/apppasswords

---

## 2. Cómo arrancar la app (uso normal del día a día)

1. Doble clic en el acceso directo de **Capturas** del escritorio.
2. Se abre una ventana negra (terminal) que dice cosas como `Ready in X.Xs`. **No la cierres** — es lo que mantiene la app encendida.
3. Abre el navegador y ve a **http://localhost:3000**.
4. Login con tus credenciales.

**Para apagar la app**: cierra la ventana negra de la terminal (o pulsa Ctrl+C dentro de ella y luego ciérrala).

---

## 3. Si la app no arranca

### Síntoma: el navegador dice "No se puede acceder a este sitio" o "Esta página no funciona"

1. Comprueba que la **ventana negra está abierta** y dice `Ready in X.Xs`. Si la cerraste sin querer, vuelve a hacer doble clic en el acceso directo.

2. Si la ventana sí está abierta pero hay errores en rojo, hazle una **captura de pantalla** y guárdala. Esa info es lo que necesita Asier (o un informático) para diagnosticar.

3. **Reinicia el PC** y vuelve a arrancar la app desde el acceso directo. Resuelve el 80% de los problemas raros.

### Síntoma: errores en pantalla cuando navegas por la app

1. **Refresca con Ctrl+F5** (mantén Ctrl y pulsa F5). Limpia la caché del navegador.
2. Si persiste, **cierra sesión y vuelve a entrar**.
3. Si persiste, **reinicia la aplicación**: cierra la ventana negra y vuelve a hacer doble clic en el acceso directo.

### Síntoma: error tipo "Cannot connect to database" o "PostgreSQL"

PostgreSQL es la base de datos. Pasos:

1. Pulsa la tecla **Windows** y escribe `Servicios`. Ábrelo.
2. Busca en la lista cualquier servicio que empiece por **"postgresql-"** (suelen ser `postgresql-x64-16` o `postgresql-x64-17`).
3. Comprueba que su estado pone **"En ejecución"**. Si pone **"Detenido"**: clic derecho → **Iniciar**.
4. Vuelve a la app.

---

## 4. Si los datos parecen mal o se han borrado

**No te asustes**: tienes backups diarios automáticos en Dropbox.

### Restaurar desde una copia anterior

1. Abre el navegador en la app: **Maestros → Backups**.
2. Busca el backup del día/momento al que quieres volver.
3. **Antes de restaurar**, haz un backup del estado actual por si necesitas volver atrás: pulsa **"💾 Hacer backup ahora"**.
4. Abre el **Símbolo del sistema** (tecla Windows → escribe `cmd` → Enter).
5. Pega este comando (sustituyendo `YYYY-MM-DD-HHMMSS` por la fecha del backup que quieres restaurar):

   ```
   "C:\Program Files\PostgreSQL\17\bin\pg_restore.exe" --host=localhost --port=5432 --username=postgres --dbname=capturas --clean --if-exists "C:\Users\User\Dropbox\Itsas Lagunak\Backups\capturas-YYYY-MM-DD-HHMMSS.dump"
   ```

6. Te pedirá la contraseña de Postgres. La encontrarás en el archivo `.env` del proyecto (en la línea `DATABASE_URL=...` después de `postgres:`).

7. Espera a que termine. Refresca la app en el navegador. Los datos serán los del backup elegido.

> ⚠️ **Esto sobrescribe los datos actuales con los del backup**. Por eso conviene hacer un backup antes de restaurar (paso 3).

---

## 5. Si el PC se ha roto o cambias de PC

Recuperar la app entera en un PC nuevo lleva 1-2 horas. Necesitas:

- Un PC con Windows.
- Conexión a internet.
- Acceso a tu cuenta de Dropbox y de GitHub.

### Pasos

1. **Instala PostgreSQL 17** desde https://www.postgresql.org/download/windows/
   - Durante la instalación marca **"Command Line Tools"** (importante).
   - **Apunta la contraseña de postgres que pongas** (la necesitarás).

2. **Instala Node.js** versión 20 o superior desde https://nodejs.org

3. **Instala Git** desde https://git-scm.com/download/win

4. **Instala Dropbox** y espera a que sincronice tus carpetas (los PDFs, Excels y backups bajarán solos).

5. Abre el **Símbolo del sistema** y ejecuta:
   ```
   cd C:\Users\User\Documents
   mkdir Claude
   cd Claude
   mkdir Projects
   cd Projects
   git clone https://github.com/axixtiaga/nominas-barco.git Capturas
   cd Capturas
   npm install
   ```

6. **Crea un archivo `.env`** en la carpeta del proyecto. Necesitas saber:
   - DATABASE_URL: usa el formato `postgresql://postgres:LACONTRASEÑA@localhost:5432/capturas?schema=public`
   - AUTH_SECRET: cualquier texto largo (ej. `capturas-itsas-lagunak-2026-clave-secreta`)
   - WATCH_FOLDER, GASTOS_FOLDER, SS_FOLDER, BACKUP_FOLDER: las rutas de la tabla del punto 1
   - SMTP_*: las credenciales de Gmail (las puedes regenerar si las has perdido)

   Si no recuerdas el contenido exacto del `.env`, mira en GitHub el fichero `.env.example` que tiene una plantilla.

7. **Crea la base de datos vacía** en Postgres y aplica el esquema:
   ```
   npx prisma db push
   npx prisma generate
   ```

8. **Restaura el último backup** desde Dropbox (ver punto 4).

9. **Arranca la app**:
   ```
   npm run dev
   ```

10. Abre http://localhost:3000 y haz login.

11. Para que el watcher y los backups automáticos vuelvan a funcionar, hay que rehacer:
    - El acceso directo del escritorio (que arranca app + watcher).
    - La tarea programada del backup nocturno (Programador de tareas → Crear tarea básica).

> Si no tienes claro algún paso, **llama a Asier o a un informático local** y enséñale este manual. Cualquier desarrollador web con experiencia en Node + Postgres lo monta en una mañana.

---

## 6. Si el envío automático de emails deja de funcionar

### Síntoma: al pulsar "Enviar PDFs por email" sale error

1. Comprueba que tienes internet.
2. Ve a https://localhost:3000/api/smtp/verify (en una pestaña del navegador).
   - Si dice `{"ok":true,"data":{"ok":true}}` → SMTP funciona, el problema es otro.
   - Si dice error: la app password de Gmail probablemente caducó o se invalidó.

### Cómo regenerar la app password de Gmail

1. Ve a https://myaccount.google.com/apppasswords (con la cuenta de Itsas Lagunak).
2. Borra la app password vieja llamada "Capturas".
3. Crea una nueva con el mismo nombre. Copia los 16 caracteres (sin espacios).
4. Edita el `.env` del proyecto:
   - Busca la línea `SMTP_PASS=...`
   - Reemplaza con la nueva: `SMTP_PASS=xxxxxxxxxxxxxxxx`
5. Guarda y reinicia la app (cierra terminal negra, vuelve a hacer doble clic en el acceso directo).

---

## 7. Si Outlook deja de sincronizar la cuenta de Gmail

Mismo problema: la app password de Outlook caducó o Google la invalidó.

1. Ve a https://myaccount.google.com/apppasswords
2. Crea una app password nueva llamada "Outlook".
3. En Outlook: **Archivo → Configuración de la cuenta → Configuración de la cuenta**.
4. Selecciona la cuenta de Gmail → **Reparar** (o quitar y volver a añadir).
5. Cuando pida la contraseña, pega los 16 caracteres de la app password nueva.

---

## 8. Quién puede ayudarte si Asier no está disponible

### Para problemas leves (la app va lenta, errores menores)

- Refresca el navegador (Ctrl+F5).
- Reinicia el PC.
- Haz un backup desde Maestros → Backups (por si acaso).
- Espera unas horas a que Asier pueda responder.

### Para problemas graves (datos perdidos, app no arranca tras varios intentos, PC roto)

Llama a un **informático local** que tenga experiencia en:
- Aplicaciones web Node.js / Next.js
- Bases de datos PostgreSQL
- Windows + línea de comandos

Enséñale este manual y especialmente:
- La sección 9 (información técnica)
- El repositorio en GitHub
- La carpeta de backups

Cualquier desarrollador web con 1-2 años de experiencia puede entender la app y ayudarte.

### Lo que NO debes hacer NUNCA

- ❌ Borrar la carpeta `C:\Users\User\Documents\Claude\Projects\Capturas` (perderías el código local — aunque está en GitHub, es complicado).
- ❌ Borrar la carpeta de Dropbox `Itsas Lagunak` (perderías PDFs originales y backups).
- ❌ Desinstalar PostgreSQL sin antes hacer un backup.
- ❌ Compartir el archivo `.env` con nadie por correo o WhatsApp (contiene contraseñas).
- ❌ Subir el archivo `.env` a GitHub (aunque el `.gitignore` lo evita, no fuerces la situación).
- ❌ Cambiar manualmente datos en la base de datos sin backup previo.

---

## 9. Información técnica (para un informático)

**Stack tecnológico**:
- Next.js 14 (App Router) + React 18 + TypeScript
- PostgreSQL 17 + Prisma ORM
- Tailwind CSS para estilos
- pdfkit (PDFs) + ExcelJS (Excel) + chokidar (watcher) + nodemailer (SMTP)
- jose (JWT auth) + bcryptjs (passwords)

**Procesos en ejecución**:
- `npm run dev` → servidor Next.js (puerto 3000)
- `npm run watch` → watcher de carpetas Dropbox (proceso aparte)
- Tarea programada de Windows que ejecuta `npm run backup` cada noche

**Estructura clave**:
- `src/app/` → rutas (páginas + API endpoints) de Next.js App Router
- `src/lib/services/` → lógica de negocio
- `src/lib/parsers/` → parsers PDF de capturas
- `src/lib/expense-parsers/` → parsers PDF de gastos
- `prisma/schema.prisma` → esquema de base de datos
- `scripts/` → tareas CLI (watcher, backup, seeders)
- `.env` → variables de entorno (NO subir a git)

**Variables de entorno críticas** (`.env`):
```
DATABASE_URL="postgresql://postgres:<pass>@localhost:5432/capturas?schema=public"
AUTH_SECRET="<32+ caracteres>"
WATCH_FOLDER="C:\\Users\\...\\Capturas Txanteles"
GASTOS_FOLDER="C:\\Users\\...\\Gastos Txanteles"
SS_FOLDER="C:\\Users\\...\\Seguridad Social"
BACKUP_FOLDER="C:\\Users\\...\\Backups"
BACKUP_RETENTION_DAYS=30
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=itsaslagunak@gmail.com
SMTP_PASS=<app-password-de-16-letras>
SMTP_FROM=itsaslagunak@gmail.com
SMTP_FROM_NAME="Itsas Lagunak"
```

**Comandos útiles**:
- `npm install` → instala dependencias
- `npm run dev` → arranca en modo desarrollo
- `npx prisma db push` → aplica cambios de schema a la BD
- `npx prisma generate` → regenera cliente Prisma tras cambios
- `npx prisma studio` → GUI para inspeccionar/editar la BD directamente
- `npm run backup` → ejecuta backup manual

**Cómo restaurar un backup**:
```
"C:\Program Files\PostgreSQL\17\bin\pg_restore.exe" \
  --host=localhost --port=5432 \
  --username=postgres --dbname=capturas \
  --clean --if-exists \
  "<ruta-al-fichero.dump>"
```

**Si necesitas resetear la base de datos completa** (último recurso):
```
npx prisma migrate reset --force
npm run prisma:seed
```

---

## 10. Lista de comprobación mensual

Para mantener todo en orden, una vez al mes:

- [ ] Comprobar que **Maestros → Backups** muestra "Al día" en verde.
- [ ] Confirmar que el último backup tiene **fecha del día actual o de ayer**.
- [ ] Abrir la carpeta de Dropbox `Backups` y verificar que hay ficheros con fechas recientes.
- [ ] Comprobar que el **watcher de Dropbox** está activo (la ventana negra de `npm run watch` sigue abierta y procesa ficheros).
- [ ] Comprobar el **estado de la cuenta de Gmail**: que no hayan caducado las app passwords (si los emails dejan de salir, regenera).
- [ ] Renovar la **suscripción de dominio o nube** si tienes (cuando aplique).

---

## Contactos

- **Asier**: <pon aquí tu teléfono y email>
- **Asesoría contable**: <nombre, teléfono, email>
- **Informático local de confianza**: <nombre, teléfono, email>
- **Banco (Kutxabank)**: <oficina, teléfono>

---

*Fin del manual. Versión 1.0 — 29/04/2026*
