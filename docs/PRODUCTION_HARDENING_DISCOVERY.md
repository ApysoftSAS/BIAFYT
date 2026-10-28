# BIAFYT — MVP Production / Hardening · Discovery

> **Tipo:** documento de discovery técnico para handoff a infraestructura.
> **No es un runbook ejecutable** — el runbook operativo es `DEPLOY.md`.
> Este documento es el **discovery original** (fotografía del estado en la
> fecha de abajo). Las secciones "FIX BEFORE DEPLOY" describen el estado en
> ese momento; ver el bloque **ACTUALIZACIÓN** justo debajo para el estado
> actual.

| Campo | Valor |
|---|---|
| Fecha del discovery | 2026-09-06 |
| Rama | `feat/coach-gym-mvp` (partió de `main` en `57ed6b2`); **mergeada a `main` en `80e0057`** (`--no-ff`) |
| Commits del lazo funcional | Coach MVP `aed5490` · Gym MVP `91a2653` · Hardening F1–F4 `93b0271` — todos en `main` |
| Slice posterior | Gym Onboarding + BIAFYT Admin (D-GYM-ONBOARDING) — **commit `e1be4f6`, mergeado a `main` en `80e0057`** |
| Backend | Laravel 12 + Sanctum 4, PHP `^8.2` |
| Frontends web | `frontend-usuario`, `frontend-couch`, `frontend-gym-web`, `frontend-admin` — lint/test/build verdes |
| E2E HTTP Onboarding + Coach + Gym | verde (cubierto por la suite backend: 452 tests) |
| **Estado del gate global (hoy)** | 🟡 **BLOCKED (infra)** — F1–F4 implementados; onboarding implementado; F5 opcional pendiente |

---

## ACTUALIZACIÓN (post-discovery)

Estado actual del repo — prevalece sobre las secciones "FIX BEFORE DEPLOY" de
abajo. Detalle en `PROJECT_STATE.md` (`## ESTADO MVP` / `FASE: 2`) y en
`DEPLOY.md`.

- **F1 — IMPLEMENTADO.** Rate limit del grupo `api`: limiter con nombre `api`
  en `AppServiceProvider::boot()` (`Limit::perMinute(120)->by(user id o IP)`)
  + `$middleware->throttleApi()` en `bootstrap/app.php`. Al ser un limiter con
  nombre **no comparte contador** con el `throttle:6,1` de `auth/*` (evita el
  problema de contador compartido de un `throttle:120,1` sin nombre).
- **F2 — IMPLEMENTADO.** En `bootstrap/app.php`:
  `$exceptions->shouldRenderJsonWhen(fn () => true)` **+**
  `$middleware->redirectGuestsTo(fn () => null)`. Lo segundo es necesario: el
  redirect de invitado por defecto apunta la `Authenticate` middleware a
  `route('login')`, que se resuelve **eagerly** para un guest sin
  `expectsJson()` → `RouteNotFoundException` (500) antes de construir la
  `AuthenticationException`. Verificado contra `php -S public/index.php`
  (production-like): guest a `/api/v1/profile` sin `Accept` → **401 JSON**.
- **F3 — IMPLEMENTADO.** `DatabaseSeeder::run()` omite `test@example.com`
  cuando `app()->environment('production')`; `ExerciseSeeder` siempre corre.
- **F4 — IMPLEMENTADO.** `app/Console/Commands/GrantGymAdmin.php` →
  `php artisan BIAFYT:grant-gym-admin {email} {gym-name} {--branch=}`,
  idempotente, ops-only (no endpoint).
- **F5 — NO implementado** (opcional / higiene): `AuthController` devuelve el
  modelo `User` crudo (sin fuga cross-user); `backend/.env.example` es el
  stock de Laravel. **No bloquea producción** (revisado de nuevo en el cierre
  de Fase 2: los campos son del propio caller, sin fuga cross-user; ningún
  endpoint nuevo del onboarding lo cambia).
- **Gym Onboarding + BIAFYT Admin (D-GYM-ONBOARDING) — IMPLEMENTADO**
  (commit `e1be4f6`, mergeado a `main` en `80e0057`). Alta comercial de
  gimnasio: usuario solicita
  (`POST /me/gym-registration-request`) → un BIAFYT Admin
  (`users.is_platform_admin`, **separado** de `gym_assignments`, concedido
  solo por `BIAFYT:grant-platform-admin`) aprueba/rechaza desde una app web
  nueva `frontend-admin/` (`admin.<dominio>`) → aprobar crea, atómica e
  idempotentemente, `Gym` + `Branch` principal + `GymAssignment(gym_admin,
  active)`. Toda la superficie `/admin/*` responde **404** a quien no sea
  platform admin (no descubrible). **+2 migraciones → 24 en total.**
  `frontend-usuario` añade solo la pantalla "Registrar mi gimnasio" (flujos
  Cliente/Coach intactos). `frontend-gym-web`: **cero cambios** (ya deriva
  `gym_admin` de `/me/gym-assignments`).
- **Tests:** `ProductionHardeningTest.php` (6) + `GrantGymAdminCommandTest.php`
  (6) + del onboarding: `GymRegistrationRequestApiTest` (9),
  `Admin/GymRegistrationRequestApiTest` (13), `Admin/GymApiTest` (2),
  `GrantPlatformAdminCommandTest` (4). Suite backend **452 verdes**, `pint
  --test` verde. Los **4** frontends: lint/test/build verdes (usuario 99 /
  couch 7 / gym-web 19 / admin 8).
