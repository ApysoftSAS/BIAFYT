# BIAFYT — Runbook de despliegue (Fase 2 · MVP Producción)

Estado: **Fase 2 — MVP Production 🟡 BLOCKED (infra).** El código está listo y
todo en `main`: hardening F1–F4 (`93b0271`) + slice de alta comercial de
gimnasio (Gym Onboarding + BIAFYT Admin, D-GYM-ONBOARDING, `e1be4f6`,
mergeado a `main` en `80e0057`). Ver `docs/PRODUCTION_HARDENING_DISCOVERY.md`.
Falta: **host + credenciales + dominio + ejecución** (nada disponible desde la
sesión que preparó esto). `git push` a `origin` aún pendiente.

Documento complementario: **`docs/PRODUCTION_HARDENING_DISCOVERY.md`** — discovery
técnico de producción (auditoría backend + frontends, riesgos, smoke test
detallado, criterio de CLOSED). Este runbook es el procedimiento operativo;
el discovery es el detalle y la justificación.

---

## Alcance de la PRIMERA producción

El lazo funcional **Cliente → Coach → Gym** está cerrado (Coach MVP + Gym MVP)
y el **alta comercial de gimnasio** (slice D-GYM-ONBOARDING: usuario solicita →
BIAFYT Admin aprueba → se crea Gym + sede + `gym_admin`). La primera
producción incluye **las 4 superficies web + el backend**:

| Superficie | ¿Primera producción? | Subdominio | Nota |
|---|---|---|---|
| `backend/` (Laravel API) | **SÍ** | `api.<dominio>` | Autoridad de Auth + Profile + gestión Coach/Gym + onboarding; catálogo de ejercicios; write-through sombra. |
| `frontend-usuario/` (app del usuario) | **SÍ — web-only** | `app.<dominio>` | "El MVP" del atleta + pantalla "Registrar mi gimnasio". **No** se empaqueta APK/iOS en esta fase. |
| `frontend-couch/` (app Coach) | **SÍ** | `coach.<dominio>` | Coach MVP: relación de consentimiento + lectura sombra del atleta + notas. El rol `coach` se concede por el `gym_admin` (o a mano — ver §4). |
| `frontend-gym-web/` (Gym Web) | **SÍ** | `gym.<dominio>` | Gym MVP: el `gym_admin` administra `member`/`coach` de su gym y ve el estado sombra de un miembro. |
| `frontend-admin/` (BIAFYT Admin) | **SÍ** | `admin.<dominio>` | Dashboard interno de plataforma: revisa solicitudes de registro de gimnasio (aprobar/rechazar) + lista de gimnasios. **No es superficie de cliente.** Todo `/admin/*` gateado por `users.is_platform_admin` (404 si no). |
| `frontend-gym/` (Gym **móvil**/Capacitor) | **NO** — fuera de alcance | — | Sigue siendo solo Gym UI Foundation. Decisión D-GYM-6. No se despliega ni se empaqueta. |

Subdominios separados ⇒ **ningún frontend necesita `base` en `vite.config.js`**
(cada uno se sirve desde la raíz de su subdominio).

`admin.<dominio>` es interno: aunque su seguridad real la impone el backend
(404 en todo `/admin/*` para quien no sea platform admin), conviene además
restringir el acceso a nivel de infra (IP allowlist / Basic Auth del host /
red privada) — **recomendado, no bloqueante**.

---

## Arquitectura de despliegue

Cinco artefactos **independientes**:

| Componente | Qué es | Subdominio | Dónde se aloja |
|---|---|---|---|
| **Backend** | API Laravel 12, JSON puro bajo `/api/v1`, auth por **token Bearer** (Sanctum, sin cookies/CSRF) | `api.<dominio>` (HTTPS) | Cualquier host PHP 8.2+ (Forge, Ploi, Railway, Render, VPS con nginx+php-fpm, …) |
| **frontend-usuario** | SPA React + Vite → **estáticos** en `dist/` | `app.<dominio>` (HTTPS) | Cualquier host estático con **fallback SPA a `index.html`** |
| **frontend-couch** | SPA React + Vite → **estáticos** en `dist/` | `coach.<dominio>` (HTTPS) | idem |
| **frontend-gym-web** | SPA React + Vite → **estáticos** en `dist/` | `gym.<dominio>` (HTTPS) | idem |
| **frontend-admin** | SPA React + Vite → **estáticos** en `dist/` | `admin.<dominio>` (HTTPS) | idem — + restricción de acceso a nivel de infra (recomendado) |
| **Base de datos** | MySQL **8+** / MariaDB **10.6+** | — | Gestionada (PlanetScale, RDS, Railway MySQL, …) o en el mismo VPS. **SQLite no sirve** (columna generada en `gym_assignments`). |

No hay Docker, colas, workers, Redis ni websockets. **No los añadas.** Nada
encola jobs; `QUEUE_CONNECTION`/`CACHE_STORE`/`SESSION_DRIVER` en `database`
funcionan con las tablas que ya crean las migraciones y no requieren proceso
aparte.