- **Alcance de la 1ª producción — DECIDIDO (revisado):** `backend/` (`api.`) +
  `frontend-usuario/` (`app.`) + `frontend-couch/` (`coach.`) +
  `frontend-gym-web/` (`gym.`) + **`frontend-admin/` (`admin.`)**.
  **`frontend-gym` móvil/Capacitor FUERA de alcance.** `DEPLOY.md` ya refleja
  esto. (Anula la "DECISIÓN NECESARIA" de §1.3 y el blocker #9 de §7.)
- **Lo que sigue BLOCKED = solo infraestructura / credenciales / ejecución.**

---

## Decision gate global (estado en el discovery)

### 🟡 BLOCKED (infra) + 5 FIX BEFORE DEPLOY (código, pequeños)

El código está en muy buen estado para producción. **No hay ningún blocker
de código.** Los blockers son todos de **infraestructura / credenciales /
decisión externa**. Hay **5 arreglos pequeños de hardening** recomendados
antes de exponer a Internet — ninguno cambia el alcance funcional.

- **F1–F3** son obligatorios antes de exponer la aplicación a Internet. → *hechos.*
- **F4** es recomendado. → *hecho.*
- **F5** es opcional / higiene. → *pendiente.*

---

## 1. Infraestructura

### 1.1 Lo que EXISTE (verificado en el repo)

- Backend Laravel 12 + Sanctum 4, PHP `^8.2` (local: 8.2.12), Composer 2.
  `require` mínimo (framework + sanctum + tinker) — **cero dependencias de
  infraestructura pesada** (sin Redis / Horizon / Scout / etc. reales).
- Health check `/up` configurado en `bootstrap/app.php` (`health: '/up'`) →
  200 verificado.
- `.htaccess` en `backend/public/` (Apache: pass-through de la cabecera
  `Authorization` — relevante para Bearer).
- **24 migraciones** que cubren TODAS las tablas necesarias (`users` — con la
  columna `is_platform_admin`, `sessions`, `cache`, `cache_locks`, `jobs`,
  `job_batches`, `failed_jobs`, `password_reset_tokens`,
  `personal_access_tokens`, `gym_registration_requests` + resto del dominio).
  Orden por nombre correcto (dependencias de FK respetadas).
- `config:cache` seguro: **cero `env()` fuera de `config/`** (verificado por
  grep de `app/`, `routes/`, `bootstrap/`).
- 4 `package-lock.json` committeados de los frontends de la ronda de
  hardening + el de `frontend-admin` (**5**) + los 5 `.env.example`.
- Ningún `.env` real trackeado (`backend/.gitignore` cubre `.env`,
  `.env.production`, `.env.backup`; los frontends igual).
- Ninguna URL `http://localhost` hardcodeada en código de los frontends
  (solo en comentarios). Cero `console.log` / `debugger`.

### 1.2 Lo que FALTA → BLOCKED (requiere infra / credencial / decisión externa)

| Pieza | Estado | Detalle |
|---|---|---|
| **Host backend** | ❌ BLOCKED | PHP 8.2+ con `pdo_mysql, mbstring, openssl, tokenizer, xml, ctype, json, bcmath, fileinfo, curl` + Composer 2. Proveedor sin decidir (Forge / Ploi / Railway / Render / VPS+nginx+php-fpm). |
| **MySQL 8+ / MariaDB 10.6+** | ❌ BLOCKED | Host, puerto, BD vacía, usuario con permisos. `utf8mb4` / `utf8mb4_unicode_ci` (defaults de `config/database.php`). `gym_assignments` usa una **columna generada `branch_id_norm`** + `restrictOnDelete` en `branch_id` — requiere MySQL 8 / MariaDB 10.6+ real (verificado contra MySQL 8.0.42 local). **SQLite NO sirve en producción.** |
| **`APP_KEY` de producción** | ❌ BLOCKED | Generar NUEVA en el host: `php artisan key:generate --show`. Nunca reutilizar la de local. |
| **Dominio + subdominios** | ❌ BLOCKED | Se necesitan **5**: `api.<dominio>` (backend), `app.` (frontend-usuario), `coach.` (frontend-couch), `gym.` (frontend-gym-web), `admin.` (frontend-admin). |
| **Hosting estático × 4 frontends** | ❌ BLOCKED | Netlify / Vercel / Cloudflare Pages / S3+CDN / nginx. **Cada uno necesita fallback SPA a `index.html`** — no hay `_redirects` / `vercel.json` / `netlify.toml` en el repo (Netlify / Vercel lo hacen solos; nginx necesita `try_files $uri $uri/ /index.html;`). `admin.` además: restricción de acceso de infra (IP allowlist / Basic Auth / red privada) — recomendada, no bloqueante. |
| **TLS / HTTPS** | ❌ BLOCKED | Certificados para los 5 subdominios (Let's Encrypt / el proveedor). `APP_URL` de producción debe ser `https://`. Si el backend va tras load balancer / proxy: configurar trust de `X-Forwarded-Proto` (ver §2). |
| **Ejecutor del deploy** | ❌ BLOCKED | Alguien con acceso a la infraestructura corre el runbook. |
| **Backups MySQL** | ❌ BLOCKED | Mínimo: `mysqldump` diario a almacenamiento externo, o snapshots automáticos si es BD gestionada. Sin decisión de proveedor no hay procedimiento concreto. |
| **Logs (agregación)** | ⚠️ config | `LOG_CHANNEL=stack` → `single` (fichero `storage/logs/laravel.log`). Para PaaS / contenedor conviene `LOG_CHANNEL=stderr` (el canal ya existe en `config/logging.php`). Decisión del host. |

### 1.3 Alcance de la primera producción — DECIDIDO

*(En el discovery esto era una decisión pendiente; ya está tomada. Revisado en
el cierre de Fase 2 para incluir `frontend-admin`.)*

La 1ª producción incluye **5 artefactos**:
`backend/` (`api.<dominio>`) + `frontend-usuario/` (`app.`) +
`frontend-couch/` (`coach.`) + `frontend-gym-web/` (`gym.`) +
`frontend-admin/` (`admin.`). Cada frontend: subdominio propio, `.env` propio
(`VITE_API_BASE_URL`), build, host estático con **fallback SPA**. `DEPLOY.md`
ya está reescrito a este alcance.

`frontend-admin/` es interno (dashboard de plataforma, no superficie de
cliente): su seguridad la impone el backend (404 en `/admin/*` para quien no
sea `is_platform_admin`); la restricción de acceso a nivel de infra es
recomendada, no bloqueante.

`frontend-gym` (móvil / Capacitor) **NO entra** (decisión D-GYM-6).

---

## 2. Auditoría de producción del backend

| Área | Hallazgo | Veredicto |
|---|---|---|
| **`APP_DEBUG`** | Local `true`. `DEPLOY.md` exige `false` en prod. Sin `env()` fuera de config → `config:cache` seguro. | ✅ (documentado; verificar en checklist) |
| **Rate limiting** | En el discovery: solo `throttle:6,1` en `auth/register`+`login`; `/me/*` sin límite. | ✅ **RESUELTO (F1)** — grupo `api` con limiter **con nombre** `api` (`AppServiceProvider::boot()`, 120/min por user o IP) + `throttleApi()` en `bootstrap/app.php`. `auth/*` conserva su `6,1` sin colisión de contador. `X-RateLimit-Limit: 120` verificado. |
| **Petición sin `Accept: application/json` y sin token → 500** | En el discovery: `Authenticate` resuelve `route('login')` eagerly → `RouteNotFoundException` → 500 (sin fuga de stack). Los 4 clientes frontend siempre mandan `Accept: application/json` → 401 correcto. | ✅ **RESUELTO (F2)** — `bootstrap/app.php`: `shouldRenderJsonWhen(fn () => true)` **+** `redirectGuestsTo(fn () => null)`. Guest sin `Accept` → **401 JSON** (verificado contra `php -S public/index.php`). |
| **CORS** | Sin `config/cors.php` → default Laravel: `paths:['api/*']`, `allowed_origins:['*']`, `methods:['*']`, `headers:['*']`, `supports_credentials:false`. Decisión de Fase 2: mantener `*` (aceptable con Bearer, sin cookies). | ✅ OK por decisión. Opcional: restringir `allowed_origins` a los subdominios de los frontends (`config:publish cors` + editar). **OUT OF SCOPE salvo que se pida.** |
| **Sanctum** | `HasApiTokens` en `User`; `auth:sanctum` en todas las rutas protegidas. Sin `config/sanctum.php` publicado → defaults (expiración `null` = tokens sin caducidad — decisión de Fase 2). **No** se necesita `SANCTUM_STATEFUL_DOMAINS` / `SESSION_DOMAIN` (auth 100% Bearer, sin cookies / CSRF). 414 tests + E2E real lo prueban. | ✅ OK por decisión (expiración `null` = deuda conocida aceptada). |
| **Exposición de emails / IDs cross-user** | `CoachAthleteRelationshipController`, `CoachAthleteController`, `GymAdminController`, `AthleteSnapshot` → todos mapean `{id,name}` explícito y `profile` con campos allowlist. **Cero fuga cross-user** (cubierto por tests `test_*_does_not_expose_*` + E2E "email leaked? False"). Onboarding (D-GYM-ONBOARDING): el lado usuario (`GymRegistrationRequestController`) **nunca** devuelve `user_id`, revisor ni emails; el lado admin (`Admin\GymRegistrationRequestController`) sí devuelve `applicant:{id,name,email}` — **por diseño**, para que el BIAFYT Admin haga due diligence, y solo tras el gate `is_platform_admin`. `Admin\GymController` no devuelve datos personales. Cubierto por 24 tests nuevos. | ✅ |
| **Superficie `/admin/*` (BIAFYT Admin)** | Autoridad de plataforma = booleano `users.is_platform_admin`, **separado** de `gym_assignments`, `cast` a boolean, **no** en `$fillable` (no se puede setear por mass-assignment). Concedido solo por `BIAFYT:grant-platform-admin` (ops, idempotente, sin endpoint). Cada acción `/admin/*` hace `abort_unless((bool) $user->is_platform_admin, 404)` — **404, no 403**: la superficie no es descubrible. `POST /me/gym-registration-request` fuerza `status='pending'` e ignora `status`/`user_id`/`gym_id` del body → un usuario **no** puede autoconcederse `gym_admin` manipulando la solicitud. Aprobar es transaccional + `lockForUpdate` + idempotente. Rate limiter `api` (120/min) aplica igual. | ✅ |
| **`AuthController` devuelve el modelo `User` crudo** | `register` / `login` / `me` responden `user` = modelo completo → incluye `email` (del propio usuario — OK), `email_verified_at`, `created_at`, `updated_at`, y ahora `is_platform_admin` (booleano del propio caller — necesario para `frontend-admin`). `$hidden` solo oculta `password` / `remember_token`. **Re-revisado en el cierre de Fase 2: no hay fuga cross-user** (todo es del caller). | 🟡 **FIX opcional (F5)** — mapear a `{id,name,email,is_platform_admin}`. Riesgo bajo, higiene. **No bloquea producción.** |
| **Validación de inputs** | `StoreProgramRequest` / `StoreWorkoutRequest` / `StoreActivityRequest` (FormRequests). El resto valida inline con reglas explícitas (`exists:`, `in:`, `date_format:`, `max:`, `email`). `GymAdminController` valida `role in:member,coach`, `branch_id exists`, cross-field (branch↔gym). | ✅ |
| **Mass assignment** | `User::$fillable = ['name','email','password']` — `register` hace `User::create($validated)` con exactamente esos 3. Todos los modelos de dominio tienen `$fillable` acotado; los controllers nunca pasan `$request->all()`. `user_id` / `gym_id` / `coach_user_id` siempre del token o la ruta, nunca del body (verificado por tests de "spoofing"). | ✅ |
| **SQL / debug logging** | Sin `DB::listen`, sin `\DB::enableQueryLog`, sin Telescope / Debugbar en `require`. `LOG_LEVEL` prod = `error` (DEPLOY.md). | ✅ |
| **Filesystem / storage** | `FILESYSTEM_DISK=local`. **Ningún endpoint de subida de ficheros.** Solo se escribe `storage/logs`, `storage/framework/{cache,sessions,views}`, `bootstrap/cache`. Estándar. | ✅ (permisos de escritura en el host) |
| **Manejo de excepciones** | `withExceptions` vacío → comportamiento por defecto. Conflictos de `position` / `set_number` / idempotencia → 422 limpio (patrón `->exists()` + `catch(QueryException)`). El resto de excepciones no anticipadas → 500 genérico (sin stack con `APP_DEBUG=false`). | ✅ salvo el punto del `Accept` header (F2). |
| **Rutas públicas** | Solo `GET /api/v1/exercises` y `GET /api/v1/gyms` (catálogos, sin datos personales) + `POST auth/register\|login` (throttled). `GET /` sirve `welcome` (cosmético). | ✅ |
| **Endpoints `/me/*` + anti-IDOR Coach / Gym** | Todos `auth:sanctum`, scoping siempre por `$request->user()->id`. Coach: gate `CoachAthleteRelationship::activeBetween` → 404. Gym: gate `GymAdminController::assertGymAdmin` (query inline `role=gym_admin, status=active, gym_id={ruta}`) → 404. Params numéricos-only (`whereNumber`) en `me/gym/{gym}/*`. **61 tests anti-IDOR** (19 Coach + 42 Gym) + E2E cross-gym / cross-user. | ✅ |
| **401 / 404 en producción** | 401 (con Accept JSON) y 404 (recurso ajeno / gate) verificados en E2E. 404 nunca revela existencia. | ✅ |
| **`DatabaseSeeder`** | `run()` crea `User 'Test User' <test@example.com>` **y** llama a `ExerciseSeeder`. Si alguien corre `php artisan db:seed` (sin `--class`) en prod → **crea una cuenta de prueba real en la BD de producción**. | 🔴 **FIX BEFORE DEPLOY (F3)** — guardar `DatabaseSeeder` contra prod (`if (app()->isProduction()) { $this->call(ExerciseSeeder::class); return; }`, ~3 líneas) y/o regla dura en el runbook: **solo `php artisan db:seed --class=ExerciseSeeder --force`**, jamás `db:seed` pelado. |
| **HTTPS / proxy** | Sin `URL::forceScheme('https')` ni `trustProxies` custom (L12 default). Tras un proxy que termina TLS, si `APP_URL=https` y el proxy manda `X-Forwarded-Proto: https` funciona; si no, Laravel puede generar URLs `http`. La API casi no genera URLs absolutas (no hay verificación de email, no hay reset). | 🟡 **FIX opcional / infra** — según el host, `$middleware->trustProxies(at: '*')` o config del proxy. Impacto real bajo para esta API. |
| **`.env.example`** | Es el **stock de Laravel** (`APP_NAME=Laravel`, `DB_CONNECTION=sqlite`, `APP_DEBUG=true`). Los valores reales de prod están en `DEPLOY.md §1.1`. | 🟡 **FIX opcional (F5)** — alinear `.env.example` con el shape real del proyecto ayuda a quien redacte el `.env` de prod. |

---

## 3. Auditoría de los frontends

> **`frontend-admin` (añadido en el cierre de Fase 2):** mismo stack y patrón
> que `frontend-gym-web` (React 19 + Vite, **sin Capacitor**, `app.config.json`
> con `appId` `com.apysoft.gymprofit.admin`). `VITE_API_BASE_URL` horneada en
> el build (`.env.example` corregido: absoluta, con `/api/v1`, para prod
> `https://api.<dominio>/api/v1`). `SessionContext` deriva `isPlatformAdmin`
> **siempre** de `GET /auth/me` (`user.is_platform_admin`) — nunca de
> LocalStorage (solo persiste token + identidad); revalida al arrancar; 401 →
> `endSession()`. Sin `base` en `vite.config.js`. Sin router (screen en
> `useState`) → fallback SPA necesario. `package-lock.json` committeado →
> `npm ci` basta. Sin `console.log`, sin `localhost` hardcodeado. lint / 8
> tests / build verdes.

| Aspecto | frontend-usuario | frontend-couch | frontend-gym-web |
|---|---|---|---|
| **API base URL** | `import.meta.env.VITE_API_BASE_URL \|\| ""` — **horneada en el build**. Debe ser **absoluta** e incluir `/api/v1`. Si falta en el build → `""` → llamadas relativas al propio origen (roto para app / coach; solo tolerable para gym-web si comparte dominio con la API — no recomendado). | idem | idem (`.env.example` dice "Absoluta o relativa según el despliegue" — recomendar **absoluta** también). |
| **`vite.config.js` `base`** | sin `base` → estáticos desde la raíz del subdominio ✅ | idem ✅ | idem ✅ |
| **Token / LocalStorage** | `${appConfig.id}.state.v1` (clave por appId → distinta por app). Token en LocalStorage. Snapshot por `user.id`. | `${appId}.state.v1` (couch), solo `auth`. | `${appId}.state.v1` (gymweb), `auth`. `gym_id` **nunca** de LocalStorage (se re-deriva de `/me/gym-assignments` en cada arranque) ✅ |
| **Manejo de 401** | Token persistido revalidado contra `/auth/me` al arrancar; 401 → sesión terminada. | `runAuthed` → 401 → `endSession()`. | `runAuthed` + `loadGymAccess` → 401 → `endSession()`. |
| **Errores de red** | `fetch` falla → `ApiError({status:0})` → "No pudimos conectar con el servidor." | idem | idem |
| **Build de producción** | `npm ci && npm run build` → `dist/`. `android/` committeado pero **NO se empaqueta** (web-only). | `npm run build` → `dist/`. `npm install` documentado con `--legacy-peer-deps` (bug npm 10.9.4 con peers de vitest) — **`DEPLOY.md` dice que `npm ci` basta** (lockfile committeado) → **verificar en el deploy plan**. | idem couch. |
| **Assets** | logo `.webp` (~700 KB) + `david.png` (~1.4 MB) — grandes pero aceptables para MVP. | logo + david. | logo `.webp` (~700 KB). Bundle JS ~219 KB (gzip 68 KB). |
| **Rutas / navegación** | Sin router. `screen` en `useState`. **Sin deep-linking** (recarga → vuelve a Home / Auth). SPA fallback a `index.html` necesario igual. | idem (Home / Athletes / AthleteDetail / Profile). | idem (overview / workspace / account, `Modal` para member detail). |
| **Capacitor** | `capacitor.config.json` (`com.apysoft.gymprofit`). **No se usa en web-only.** | `capacitor.config.json` (`.couch`). No se usa. | **`app.config.json`** (`.gymweb`), **sin Capacitor** ✅ correcto. |
| **CORS / HTTPS** | Cliente manda `Accept` + `Content-Type: application/json` siempre. Sin cookies. Funciona con CORS `*`. | idem | idem |
| **Referencias `localhost`** | Solo en comentarios y `biometric.js` (nota WebAuthn requiere HTTPS / localhost). Ninguna en código ejecutable. | Solo comentario en `api.js`. | Solo comentario en `api.js`. |
| **Mocks como autoridad** | `data/gyms.js`, `data/users.js` (community / ranking), `duelEngine`, `data/coaches.js`, `data/videos.js` → **todo LocalStorage / visible**. **`selectGym` / `registerGym` NO tocan el backend** — un Cliente que "elige KAIROS" en la app **NO** queda como `GymAssignment` en backend (§31, gap conocido y aceptado). | Sin mocks (todo real: relaciones + snapshot). | Sin mocks (todo real). `Overview` / `Workspace` / `Sidebar` ya no tienen cifras de ejemplo. |
| **`console.log` / `debugger`** | Ninguno (grep). | Ninguno. | Ninguno. |

**Consecuencia para el smoke test:** el "atleta" de producción debe ser
dado de alta como `member` **por el gym_admin** (lookup por email) — no se
auto-une desde la app Cliente. Su actividad / check-in llegan al backend
por el **write-through sombra** de la app Cliente (o por llamada directa a
la API en un smoke test puro-HTTP).

---

## 4. Datos y migraciones

### 4.1 Auditoría (código real)

| Comprobación | Estado |
|---|---|
| **Orden de migraciones (24)** | ✅ `0001_01_01_*` (users / cache / jobs / sessions) → `2026_08_24_*` (tokens, profiles, gyms, branches, gym_assignments) → `2026_08_26_*` (programs→…→performances) → `2026_08_27/28_*` (coach rel, activities, point_transactions, check_ins, challenge_claims) → `2026_09_06_*` (reward_claims, coach_notes) → `2026_09_07_000001` (`users.is_platform_admin`, `ALTER`) → `2026_09_07_000002` (`gym_registration_requests`, FK a `users` y `gyms` — ambas ya creadas). Cada FK tiene su tabla padre antes. `migrate:fresh` en una BD limpia aplica en este orden. Aplicadas en la BD dev local. |
| **Foreign keys** | ✅ `cascadeOnDelete` en la mayoría (borrar User limpia su dominio). `activities.workout_id` / `workout_exercises.program_exercise_id` / `workouts.program_day_id` → `nullOnDelete` (histórico sobrevive). `workout_exercises.exercise_id` → `restrictOnDelete` (catálogo compartido). `gym_assignments.branch_id` → `restrictOnDelete` (por la columna generada — borrar un Branch con asignaciones activas falla; hay que reasignar primero). `coach_athlete_relationships` / `coach_notes` → cascade en ambos lados. |
| **Índices** | ✅ `point_transactions`: `user_id` + `(source_type, source_id)`. `gym_assignments`: `(gym_id, branch_id)`. `coach_athlete_relationships` / `coach_notes`: `(coach_user_id, athlete_user_id)`. Sin índices especulativos. |
| **UNIQUE** | ✅ `activities.workout_id` (múltiples NULL OK). `point_transactions.idempotency_key`. `check_ins (user_id, check_in_date)`. `challenge_claims (user_id, challenge_date, challenge_id)`. `reward_claims (user_id, reward_uid)`. `gym_assignments (user_id, gym_id, branch_id_norm, role)` vía columna generada `COALESCE(branch_id,0)`. `users.email`. `personal_access_tokens.token`. `gym_registration_requests`: **sin UNIQUE** — la regla "un solo `pending` por usuario" es de aplicación (mismo patrón de máquina de estados que `coach_athlete_relationships`), con índices `(user_id, status)` y `status`. |
| **Datos mínimos para producción** | Solo `ExerciseSeeder` (22 ejercicios, 1:1 con `data/exercises.js`). Se ejecuta **posteriormente** al arranque (`db:seed --class=ExerciseSeeder --force`). Hasta entonces `GET /exercises` devuelve `[]` y el frontend cae a `data/exercises.js` (validación atómica). **Sin él la app funciona.** No hay seeders de gyms / comunidad y **no se necesitan**. |
| **`db:seed` peligroso** | ✅ **RESUELTO (F3)** — `DatabaseSeeder` omite `test@example.com` en `production`. La regla operativa (`db:seed --class=ExerciseSeeder`, nunca pelado) sigue en `DEPLOY.md`. |

### 4.2 Bootstrap seguro y reproducible

#### 4.2.0 Primer BIAFYT Admin (autoridad de plataforma)

`users.is_platform_admin` es la autoridad de la superficie `/admin/*`. Se
concede **solo** por el comando de ops (D-GYM-ONBOARDING) — no hay endpoint ni
UI:

```bash
php artisan BIAFYT:grant-platform-admin admin-BIAFYT@<dominio>   # [--revoke] para quitarlo
```

Idempotente; falla (exit 1) si el email no está registrado. Verificación:
`SELECT is_platform_admin FROM users WHERE email = '…';` → `1`. Con esto, los
gimnasios entran por el **flujo de onboarding** (usuario solicita desde
`app.` → el BIAFYT Admin aprueba desde `admin.` → se crea Gym + sede +
`gym_admin`). El bootstrap directo de §4.2.1 sigue disponible para pruebas o
como alternativa.

#### 4.2.1 Primer Gym / Branch / gym_admin (creación directa)

Decisión mantenida: **manual, sin endpoint de elevación**. Dos opciones:

**Opción A — snippet `tinker` (mínimo, ya es el patrón de Coach):**

```bash
php artisan tinker
>>> $gym = App\Models\Gym::firstOrCreate(['name' => 'KAIROS GYM']);
>>> $branch = App\Models\Branch::firstOrCreate(['gym_id' => $gym->id, 'name' => 'Norte']);
>>> $user = App\Models\User::where('email', 'admin@kairos.example')->firstOrFail();  // debe existir (registrado)
>>> App\Models\GymAssignment::firstOrCreate(
...   ['user_id' => $user->id, 'gym_id' => $gym->id, 'branch_id' => null, 'role' => 'gym_admin'],
...   ['status' => 'active']
... );
```

**Opción B — comando artisan idempotente (recomendado; NO es endpoint):**
`php artisan BIAFYT:grant-gym-admin {email} {gym-name} {--branch=}`
(~30 líneas: valida que el user existe, `firstOrCreate` de Gym / Branch,
activa el `GymAssignment`). Elimina footguns de tinker en el host.

**Es un FIX opcional (F4)** — la decisión de negocio ("manual / tinker") no
lo prohíbe: un comando de ops ≠ endpoint de API ≠ elevación por usuario.

---

## 5. Deploy plan

Pasos pequeños y verificables. `<...>` = valor que aporta infraestructura.

### A. Preparación (repo — antes de tocar infra)

| Paso | Archivo / comando | Verifica | PASS / FAIL |
|---|---|---|---|
| A1 | **HECHO y en `main`:** F1–F4 (`93b0271`) + slice Onboarding (`e1be4f6`) + docs; rama `feat/coach-gym-mvp` mergeada a `main` con `--no-ff` en `80e0057`. Pendiente: `git push` a `origin` (paso B) | `git log --oneline` de `main` | HECHO — `git push` pendiente |
| A2 | `cd backend && php artisan test` | 452 tests | PASS = 0 fallos |
| A3 | `cd backend && ./vendor/bin/pint --test` | estilo | PASS = "no issues" |
| A4 | Actualizar `DEPLOY.md` (alcance = 5 artefactos incl. `frontend-admin`; bootstrap BIAFYT Admin + gym_admin; `db:seed` seguro; smoke E2E con onboarding) | revisión | PASS = runbook coherente con la decisión de alcance |
| A5 | `for d in frontend-usuario frontend-couch frontend-gym-web frontend-admin; do (cd $d && npm ci && npm run lint && npm run test && npm run build); done` | build de los 4 | PASS = `dist/` generado en los 4, 0 fallos |

### B. Infraestructura (BLOCKED — infra)

| Paso | Verifica | PASS / FAIL |
|---|---|---|
| B1 | Provisionar host PHP 8.2+ (extensiones §1), Composer 2 | `php -m` lista las extensiones; `composer --version` ≥ 2 | PASS / FAIL |
| B2 | Provisionar MySQL 8+ / MariaDB 10.6+, BD vacía `<db>`, usuario `<user>` con `ALL` sobre `<db>` | `mysql -u <user> -p -e "SELECT VERSION(); SHOW DATABASES LIKE '<db>';"` | PASS = versión ≥ 8.0 / 10.6 y BD visible |
| B3 | DNS: `api.<dominio>` → host backend; `app.` / `coach.` / `gym.` / `admin.` → hosts estáticos | `dig +short api.<dominio>` | PASS = resuelve (los 5) |
| B4 | TLS en los 5 subdominios | `curl -sI https://api.<dominio>/up` sin error de cert | PASS = `HTTP/2 200` |
| B5 | Document root del backend = `backend/public/`; SPA fallback `try_files … /index.html` en los 4 estáticos (o Netlify / Vercel auto); restricción de acceso de infra en `admin.` | config del host | PASS = revisada |

### C. Variables de entorno (backend `.env` de producción — BLOCKED en credenciales)

| Clave | Valor | Verifica |
|---|---|---|
| `APP_ENV` | `production` | — |
| `APP_DEBUG` | `false` | **crítico** |
| `APP_KEY` | `php artisan key:generate --show` (nueva) | ≠ la de local |
| `APP_URL` | `https://api.<dominio>` | — |
| `APP_LOCALE` / `APP_FALLBACK_LOCALE` | `es` | — |
| `LOG_LEVEL` / `LOG_CHANNEL` | `error` / `stack` o `stderr` (según host) | — |
| `DB_CONNECTION=mysql` · `DB_HOST/PORT/DATABASE/USERNAME/PASSWORD` | `<...>` | — |
| `SESSION_DRIVER` / `CACHE_STORE` / `QUEUE_CONNECTION` | `database` | tablas ya existen |
| `BROADCAST_CONNECTION=log` · `FILESYSTEM_DISK=local` · `MAIL_MAILER=log` | — | — |
| Frontends `.env` (git-ignored, uno por app: usuario / couch / gym-web / admin) | `VITE_API_BASE_URL=https://api.<dominio>/api/v1` (absoluta, con `/api/v1`) | — |

**Verificación C:** `php artisan about` → `Environment=production`,
`Debug Mode=OFF`, `Database=mysql`. **PASS / FAIL.**

### D. Database

| Paso | Comando | Verifica | PASS / FAIL |
|---|---|---|---|
| D1 | `php artisan migrate --force` | aplica 24 migraciones | `php artisan migrate:status` → 24 `Ran`, 0 `Pending` |
| D2 | `php artisan db:seed --class=ExerciseSeeder --force` (**nunca `db:seed` pelado**) | 22 ejercicios | `SELECT COUNT(*) FROM exercises;` = 22 |
| D3a | Bootstrap BIAFYT Admin (§4.2.0): `BIAFYT:grant-platform-admin <email registrado>` | 1 usuario con `is_platform_admin` | `SELECT is_platform_admin FROM users WHERE email='…';` = 1 |
| D3b | Primer `gym_admin`: por el flujo de onboarding (usuario solicita → admin aprueba) **o** bootstrap directo §4.2.1 (`grant-gym-admin` / tinker) | 1 `GymAssignment(role=gym_admin, active)` | `SELECT role,status FROM gym_assignments WHERE user_id=<id>;` |
| D4 | Backup inicial | `mysqldump ... > BIAFYT_$(date +%F).sql` | fichero > 0 bytes; programar cron / snapshot |

### E. Backend deploy

| Paso | Comando | Verifica | PASS / FAIL |
|---|---|---|---|
| E1 | `composer install --no-dev --optimize-autoloader` | sin errores | exit 0 |
| E2 | `php artisan config:cache && php artisan route:cache && php artisan view:cache` | 3 OK | exit 0 en los 3 (verificado en dev) |
| E3 | Permisos: `storage/` y `bootstrap/cache/` escribibles por el usuario web | `touch storage/logs/deploy_probe && rm storage/logs/deploy_probe` | PASS |
| E4 | Servir `public/` (nginx / apache / comando PaaS) | proceso arriba | `systemctl status` / PaaS dashboard |
| E5 | `curl -s -o /dev/null -w "%{http_code}" https://api.<dominio>/up` | health | **PASS = 200** |

### F. Frontends build + deploy

| Paso | Comando | Verifica | PASS / FAIL |
|---|---|---|---|
| F1 | Por cada app (`frontend-usuario`, `frontend-couch`, `frontend-gym-web`, `frontend-admin`): crear `.env` con su `VITE_API_BASE_URL` → `npm ci && npm run build` | `dist/` con `index.html` + `assets/` | PASS = build sin error (los 4) |
| F2 | Subir `dist/` de cada una a su subdominio; configurar fallback SPA; restricción de acceso de infra en `admin.` | — | — |
| F3 | `curl -sI https://app.<dominio>/` → 200 + `curl https://app.<dominio>/ruta-inexistente` → 200 con `index.html` (fallback) | fallback SPA | **PASS = ambas 200** |
| F4 | Repetir F3 para `coach.`, `gym.` y `admin.` | — | PASS |

### G. Smoke tests → ver §6.

### H. Rollback

| Escenario | Acción | Verifica |
|---|---|---|
| Backend roto tras deploy | Revertir al release anterior (symlink / tag) + `php artisan config:clear && config:cache` con el `.env` previo | `/up` → 200 |
| Migración mala | `php artisan migrate:rollback --step=1 --force` **solo si la migración es reversible y no hubo escrituras nuevas**; si no → restaurar `mysqldump` del paso D4 | `migrate:status` coherente |
| Frontend roto | Re-desplegar el `dist/` anterior (los estáticos son inmutables por build; guardar el `dist/` previo o re-buildear del tag anterior) | `curl` del subdominio → 200 |
| `.env` mal | Corregir clave, `php artisan config:cache`, reiniciar php-fpm | `php artisan about` |

**Criterio de rollback:** cualquier smoke test §6 en FAIL que no se
resuelva en < 15 min → rollback y post-mortem.

---

## 6. Smoke test end-to-end (producción, HTTPS)

Equivalente al E2E local de Onboarding + Coach + Gym, contra
`https://api.<dominio>`. Requiere: bootstrap D3a hecho (BIAFYT Admin `S`) +
4 usuarios registrados vía la API (`A` dueño del gym, `B` coach-candidato,
`C` atleta, `D` outsider). El gym KAIROS **se crea en el paso 3** (por el
onboarding), no en el bootstrap.

```
PRE
 0.  curl -s -o /dev/null -w "%{http_code}" https://api.<dominio>/up                          → 200
 0b. curl -s -o /dev/null -w "%{http_code}" https://api.<dominio>/api/v1/exercises            → 200
 0c. registro de A/B/C/D: POST /api/v1/auth/register  (Accept+Content-Type json)              → 201 {user,token}
 0d. S ya registrado + BIAFYT:grant-platform-admin S (§4.2.0)

ONBOARDING (usuario solicita → BIAFYT Admin aprueba)
 0e. A: POST /me/gym-registration-request {gym_name:"KAIROS GYM",branch_name:"Norte"}  → 201 status=pending  (SIN user_id/revisor/email en la respuesta)
 0f. A: POST /me/gym-registration-request {gym_name:"OTRA",branch_name:"x"}             → 422  (un solo pending por usuario)
 0g. D (usuario normal): GET /admin/gym-registration-requests                           → 404  (toda la superficie admin)
 0h. S: GET /admin/gym-registration-requests?status=pending                             → 200, contiene la de A, con applicant:{id,name,email}
 0i. S: POST /admin/gym-registration-requests/<id>/approve                              → 200; crea Gym KAIROS + Branch Norte + GymAssignment(A,gym_admin,active)
 0j. S: POST /admin/gym-registration-requests/<id>/approve  (otra vez)                  → 200 idempotente, mismo gym.id, Gym.count()==1
 0k. S: POST /admin/gym-registration-requests/<id>/reject                               → 422  (approved no se puede rechazar)

GYM ADMIN
 1.  A: GET /me/gym-assignments                                → 200, role=gym_admin, gym=KAIROS
 2.  A: GET /me/gym/<gym>/user-lookup?email=<B>                 → 200 {user:{id,name}}  (SIN email en la respuesta)
 3.  A: POST /me/gym/<gym>/assignments {user_id:<B>,role:"coach",branch_id:null}   → 201
 4.  A: GET /me/gym/<gym>/user-lookup?email=<C>                 → 200
 5.  A: POST /me/gym/<gym>/assignments {user_id:<C>,role:"member",branch_id:<branch>} → 201

COACH ↔ ATLETA
 6.  B: POST /me/coach-relationships {athlete_user_id:<C>}      → 201 status=pending
 7.  C: POST /me/coach-relationships/<rel>/accept              → 200 status=active

ATLETA
 8.  C: PATCH /profile {level,focus_id,months_training}        → 200
 9.  C: POST /me/activities {routine_label,started_at,finished_at,duration_seconds,sets_completed,exercises_completed,streak} → 201
10.  C: POST /me/check-ins                                     → 201

COACH CONSULTA + NOTA
11.  B: GET /me/coach/athletes/<C>                             → 200 {athlete,profile,activity_summary,streak,points}  (SIN email)
12.  B: POST /me/coach/athletes/<C>/notes {body:"..."}         → 201

GYM CONSULTA + REVOCA
13.  A: GET /me/gym/<gym>/members                              → 200, contiene a C, campos {id,user:{id,name},role,branch,since}  (SIN email)
14.  A: GET /me/gym/<gym>/coaches                              → 200, contiene a B
15.  A: GET /me/gym/<gym>/members/<C>                          → 200, snapshot idéntico al del paso 11
16.  A: DELETE /me/gym/<gym>/assignments/<member-assignment>   → 204
17.  A: GET /me/gym/<gym>/members/<C>                          → 404   (Gym pierde acceso)
18.  A: GET /me/gym/<gym>/members                              → 200, YA NO contiene a C
19.  B: GET /me/coach/athletes/<C>                             → 200   (CoachAthleteRelationship intacta)
20.  verificar en MySQL: SELECT status FROM coach_athlete_relationships WHERE coach_user_id=<B> AND athlete_user_id=<C>;  → 'active'

ANTI-IDOR / SEGURIDAD
21.  sin token (con Accept json): GET /me/gym/<gym>/members                    → 401
22.  D (outsider): GET /me/gym/<gym>/members                                   → 404
23.  D: GET /me/coach/athletes/<C>                                             → 404
24.  A: POST /me/gym/<gym>/assignments {user_id:<B>,role:"gym_admin"}          → 422
25.  A: DELETE /me/gym/<otro-gym>/assignments/<x>                              → 404
26.  GET /me/gym/<gym>/user-lookup?email=<C> con el token de C (no admin)     → 404
27.  buscar la string "email" en TODAS las respuestas de pasos 11,13,15       → ausente
28.  todas las peticiones sobre https:// (no http://); redirección http→https del host → 301/308
29.  re-login de A y repetir paso 13 → los datos persisten (MySQL real, no memoria)

ONBOARDING — AISLAMIENTO / ANTI-ESCALADA
30.  D: POST /admin/gym-registration-requests/<id>/approve                     → 404  (un usuario normal nunca aprueba)
31.  D: POST /me/gym-registration-request {gym_name:"X",branch_name:"y",status:"approved",user_id:<A>}  → 201 status=pending  (ignora status/user_id del body)
32.  A: GET /me/gym/<gym-de-otro>/members  (segundo gym aprobado para otro usuario)  → 404  (gym_admin administra SOLO su gym)
33.  buscar "email" / "user_id" en las respuestas de pasos 0e y del index de usuario  → ausente
34.  S: GET /admin/gyms  → 200, lista con branches + recuentos de roles, SIN datos personales
```

**PASS global** = pasos 0–34 en verde. Documentar el script curl
reproducible (como el E2E local de los slices, adaptando
`BASE=https://api.<dominio>`). Nota: los pasos 0e–0k, 30–34 ya están
cubiertos por la suite backend (`GymRegistrationRequestApiTest`,
`Admin/GymRegistrationRequestApiTest`, `Admin/GymApiTest` — 24 tests); el
smoke de producción los re-verifica sobre HTTPS real.

---

## 7. Decisión gate

### 🟢 READY (se puede desplegar ya, sin cambios de código)

- Backend: dominio, migraciones (24), anti-IDOR Coach / Gym / **onboarding**
  (`/admin/*` gateado por `is_platform_admin` → 404; `is_platform_admin` fuera
  de `$fillable`; solicitud fuerza `status='pending'`), Sanctum Bearer,
  validación, mass-assignment, health check, `config` / `route` / `view:cache`,
  mapeo sin fugas cross-user.
- Frontends (los 4): build de producción, `VITE_API_BASE_URL` horneada, manejo
  de 401 / red, sin `console.log`, sin `localhost` hardcodeado, `gym_id` no
  confiado desde LocalStorage, `is_platform_admin` derivado siempre de
  `/auth/me` (nunca de LocalStorage).
- Migraciones + `ExerciseSeeder` (posterior, no bloqueante).

### 🔴 FIX BEFORE DEPLOY (bug / riesgo — corregir, sin cambiar alcance funcional)

> **Estado: F1–F4 HECHOS** (ver bloque ACTUALIZACIÓN arriba). Solo F5 queda,
> y es opcional. La tabla es el plan original.

| # | Qué | Archivo | Estado |
|---|---|---|---|
| **F1** | Rate limiting del grupo `api` (en el discovery: solo `auth` throttled) | `bootstrap/app.php` (`throttleApi()`) + `app/Providers/AppServiceProvider.php` (`RateLimiter::for('api', …)` — limiter **con nombre**, 120/min, para no compartir contador con el `throttle:6,1` de `auth/*`) | ✅ HECHO + 1 test |
| **F2** | Petición sin `Accept: application/json` y sin token → 500 | `bootstrap/app.php`: `$exceptions->shouldRenderJsonWhen(fn () => true)` **+** `$middleware->redirectGuestsTo(fn () => null)` (necesario: el redirect por defecto resuelve `route('login')` eagerly) | ✅ HECHO + 2 tests |
| **F3** | `DatabaseSeeder` crea `test@example.com` | `database/seeders/DatabaseSeeder.php`: `if (! app()->environment('production'))` alrededor del test user | ✅ HECHO + 2 tests |
| **F4** *(recomendado)* | Comando `BIAFYT:grant-gym-admin` idempotente para el bootstrap | `app/Console/Commands/GrantGymAdmin.php` | ✅ HECHO + 6 tests |
| **F5** *(opcional / higiene)* | `AuthController` devuelve modelo `User` crudo → mapear `{id,name,email,is_platform_admin}`; alinear `backend/.env.example` con el proyecto | `AuthController.php`, `backend/.env.example` | ⏳ pendiente (no bloquea — re-revisado en el cierre de Fase 2: sin fuga cross-user) |

> Además: corregida la violación de estilo **preexistente** de
> `tests/Feature/Api/V1/ProfileTest.php` (`\App\Models\Profile::` → `use` +
> `Profile::`) para dejar `pint --test` (repo completo) en verde. Sin cambio
> de comportamiento.

> **Slice Gym Onboarding + BIAFYT Admin (D-GYM-ONBOARDING)** — NO es
> hardening, es alta comercial de gimnasio. Commit `e1be4f6`, mergeado a
> `main` en `80e0057`:
> +2 migraciones (→ 24), `GymRegistrationRequest`, `users.is_platform_admin`,
> `BIAFYT:grant-platform-admin`, controllers usuario + `Admin\*`, app web
> nueva `frontend-admin/` (`admin.<dominio>`), pantalla "Registrar mi
> gimnasio" en `frontend-usuario`. 28 tests nuevos. Sin fallos de seguridad
> que bloqueen producción (revisión del cierre de Fase 2). `frontend-gym-web`
> sin cambios.

### 🟡 BLOCKED (credencial / infra / decisión externa)

1. Host PHP 8.2+ + Composer + extensiones — **proveedor sin decidir**.
2. MySQL 8+ / MariaDB 10.6+ — host + credenciales.
3. Dominio + **5 subdominios**: `api.`, `app.`, `coach.`, `gym.`, `admin.`.
4. Hosting estático × 4 + fallback SPA (+ restricción de acceso de infra en
   `admin.` — recomendada, no bloqueante).
5. TLS / HTTPS (certs, los 5) + `APP_URL=https`.
6. Ejecutor con acceso a la infraestructura.
7. Backups MySQL (mysqldump cron / snapshots gestionados).
8. Agregación de logs (decisión `single` vs `stderr` según host).
9. ~~**DECISIÓN de producto / alcance.**~~ **DECIDIDO (revisado):**
   `backend/` (`api.`) + `frontend-usuario/` (`app.`) + `frontend-couch/`
   (`coach.`) + `frontend-gym-web/` (`gym.`) + **`frontend-admin/` (`admin.`)**;
   `frontend-gym` móvil fuera. `DEPLOY.md` ya lo refleja. (Ya no es un blocker.)
10. `APP_KEY` de producción (se genera en el host — depende de tener host).
11. Primer **BIAFYT Admin** (`BIAFYT:grant-platform-admin`) — depende de
    tener host + un usuario registrado; decisión de ops sobre qué cuenta(s).

### ⚪ OUT OF SCOPE (no tocar ahora)

- CORS: mantener `allowed_origins: ['*']` (decisión Fase 2). Restringir a
  subdominios = opcional post-MVP.
- Sanctum: expiración de tokens `null` (decisión Fase 2).
- `frontend-usuario`: mocks (`data/gyms.js`, community, duelos, ranking) →
  backend; `selectGym` / `registerGym` local; GPS; `Workout.jsx`;
  `Analytics.jsx`; `stateSchema.js`.
- Coach MVP / Gym MVP: sin cambios (salvo que F1 / F2 tocan `bootstrap/app.php`
  globalmente — no cambian su comportamiento, verificable con los 61 tests).
- Onboarding: **no** ampliar el alcance (sin notificación al solicitante, sin
  editar/suspender gimnasios desde Admin, sin métricas de plataforma, sin
  endpoint de `grant-platform-admin`).
- Programs / Workouts / asignaciones, Ranking real, Billing, autoridad de
  puntos, duelos reales.
- `frontend-gym` móvil (APK / iOS) — decisión D-GYM-6.
- Password reset / verificación de email (`MAIL_MAILER=log`, decidido fuera).
- `frontend-usuario/android/` — committeado, no se empaqueta.
- legacy D.

---

## Resultado

### Estado actual

Código **listo para infra** y todo en `main`: F1–F4 aplicados (`93b0271`:
rate limit `api` 120/min, respuestas de error siempre JSON — 401 en vez de
500 sin `Accept`, `DatabaseSeeder` production-safe, comando
`BIAFYT:grant-gym-admin`) + slice Gym Onboarding + BIAFYT Admin
(`e1be4f6`, mergeado en `80e0057`: alta comercial de gimnasio,
`is_platform_admin`, `frontend-admin`). Anti-IDOR, auth, validación,
migraciones (24) y builds verificados (**452 tests backend**, `pint --test`
verde, **4 frontends** verdes, E2E Onboarding + Coach + Gym cubierto por la
suite). **Cero deuda de infraestructura en el código** (sin Redis / colas /
workers). Solo queda **F5** (opcional / higiene) y la ejecución.

### Blockers (todos externos)

Host + MySQL + dominio (5 subdominios) + hosting estático (×4) + TLS +
ejecutor + backups + primer BIAFYT Admin. Nada de esto se puede resolver
desde el repo. (La decisión de alcance ya está tomada — ver ACTUALIZACIÓN.)

### Riesgos (residuales)

- **Operacional:** sin backup configurado antes del primer registro real =
  pérdida de datos ante fallo. Sin fallback SPA en el host estático = 404 al
  recargar cualquier ruta. → mitigar en el deploy (`DEPLOY.md` §5 y §3.3).
- **Producto:** el Cliente que "elige gym" en su app no queda como member en
  backend — el flujo Gym exige alta por el gym_admin (§31, aceptado). El
  onboarding **no notifica** al solicitante (pull-only). Aceptado para el MVP.
- **`admin.<dominio>` sin restricción de infra (bajo):** el backend ya
  responde 404 a todo `/admin/*` para no-admins; la restricción de infra
  (IP allowlist / Basic Auth) es defensa en profundidad recomendada.
- **F5 pendiente (bajo):** `AuthController` devuelve el modelo `User` crudo
  (solo datos del propio caller — sin fuga cross-user).

### Lista de cambios de código (estado)

1. ✅ `bootstrap/app.php` — `throttleApi()` (F1) + `redirectGuestsTo(fn () => null)` + `shouldRenderJsonWhen(fn () => true)` (F2). *(`93b0271`)*
2. ✅ `app/Providers/AppServiceProvider.php` — limiter con nombre `api` (F1). *(`93b0271`)*
3. ✅ `database/seeders/DatabaseSeeder.php` — guard de producción (F3). *(`93b0271`)*
4. ✅ `app/Console/Commands/GrantGymAdmin.php` — bootstrap idempotente (F4). *(`93b0271`)*
5. ⏳ *(opcional)* `AuthController` → mapear user; `backend/.env.example` → alinear (F5) — NO hecho, no bloquea.
6. ✅ `DEPLOY.md` — actualizado al alcance de **5 artefactos** (incl. `frontend-admin`), bootstrap BIAFYT Admin + gym_admin, backups, rollback, smoke E2E con onboarding, prohibición de `db:seed` pelado.
7. ✅ Tests hardening: `ProductionHardeningTest.php` (6) + `GrantGymAdminCommandTest.php` (6).
8. ✅ Estilo preexistente: `tests/Feature/Api/V1/ProfileTest.php` (import) → `pint --test` verde.
9. ✅ *(slice Onboarding, `e1be4f6` → `main` en `80e0057`)* migraciones `2026_09_07_000001/2`, `GymRegistrationRequest`, `Admin\*` + `GymRegistrationRequestController`, `BIAFYT:grant-platform-admin`, `frontend-admin/`, pantalla "Registrar mi gimnasio" en `frontend-usuario`. 28 tests nuevos.

### Orden recomendado

`A` (F1–F4 `93b0271` + slice Onboarding `e1be4f6` + tests + docs, todo
mergeado a `main` en `80e0057`) — **HECHO**; `git push` a `origin` pendiente →
`B` (infra + credenciales + dominio, 5 subdominios) → `C` (`.env` prod) → `D` (migrate 24 +
ExerciseSeeder + BIAFYT Admin + gym_admin + backup) → `E` (backend deploy +
`/up`) → `F` (4 builds + subdominios + fallback SPA) → `G` (smoke test §6,
pasos 0–34) → si algo FAIL sin fix rápido → `H` (rollback).

### Comandos de verificación (resumen)

```bash
# repo (A)
cd backend && php artisan test && ./vendor/bin/pint --test
for d in frontend-usuario frontend-couch frontend-gym-web frontend-admin; do (cd $d && npm ci && npm run lint && npm run test && npm run build); done

# post-deploy backend (E)
php artisan about | grep -E "Environment|Debug|Database"      # production / OFF / mysql
php artisan migrate:status | grep -c Ran                       # 24
curl -s -o /dev/null -w "%{http_code}\n" https://api.<dominio>/up               # 200
curl -s -o /dev/null -w "%{http_code}\n" https://api.<dominio>/api/v1/exercises  # 200

# smoke (G) → script curl de §6, pasos 0–34
```

### Criterio de "MVP Production CLOSED"

- [x] F1–F4 aplicados con tests + slice Onboarding (backend **452 verdes**) +
      `pint --test` verde *(F1–F4 en `93b0271`; slice Onboarding en `e1be4f6`;
      todo mergeado a `main` en `80e0057`. Pendiente: `git push` a `origin`)*
- [x] `DEPLOY.md` y este discovery actualizados al alcance de **5 artefactos**
      (incl. `frontend-admin`)
- [ ] Backend en `https://api.<dominio>`: `about` → production / OFF / mysql;
      `/up` → 200; `migrate:status` → **24 Ran**
- [ ] `ExerciseSeeder` ejecutado (`COUNT(exercises)` = 22) **sin** haber
      corrido `db:seed` pelado (`test@example.com` ausente en prod)
- [ ] 1 **BIAFYT Admin** bootstrapeado (`BIAFYT:grant-platform-admin`),
      `is_platform_admin = 1` verificado en BD
- [ ] 1 `gym_admin` (por onboarding o `BIAFYT:grant-gym-admin`), verificado en BD
- [ ] `frontend-usuario` (`app.`) + `frontend-couch` (`coach.`) +
      `frontend-gym-web` (`gym.`) + `frontend-admin` (`admin.`) desplegados,
      fallback SPA verificado (recarga en ruta profunda → 200) en los **4**;
      restricción de acceso de infra aplicada en `admin.`
- [ ] Smoke test §6 pasos 0–34 en verde (incl. onboarding usuario→admin,
      approve idempotente, usuario normal → 404 en `/admin/*`, no autoescalada
      a `gym_admin`, gym_admin administra SOLO su gym, 401 sin auth, cero
      `email`/`user_id` en respuestas de usuario, HTTPS, persistencia MySQL,
      `CoachAthleteRelationship` intacta tras revocar membresía)
- [ ] `mysqldump` inicial guardado + backup recurrente programado
- [ ] Rollback probado (al menos: re-desplegar release anterior + restaurar dump)
- [ ] Entrada `FASE: 2 — MVP Producción` en `PROJECT_STATE.md` marcada CLOSED
      con URLs reales

---

## Referencias

- `DEPLOY.md` — runbook operativo (alcance, subdominios, comandos por release).
- `PROJECT_STATE.md` — estado real del repo, fases, deuda técnica, decisiones D-*.
- `BIAFYT_BUSINESS_CORE.md` — reglas de negocio, decisiones D2–D8, D-COACH,
  D-GYM, D-GYM-ONBOARDING.
- `FASE: Coach MVP`, `FASE: Gym MVP` y `FASE: Gym Onboarding + BIAFYT Admin`
  en `PROJECT_STATE.md` — los slices que forman el lazo funcional
  Cliente → Coach → Gym + el alta comercial de gimnasio.