**HTTPS obligatorio** en los 5 subdominios (`api.` / `app.` / `coach.` /
`gym.` / `admin.`) (Let's Encrypt / el proveedor). `APP_URL` del backend debe
ser `https://…`. Redirección `http → https` en el host. Si el backend va tras un proxy que termina TLS, confía en
`X-Forwarded-Proto` (config del proxy o `$middleware->trustProxies(at: '*')`
— fuera de alcance de este runbook si el host ya lo hace).

---

## Requisitos

- **Backend host**: PHP **8.2+** con extensiones estándar de Laravel
  (`pdo_mysql`, `mbstring`, `openssl`, `tokenizer`, `xml`, `ctype`, `json`,
  `bcmath`, `fileinfo`, `curl`), Composer **2**.
- **DB**: MySQL **8+** / MariaDB **10.6+**, una base de datos **vacía** +
  usuario con permisos (`ALL` sobre esa BD).
- **Build de los frontends**: Node **20+** (solo para `npm ci && npm run build`;
  el runtime es estático).

---

## 1. Backend

### 1.1 Variables de entorno de producción

`backend/.env` (git-ignored — se crea en el host). Base:

```dotenv
APP_NAME=BIAFYT
APP_ENV=production
APP_DEBUG=false
APP_URL=https://api.<dominio>                # HTTPS, URL pública del backend
APP_KEY=                                     # generar: php artisan key:generate --show

APP_LOCALE=es
APP_FALLBACK_LOCALE=es

LOG_LEVEL=error
LOG_CHANNEL=stack                            # o `stderr` si el host agrega logs de STDERR

DB_CONNECTION=mysql
DB_HOST=<host-db>
DB_PORT=3306
DB_DATABASE=<nombre-db>
DB_USERNAME=<usuario-db>
DB_PASSWORD=<password-db>

SESSION_DRIVER=database
CACHE_STORE=database
QUEUE_CONNECTION=database
BROADCAST_CONNECTION=log
FILESYSTEM_DISK=local
MAIL_MAILER=log                              # el MVP no envía correos
```

Notas:
- **`APP_DEBUG=false`** es obligatorio (en local está en `true`: expone stack
  traces/SQL).
- **`APP_KEY` NUEVA**: `php artisan key:generate --show` en el host. Nunca
  reutilizar la de local.
- No hace falta `SANCTUM_STATEFUL_DOMAINS` ni `SESSION_DOMAIN`: la auth es
  100 % por token en `Authorization: Bearer`, sin cookies.
- **CORS y caducidad de tokens se dejan como están** (decisión de Fase 2):
  `allowed_origins: ['*']` (aceptable con Bearer, sin cookies) y tokens Sanctum
  `expiration: null`. Endurecer ambos es trabajo posterior.
- **Hardening F1/F2 ya está en el código** (`bootstrap/app.php` +
  `AppServiceProvider`), no requiere variables de entorno:
  - **F1** — rate limit del grupo `api`: **120 req/min** por usuario o IP
    (limiter con nombre `api`). El throttle estricto de `auth/register|login`
    (**6/min**) se mantiene aparte.
  - **F2** — toda respuesta de error se sirve como JSON aunque el cliente no
    mande `Accept: application/json`; un guest a un endpoint protegido recibe
    **401 JSON**, nunca un redirect ni un 500.

### 1.2 Comandos de despliegue (cada release)

```bash
cd backend
composer install --no-dev --optimize-autoloader
php artisan migrate --force          # aplica las 24 migraciones en la DB vacía
php artisan config:cache             # verificado: cachea sin error
php artisan route:cache              # verificado: cachea sin error
php artisan view:cache
# opcional: php artisan optimize
```

Servir `backend/public/` como document root (nginx/apache) o el comando del
PaaS. Health check del proceso: **`GET /up`** → 200.

**PASS/FAIL:** `php artisan about` → `Environment = production`,
`Debug Mode = OFF`, `Database = mysql`. `php artisan migrate:status` → **24
`Ran`, 0 `Pending`**.

### 1.3 Seed del catálogo de ejercicios

`ExerciseSeeder` (22 ejercicios, 1:1 con `frontend-usuario/src/data/exercises.js`)
se ejecuta **posteriormente** al arranque (no bloquea nada):

```bash
php artisan db:seed --class=ExerciseSeeder --force
```

**PROHIBIDO en producción: `php artisan db:seed` "pelado"** (sin `--class`).
`DatabaseSeeder` llama además a `ExerciseSeeder`, pero **fuera de producción**
también crea la cuenta de prueba `test@example.com`. El fix F3 hace que
`DatabaseSeeder` **omita** ese usuario cuando `APP_ENV=production`, pero la
regla operativa sigue en pie: **usa siempre `--class=ExerciseSeeder`**.

Verificación: `SELECT COUNT(*) FROM exercises;` → **22**.
`SELECT COUNT(*) FROM users WHERE email = 'test@example.com';` → **0**.

Hasta que se ejecute el seed, `GET /api/v1/exercises` devuelve `[]` y el
frontend cae a `data/exercises.js` (validación atómica). No hay seeders de
gyms/comunidad y no se necesitan.

### 1.4 CORS (sin cambios — referencia)

Sin `config/cors.php` publicado, Laravel aplica su default: `paths: ['api/*']`,
`allowed_origins: ['*']`, `allowed_methods: ['*']`, `allowed_headers: ['*']`,
`supports_credentials: false`. **Funciona tal cual** (token en header, sin
cookies). Restringir el origen a los 4 subdominios de frontend (`app.` /
`coach.` / `gym.` / `admin.`) es endurecimiento **opcional** post-MVP.

---

## 2. Bootstrap: primer BIAFYT Admin + primer Gym / gym_admin

### 2.0 Primer BIAFYT Admin (autoridad de plataforma)

La autoridad de plataforma es el booleano `users.is_platform_admin`
(**separado** de los roles de `gym_assignments`). No hay endpoint ni UI para
concederla — solo el comando de ops (slice D-GYM-ONBOARDING):

**Precondición:** el usuario que será BIAFYT Admin **ya debe estar
registrado** (vía `admin.<dominio>`, cualquier otra app, o
`POST /api/v1/auth/register`).

```bash
cd backend
php artisan BIAFYT:grant-platform-admin admin-BIAFYT@<dominio>
# quitar el acceso:
php artisan BIAFYT:grant-platform-admin admin-BIAFYT@<dominio> --revoke
```

- Idempotente; falla (exit 1) si el email no corresponde a un usuario
  registrado.
- Verificación: `SELECT is_platform_admin FROM users WHERE email = '…';` → `1`.
  O: login en `admin.<dominio>` → ve el panel (si no, "Sin acceso").

Con esto, los gimnasios se pueden dar de alta por el **flujo de onboarding**
(usuario solicita desde `app.<dominio>` → el BIAFYT Admin aprueba desde
`admin.<dominio>` → se crea `Gym` + sede principal + `gym_admin`,
atómicamente). La creación directa de §2.1 sigue disponible como bootstrap
alternativo o para pruebas.

### 2.1 Primer Gym / Branch / gym_admin (creación directa)

No hay endpoint para conceder `gym_admin` directamente (decisiones D-GYM-3 /
D-GYM-8; el onboarding de §2.0 es el camino de producto). El bootstrap directo
es una operación **manual** en el host, hecha reproducible por el comando F4.

**Precondición:** el usuario que será `gym_admin` **ya debe estar registrado**
(vía la app o `POST /api/v1/auth/register`).

**Opción recomendada — comando artisan (F4, idempotente):**

```bash
cd backend
php artisan BIAFYT:grant-gym-admin admin@<gym>.example "KAIROS GYM" --branch="Norte"
# gym-wide (sin sede):
php artisan BIAFYT:grant-gym-admin admin@<gym>.example "KAIROS GYM"
```

- Crea el `Gym` y la `Branch` si no existen; crea o **reactiva** el
  `GymAssignment(role=gym_admin, status=active)`.
- Falla (exit 1) si el email no corresponde a un usuario registrado.
- Ejecutarlo dos veces no duplica nada.

**Opción B — `tinker`** (si no se quiere usar el comando):

```bash
php artisan tinker
>>> $gym = App\Models\Gym::firstOrCreate(['name' => 'KAIROS GYM']);
>>> $branch = App\Models\Branch::firstOrCreate(['gym_id' => $gym->id, 'name' => 'Norte']);
>>> $user = App\Models\User::where('email', 'admin@kairos.example')->firstOrFail();
>>> App\Models\GymAssignment::firstOrCreate(
...   ['user_id' => $user->id, 'gym_id' => $gym->id, 'branch_id' => null, 'role' => 'gym_admin'],
...   ['status' => 'active']
... );
```

Verificación:
`SELECT role, status FROM gym_assignments WHERE user_id = <id>;` → `gym_admin | active`.

El rol `coach` de `frontend-couch` se concede después **desde `gym.<dominio>`**
(el `gym_admin` da de alta al coach por email) o, si se quiere probar antes de
tener un gym_admin, a mano con el mismo patrón (`role => 'coach'`, con
`branch_id` o gym-wide).

---

## 3. Frontends (los 4)

Mismo procedimiento para las cuatro apps web. Node 20+.

### 3.1 Configurar la URL de la API

Cada app: un `.env` propio (git-ignored, se crea por entorno):

```dotenv
# frontend-usuario/.env, frontend-couch/.env, frontend-gym-web/.env, frontend-admin/.env
VITE_API_BASE_URL=https://api.<dominio>/api/v1
```

Debe ser **absoluta** e incluir `/api/v1`. La URL queda **horneada** en el
bundle → cambiarla exige **rebuild**. (Los 4 `.env.example` ya documentan este
formato.)

### 3.2 Build

```bash
cd <app>          # frontend-usuario | frontend-couch | frontend-gym-web | frontend-admin
npm ci
npm run build     # → <app>/dist/
```

- `npm ci` es suficiente (los `package-lock.json` están committeados y son
  válidos, incluido el de `frontend-admin`). `--legacy-peer-deps` solo hizo
  falta una vez para *generar* cada lockfile (bug npm 10.9.4 con peers de
  vitest); no se usa en deploy.
- Verificación por app: `dist/index.html` + `dist/assets/` generados, `npm run
  build` exit 0.

### 3.3 Servir `dist/`

- Sin `base` en `vite.config.js` → estáticos desde la raíz del subdominio (los
  4).
- Son SPAs sin router de servidor: **configurar fallback a `index.html`** para
  cualquier ruta (Netlify/Vercel/Cloudflare Pages lo hacen solos; en nginx:
  `try_files $uri $uri/ /index.html;`).
- **PASS/FAIL por app:** `curl -sI https://<sub>.<dominio>/` → 200; `curl -s
  https://<sub>.<dominio>/ruta-que-no-existe` → 200 sirviendo `index.html`.
- `admin.<dominio>`: además de la seguridad del backend, aplicar la
  restricción de acceso de infra elegida (IP allowlist / Basic Auth / red
  privada) y comprobar que un cliente no autorizado no llega ni al `index.html`.

### 3.4 Nativo (Android/iOS) — FUERA de la Fase 2

Fase 2 es **web-only**. `frontend-usuario/android/` está en el repo pero no se
empaqueta. `frontend-gym` (móvil) queda para la Fase 5.

---

## 4. Verificación post-deploy (smoke test)

### 4.1 Backend — humo básico

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://api.<dominio>/up                # 200
curl -s -o /dev/null -w "%{http_code}\n" https://api.<dominio>/api/v1/exercises   # 200
# F2: guest a endpoint protegido SIN cabecera Accept → 401 JSON (nunca 500/redirect)
curl -s -H 'Accept: text/html' -o /dev/null -w "%{http_code}\n" https://api.<dominio>/api/v1/profile   # 401
# F1: cabecera de rate limit presente
curl -s -D - -o /dev/null https://api.<dominio>/api/v1/exercises | grep -i x-ratelimit-limit           # 120
# Onboarding: un usuario normal NO ve la superficie admin
curl -s -H 'Accept: application/json' -o /dev/null -w "%{http_code}\n" \
  -H "Authorization: Bearer <token-de-usuario-normal>" \
  https://api.<dominio>/api/v1/admin/gym-registration-requests                                          # 404
```

### 4.2 Lazo end-to-end (Onboarding → Gym → Coach → Cliente)

Ejecutar el smoke test completo de **`docs/PRODUCTION_HARDENING_DISCOVERY.md`
§6, pasos 0–34** contra `https://api.<dominio>`. Resumen:

0. Bootstrap (§2.0): registrar el usuario S y `BIAFYT:grant-platform-admin`
   S. Registrar A (dueño del gym), B (coach), C (atleta), D (outsider) vía
   `auth/register`.
1. **Onboarding:** A: `POST /me/gym-registration-request {gym_name:"KAIROS
   GYM", branch_name:"Norte"}` → 201 `pending`. Segundo intento → **422** (un
   solo `pending`). La respuesta **no** trae `user_id` ni revisor ni emails.
2. D (usuario normal): `GET /admin/gym-registration-requests` → **404** (toda
   la superficie admin). S: `GET /admin/gym-registration-requests?status=pending`
   → contiene la solicitud de A, con `applicant:{id,name,email}`.
3. S: `POST /admin/gym-registration-requests/<id>/approve` → 200. Se crea
   `Gym` KAIROS + `Branch` Norte + `GymAssignment(A, gym_admin, active)`.
   Repetir el approve → 200 **idempotente**, mismo `gym.id`, sin duplicar.
4. A (Gym Web): `GET /me/gym-assignments` → ve KAIROS como `gym_admin`. Lookup
   B/C por email → `{id,name}` (**sin `email`**). Concede `coach` a B y
   `member` a C (con branch).
5. B (Coach App): solicita a C. C acepta.
6. C (Cliente): completa perfil, registra actividad, hace check-in.
7. B: `GET /me/coach/athletes/<C>` → snapshot (profile/actividad/racha/puntos,
   **sin `email`**). Crea una nota.
8. A: `GET /me/gym/<gym>/members` → contiene a C. `GET .../coaches` → contiene
   a B. `GET .../members/<C>` → mismo snapshot.
9. A: `DELETE /me/gym/<gym>/assignments/<member-assignment de C>` → 204.
   `GET .../members/<C>` → **404** (Gym pierde acceso). C ya no está en la
   lista.
10. B: `GET /me/coach/athletes/<C>` → **200** (la relación coach↔atleta NO se
    tocó al revocar la membresía).
11. Anti-IDOR: sin token → **401**; D (outsider) a listados/detalle → **404**;
    `role=gym_admin`/`staff` en un alta → **422**; assignment de otro gym →
    **404**; A a `/me/gym/<otro-gym>/members` → **404** (administra SOLO su
    gym).
12. Persistencia: re-login de A, repetir paso 8 → los datos siguen (MySQL real).

### 4.3 Frontends (navegador)

- `https://admin.<dominio>` → login (usuario S `is_platform_admin`) →
  Solicitudes → abre la de A → **Aprobar**. Un usuario sin
  `is_platform_admin` ve "Sin acceso".
- `https://app.<dominio>` → registro → onboarding → Home → check-in →
  entrenar → ver puntos → reclamar reto → canjear premio → historial en
  Perfil → cerrar sesión → volver a entrar → datos conservados. Ajustes →
  "Registrar mi gimnasio" → enviar solicitud → tras la aprobación de S, la
  pantalla muestra "Aprobada".
- `https://coach.<dominio>` → login (usuario B con rol coach) → solicitar a C
  por ID → tras aceptar, abrir el detalle de C, dejar una nota.
- `https://gym.<dominio>` → login (usuario A `gym_admin`) → Espacio → alta por
  email → detalle de miembro → revocar. Un usuario sin `gym_admin` activo ve
  "Sin acceso de Gym".

### 4.4 Checklist de cierre

- [ ] `APP_DEBUG=false`, `APP_ENV=production` (`php artisan about`)
- [ ] `APP_KEY` nueva (≠ local)
- [ ] Todo sobre **HTTPS**; `http → https` redirige
- [ ] `php artisan migrate:status` → **24 `Ran`**
- [ ] `ExerciseSeeder` ejecutado (`COUNT(exercises) = 22`) **sin** `db:seed`
      pelado (`test@example.com` ausente)
- [ ] 1 BIAFYT Admin bootstrapeado (`BIAFYT:grant-platform-admin`) y
      verificado en BD (`is_platform_admin = 1`)
- [ ] 1 `gym_admin` bootstrapeado (por onboarding o `grant-gym-admin`) y
      verificado en BD
- [ ] `/up`, `/api/v1/exercises` → 200; guest a `/api/v1/profile` sin Accept →
      **401 JSON**; `X-RateLimit-Limit: 120` presente; usuario normal a
      `/api/v1/admin/*` → **404**
- [ ] `app.` / `coach.` / `gym.` / `admin.` → 200, **fallback SPA verificado**
      (recarga en ruta profunda → 200) en los 4
- [ ] `admin.<dominio>` con la restricción de acceso de infra aplicada
- [ ] Smoke test §4.2 (pasos 0–34) en verde
- [ ] `<app>/.env` **no** commiteado (ya en `.gitignore`)
- [ ] Backup inicial de MySQL guardado + backup recurrente programado (§5)

---

## 5. Backups mínimos de MySQL

Antes del primer registro real: un backup, y a partir de ahí uno recurrente.

- **BD gestionada** (RDS / PlanetScale / Railway / …): activar los snapshots
  automáticos del proveedor (diarios, retención ≥ 7 días). Verificar que están
  ON.
- **MySQL en el VPS**: `mysqldump` diario a almacenamiento **externo** al host:

  ```bash
  # cron diario, p.ej. 03:15
  mysqldump --single-transaction --quick --no-tablespaces \
    -u <usuario-db> -p'<password>' <nombre-db> \
    | gzip > /backups/BIAFYT_$(date +\%F).sql.gz
  # + copiar /backups a S3/almacenamiento remoto y rotar (mantener ~14 días)
  ```

- **Backup manual antes de cada release** que toque migraciones:
  `mysqldump ... > BIAFYT_pre_release_$(date +%F_%H%M).sql.gz`.
- **Restauración probada al menos una vez**: `gunzip -c dump.sql.gz | mysql -u
  <usuario> -p <nombre-db>`.

---

## 6. Rollback

| Escenario | Acción | Verifica |
|---|---|---|
| Backend roto tras el deploy | Volver al release anterior (symlink/tag) → `php artisan config:clear && php artisan config:cache` con el `.env` previo → reiniciar php-fpm/proceso | `GET /up` → 200; `php artisan about` |
| Migración mala | `php artisan migrate:rollback --step=1 --force` **solo si es reversible y no hubo escrituras nuevas**; si no → restaurar el `mysqldump` pre-release (§5) | `php artisan migrate:status` coherente; smoke §4.1 |
| Frontend roto | Re-desplegar el `dist/` anterior (guardar el `dist/` previo o re-buildear del tag anterior; los estáticos son inmutables por build) | `curl -sI https://<sub>.<dominio>/` → 200 |
| `.env` mal | Corregir la clave → `php artisan config:cache` → reiniciar | `php artisan about` |

**Criterio de rollback:** cualquier ítem del checklist §4.4 en FAIL que no se
resuelva en < 15 min → rollback + post-mortem.

---

## Bloqueos operacionales conocidos

- **No hay host, credenciales ni dominio** provistos → el deploy real lo ejecuta
  alguien con acceso a la infraestructura, siguiendo este runbook +
  `docs/PRODUCTION_HARDENING_DISCOVERY.md`. Decisiones de infra abiertas:
  proveedor del backend, proveedor de la BD, dominio, hosting estático.
- El backend en local corre contra una BD MySQL local (`BIAFYT`); las
  credenciales viven solo en `backend/.env` (git-ignored), nunca en el repo.
- **Sin recuperación de contraseña ni verificación de email** (`mail = log`).
  Decisión de Fase 2, aceptado para el MVP.
- La app **Cliente** aún selecciona gimnasio contra datos **mock**
  (`data/gyms.js`) y NO crea un `GymAssignment` real — la pertenencia real de un
  atleta a un gym la da el `gym_admin` por email (§4.2). Documentado en
  `BIAFYT_BUSINESS_CORE.md` §31.
- Ranking, Duelos, Comunidad: datos **mock** en el frontend (no bloquean el
  MVP).
- `frontend-gym` (móvil/Capacitor): **fuera de alcance**, no se despliega.
- **`frontend-admin` es interno.** Su seguridad la impone el backend (404 en
  `/admin/*` para quien no sea `is_platform_admin`); la restricción de acceso
  a nivel de infra (IP allowlist / Basic Auth / red privada) es
  **recomendada, no bloqueante**. El primer BIAFYT Admin se concede con
  `BIAFYT:grant-platform-admin` (§2.0) — nunca por endpoint/UI.
- **Sin notificación al solicitante** de una solicitud de registro de gimnasio:
  el usuario consulta su propio estado (pull-only). Aceptado para el MVP.

---

## Historial de preparación

- **Etapa 0** (prep del repo): `DEPLOY.md` ampliado, `yarn.lock` eliminado,
  `CLAUDE.md` alineados.
- **Coach MVP** (`aed5490`) + **Gym MVP** (`91a2653`): lazo funcional Cliente →
  Coach → Gym. En `main` (rama `feat/coach-gym-mvp` mergeada en `80e0057`).
- **Hardening F1–F4** (`93b0271`): rate limit global (`api` limiter 120/min),
  respuestas de error siempre JSON (401 en vez de 500 sin `Accept`),
  `DatabaseSeeder` production-safe, comando `BIAFYT:grant-gym-admin`. Tests:
  `ProductionHardeningTest` + `GrantGymAdminCommandTest`. **F5** (mapear el
  `user` de `AuthController`, alinear `.env.example`) queda pendiente,
  opcional/higiene.
- **Gym Onboarding + BIAFYT Admin** (slice D-GYM-ONBOARDING, `e1be4f6`,
  mergeado a `main` en `80e0057`): usuario solicita registrar su gym →
  BIAFYT Admin aprueba (app web nueva `frontend-admin/` → `admin.<dominio>`)
  → se crea Gym + sede + `gym_admin`. +2 migraciones (**24 en total**), modelo
  `GymRegistrationRequest`, flag `users.is_platform_admin`, comando
  `BIAFYT:grant-platform-admin`, 28 tests nuevos. `frontend-usuario` añade
  la pantalla "Registrar mi gimnasio" (flujos Cliente/Coach intactos).
- Detalle completo, riesgos y criterio de "MVP Production CLOSED":
  **`docs/PRODUCTION_HARDENING_DISCOVERY.md`**.
