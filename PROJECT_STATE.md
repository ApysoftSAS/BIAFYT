# BIAFYT — PROJECT STATE

Memoria técnica compacta. NO es un changelog. Léase antes de iniciar cualquier fase nueva para evitar reinvestigar o reimplementar algo que ya existe.

## CHECKPOINT DE RECUPERACIÓN

- HEAD antes del cierre D1: `e23f31d` ("feat(couch): add coach frontend phase 1"). El cierre D1 (commit inmediatamente encima) añade: Rewards backend (`RewardClaim` + débito en ledger), paridad de racha en `PointRules`, 3 skills (`api-review`/`backend-review`/`database-review`), 1 agent (`backend-engineer`) y `DEPLOY.md` — un solo snapshot reproducible.
- **Estado del dominio Activity + Points + Check-in + Challenges + Streak + Rewards:** backend cerrado (`Activity`/`PointTransaction` `66b801b`; `CheckIn` `f5fa82d`; `ChallengeClaim` + `GET /me/streak` `9541277`; `RewardClaim` cierre D1); frontend conectado SOLO en modo **write-through sombra** (actividades `ad2c412`, check-ins `f5fa82d`, retos `9541277`, premios cierre D1; `apiGetStreak` sin consumidor) — LocalStorage sigue siendo la fuente visible, sin flip de autoridad. Migraciones `2026_08_28_00000{1,2,3,4}` + `2026_09_06_000001` + `2026_09_06_000002` (`coach_notes`, slice D-COACH) + `2026_09_07_000001` (`users.is_platform_admin`) + `2026_09_07_000002` (`gym_registration_requests`) — estas dos del slice D-GYM-ONBOARDING — aplicadas en la BD dev local (`mysql` / `BIAFYT`). **24 migraciones en total** (`DEPLOY.md` y `docs/PRODUCTION_HARDENING_DISCOVERY.md` actualizados a 24 en el cierre de Fase 2). **El slice Gym MVP (D-GYM) NO añade ninguna migración ni modelo** — reutiliza `Gym`/`Branch`/`GymAssignment` tal cual; el slice **D-GYM-ONBOARDING** sí añade 2 migraciones + el modelo `GymRegistrationRequest` + el flag `is_platform_admin`. Ledger `point_transactions` con 4 `reason`: `workout_completed`, `checkin`, `challenge_claimed`, `reward_claimed` (este último el primer DÉBITO — monto negativo). **MVP entregable — ver sección ESTADO MVP.**
- Historial relevante: `9541277` (Challenges write-through + Streak backend) → `0dd6a1a` (sync tras Check-in) → `f5fa82d` (cierre Check-in write-through) → `11f2eca` (sync tras Frontend write-through) → `ad2c412` (cierre Frontend write-through) → `e688537` (sync tras Activity + Points) → `66b801b` (cierre Activity + Points) → `1556ad3` (sync de `PROJECT_STATE.md` tras CoachAthleteRelationship) → `75900cf` (cierre CoachAthleteRelationship) → `7c5a732` (sync de `PROJECT_STATE.md` tras GymAssignment write) → `0155c50` (cierre GymAssignment write: self-assign/revoke) → `0d88f52` (sync de `PROJECT_STATE.md` tras Workout Backend) → `b4e7e3b` (cierre Workout Backend) → `0dcce49` (sync de `PROJECT_STATE.md` tras Programs Backend) → `e569578` (cierre Programs Backend) → `f8453ea` (sync de `PROJECT_STATE.md` tras GymAssignment) → `068d24f` (GymAssignment API lectura) → `d31f907` (sync de `PROJECT_STATE.md` tras Gym/Branch) → `aba1950` (Gym/Branch API lectura) → `1dabcb0` (cierre Custom Routines → Exercise Catalog + creación de `PROJECT_STATE.md`) → `7e60f07` (primer commit real de `frontend-usuario/`+`backend/`). Commits anteriores a `7e60f07` (`aba2d61`, `b00b230`, `1935f4b`, `a9e6e4c`, `6d50418`) solo tocan el árbol legacy en la raíz, no relacionado con el trabajo actual.
- Estado de la rama: la rama `feat/coach-gym-mvp` (partió de `main` en `57ed6b2`) — Coach MVP (D-COACH) `aed5490`, Gym MVP (D-GYM) `91a2653`, hardening F1–F4 + runbook de producción `93b0271`, slice **D-GYM-ONBOARDING** (alta de gimnasio + `frontend-admin`) `e1be4f6` — está **mergeada a `main`** con `--no-ff` (`80e0057`). Encima, en `main`: `20ed683` (elimina el árbol legacy monolítico de la raíz), `353aebd` (nuevo `README.md` raíz multi-app), `004ba5b` + `0f1c467` (sync de docs: `CLAUDE.md`/`backend/CLAUDE.md`/`PROJECT_STATE.md` + `DEPLOY.md`/discovery), `8961a73` (slice **D-CLIENT-COACH** — consentimiento coach↔atleta en la app del atleta; ver `FASE: Cliente ↔ Coach`). **HEAD de `main`: `8961a73`.** El lazo MVP completo Cliente → Coach → Gym quedó **validado E2E contra el backend local real** (smoke de 9 pasos, PASS).
  - **Push:** el último commit confirmado en `origin/main` es `e4cda8f` ("update", pusheado desde una terminal con acceso al remoto; contiene todo hasta `0f1c467`). **`8961a73` queda pendiente de push** — desde este entorno el remoto responde `Repository not found` (repo privado sin credenciales usables aquí; `git push` debe hacerse desde la terminal con acceso). Ningún commit local por detrás del remoto.
- **`frontend-couch/` ya NO es un placeholder vacío**: contiene la app del rol Coach — Fase 1 CERRADA (`e23f31d`: Auth + relación de consentimiento coach↔atleta) **+ slice Coach MVP (D-COACH) CERRADO** (`aed5490`: un coach con relación `active` lee el snapshot sombra del atleta —Profile/actividad/racha/puntos— y escribe notas privadas `CoachNote`). Reutiliza el sistema visual y el patrón Sanctum de `frontend-usuario` sin rediseño. Ver `FASE: frontend-couch`, `FASE: Coach MVP — información del atleta + notas` y `frontend-couch/CLAUDE.md`. De los 4 bloqueos de backend documentados abajo (DEUDAS TÉCNICAS), el #2 (acceso coach-scoped al atleta) quedó **parcialmente resuelto** por el slice Coach MVP.

## ESTADO MVP (entregable)

- **MVP LOCAL: READY.** Recorrido verificado punta a punta (código + persistencia):
  registro → login → onboarding/perfil → Home → check-in → entrenar → recibir puntos → completar/reclamar retos → ver puntos → **canjear premio** → ver progreso/historial → cerrar sesión → volver a entrar → **datos conservados**.
- **MVP PRODUCCIÓN: 🟡 BLOCKED (infra).** NO desplegado, NO CLOSED, NO READY.
  - **Lazo funcional Cliente → Coach → Gym LISTO Y VALIDADO E2E:** **Coach MVP CLOSED** (`aed5490`, D-COACH) + **Gym MVP CLOSED** (`91a2653`, D-GYM) + **D-CLIENT-COACH CLOSED** (`8961a73`: el atleta acepta/rechaza la solicitud del coach y ve su coach activo desde `frontend-usuario` — cierra el lado del atleta). Smoke E2E de 9 pasos contra el backend local real: **PASS** (gym solicita → BIAFYT Admin aprueba → `gym_admin` da de alta coach+atleta → coach solicita → atleta acepta → atleta entrena/check-in → coach ve snapshot sombra + deja nota → `gym_admin` ve snapshot del miembro → anti-IDOR OK).
  - **Alta comercial de gimnasio LISTA (slice D-GYM-ONBOARDING, commit `e1be4f6`, en `main`):** usuario solicita → **BIAFYT Admin** aprueba (app web nueva `frontend-admin/`) → se crea `Gym` + sede + `gym_admin`. Ver `FASE: Gym Onboarding + BIAFYT Admin`.
  - **Cierre de Fase 2 (READY FOR INFRA):** `DEPLOY.md` y `docs/PRODUCTION_HARDENING_DISCOVERY.md` actualizados al alcance de **5 artefactos** (`api.` + `app.` + `coach.` + `gym.` + **`admin.`**), **24 migraciones**, bootstrap del primer BIAFYT Admin (`BIAFYT:grant-platform-admin`), smoke test E2E del onboarding (pasos 0–34) y **smoke E2E completo del lazo Cliente → Coach → Gym contra backend local real (9 pasos, PASS)**. `frontend-admin/.env.example` corregido para producción. Suite (HEAD `8961a73`): **452 backend + Pint verde**; 4 frontends lint/test/build verdes (**usuario 107** / couch 7 / gym-web 19 / admin 8). **Sigue BLOCKED solo por infra** (host, MySQL, dominio de 5 subdominios, hosting estático ×4, TLS, ejecutor, backups, primer platform admin) **+ `git push` de `8961a73` + tag `fase-2-mvp-ready-for-infra` pendientes desde la terminal con acceso al remoto**.
  - **Discovery de producción/hardening documentado:** `docs/PRODUCTION_HARDENING_DISCOVERY.md` (versionado, para handoff a infra). Inventario de infra, auditoría backend + 4 frontends, auditoría de datos/migraciones (24), bootstrap de BIAFYT Admin + gym_admin, deploy plan A–H, smoke test E2E (pasos 0–34, incl. onboarding), decisión gate, criterio de "MVP Production CLOSED".
  - **Hardening F1–F4: IMPLEMENTADOS** (commit `93b0271`, en `main`; ninguno cambia el alcance funcional):
    - **F1 ✅** rate limit del grupo `api`: limiter con nombre `api` en `AppServiceProvider::boot()` (`Limit::perMinute(120)->by(user?->id ?: ip())`) + `$middleware->throttleApi()` en `bootstrap/app.php`. El throttle estricto de `auth/register|login` (`6,1`) se mantiene aparte, sin colisión de contador (limiter con nombre ≠ `resolveRequestSignature`). `X-RateLimit-Limit: 120` verificado.
    - **F2 ✅** en `bootstrap/app.php`: `$exceptions->shouldRenderJsonWhen(fn () => true)` **+** `$middleware->redirectGuestsTo(fn () => null)`. Lo segundo es necesario: el redirect de invitado por defecto apunta la `Authenticate` middleware a `route('login')`, que se resuelve EAGERLY para un guest sin `expectsJson()` y lanza `RouteNotFoundException` (500) ANTES de construir la `AuthenticationException`. Con `null` queda una `AuthenticationException` limpia que `shouldRenderJsonWhen` sirve como **401 JSON**. Verificado contra `php -S public/index.php` (production-like): guest a `/api/v1/profile` sin `Accept` → **401** `{"message":"Unauthenticated."}` (antes 500).
    - **F3 ✅** `DatabaseSeeder::run()`: `if (! app()->environment('production')) { … test user … }`. `ExerciseSeeder` siempre corre. `db:seed` pelado en prod ya no crea `test@example.com`. (La regla operativa "usa `--class=ExerciseSeeder`" sigue en `DEPLOY.md`.)
    - **F4 ✅** `app/Console/Commands/GrantGymAdmin.php` — `php artisan BIAFYT:grant-gym-admin {email} {gym-name} {--branch=}`. Idempotente (`firstOrCreate` Gym/Branch, `firstOrNew` + `save` del `GymAssignment` a `active`), falla (exit 1) si el user no existe. **NO es endpoint**, no viola D-GYM-3/D-GYM-8. Modelos intactos.
    - **F5 ⏳ NO implementado** (opcional/higiene): `AuthController` devuelve el modelo `User` crudo (`email_verified_at`/timestamps del propio caller — sin fuga cross-user); `.env.example` es el stock de Laravel.
  - Tests nuevos: `backend/tests/Feature/ProductionHardeningTest.php` (6: F1 limit + F1 auth-throttle intacto + F2 401-json + F2 404-json + F3 prod/no-prod) y `backend/tests/Feature/GrantGymAdminCommandTest.php` (6: falla sin user, gym-wide, branch-scoped, idempotente, reactiva, reutiliza gym). **426/426 backend** (414 + 12), Pint limpio en los archivos tocados. Los 3 frontends re-validados sin cambios (lint/test/build: 97 / 7 / 19 verdes).
  - **Blockers principales = infraestructura / credenciales / decisión externa:** host PHP 8.2+, MySQL 8+/MariaDB 10.6+, dominio + subdominios (`api.`/`app.`/`coach.`/`gym.`), hosting estático × 3 + fallback SPA, TLS, ejecutor con acceso a infra, backups MySQL, `APP_KEY` de prod.
  - **DECISIÓN de alcance TOMADA (esta ronda):** la 1ª producción incluye `backend/` + `frontend-usuario/` (`app.`) + `frontend-couch/` (`coach.`) + `frontend-gym-web/` (`gym.`). **`frontend-gym` móvil/Capacitor FUERA DE ALCANCE** (D-GYM-6). `DEPLOY.md` actualizado a este alcance.
  - CORS (`*`) y caducidad de tokens Sanctum (`null`) se mantienen (decisión Fase 2). Sin APK/iOS. `ExerciseSeeder` se ejecuta en prod **posteriormente** al arranque. Recuperación de contraseña NO se implementa.
  - **Etapa 0 (prep del repo): HECHA.** `DEPLOY.md` ampliado (alcance + subdominios `app`/`api` + `npm ci` + seed posterior); `frontend-usuario/yarn.lock` eliminado; `backend/CLAUDE.md` corregido.
  - **Etapas 1–2 (ejecución): PENDIENTES / BLOCKED por infra.** Runbook: **`DEPLOY.md`**; discovery: **`docs/PRODUCTION_HARDENING_DISCOVERY.md`**.
  - **URL backend producción**: — (aún no desplegado)
  - **URL frontend producción**: — (aún no desplegado)

- **Backend REQUERIDO** en tiempo real solo para **Auth y Profile**; el resto del recorrido usa LocalStorage. Sin backend, registro/login/perfil fallan con mensaje claro ("No pudimos conectar con el servidor").
- **Config**: `frontend-usuario/.env` (gitignored; plantilla en `.env.example`) → `VITE_API_BASE_URL` absoluta con `/api/v1`. Local por defecto: `http://localhost:8000/api/v1`. La URL se hornea en el build → cambiarla exige `npm run build`.
- **Persistencia**: LocalStorage + `AppContext#switchIdentity`/`identitySnapshots` (snapshot completo de `identity` por `user.id` de backend). Sobrevive a recarga, logout/login y 401 (token revocado). El backend NO es autoritativo del saldo — es copia sombra.

### Funcionalidades: REALES vs MOCK

| Feature | Estado |
|---|---|
| Auth (registro/login/logout, biometría como unlock local) | **REAL** (backend Sanctum) |
| Profile (datos físicos / nivel / enfoque) | **REAL** (backend `GET/PATCH /profile`, fuente de verdad) |
| Catálogo de ejercicios | **REAL** con fallback local atómico |
| Rutina del día (`buildRoutine`) | REAL pero **determinística** (lookup fijo por foco, no adaptativa) |
| Entrenamiento / puntos de actividad | **REAL local** (+ copia sombra backend best-effort). Números visibles = LocalStorage |
| Check-in / +20 pts | **REAL local** (+ copia sombra al backend, `POST /me/check-ins`, +20 en el ledger) |
| Racha visible (Home / Profile / Challenges) | **REAL backend** (D2 / roadmap 3a, sin commit): `current_streak` / `longest_streak` de `GET /me/streak` (`StreakRules`, deriva de `check_ins`). Sin fallback a valores locales — "—" si el backend no responde. `identity.user.streak` (nunca decrece) queda SOLO como hecho de sesión para puntos hasta el flip (3c); Ranking (mock) no se tocó |
| Retos diarios (3/día, reclamar reward) | **REAL local** (+ copia sombra). Completitud calculada en frontend; el reto `dc-validated` exige GPS real |
| Premios (canje por puntos, código, usar/regalar) | **REAL local**. Sin backend. Códigos generados en cliente. Premio más barato = 200 pts |
| Progreso / Analytics / Calendar | **REAL local** sobre el historial de actividades |
| Ranking | **MOCK** (`data/users.js#communityUsers`, ~10 personas estáticas) |
| Duelos | **REAL backend** (roadmap 3b, sin commit): `User` reales del mismo gym, duelo asíncrono 1v1 (retador crea → rival acepta → ambos ejecutan → backend resuelve cara a cara con `DuelRules`). Ledger `PointTransaction` (`duel_won`/`duel_lost`, 5ª fuente, best-effort). La APUESTA visible se concilia en LocalStorage (`AppContext#reconcileDuels`) — sin flip 3c |
| Comunidad / noticias / planes / videos-TikTok | **MOCK** (datos locales; TikTok sin integración) |
| Gimnasios / sedes | **MOCK** (`data/gyms.js`; hay `GET /gyms` backend sin conectar) |

### Pendiente para V2 (NO bloquea el MVP)

~~Duelos reales~~ **HECHO** (roadmap 3b, sin commit — ver `FASE: Duelos reales`) · Ranking backend (usuarios/gym/ubicación/opt-in reales) · Flip de autoridad del saldo a backend + reconciliación de huecos offline (outbox/retry) · ~~Consumir `GET /me/streak` en la UI (D2)~~ **HECHO** (roadmap 3a, sin commit) · Ajustar economía de premios para canje en primera sesión · GPS real / anti-fraude / reto `dc-validated` · Sembrar catálogo de ejercicios y comunidad en backend (seeders reales) · **Ejecutar el deploy** siguiendo `DEPLOY.md` + `docs/PRODUCTION_HARDENING_DISCOVERY.md` — **Fase 2 🟡 BLOCKED (infra)** (Etapa 0 + hardening discovery + hardening F1–F4 hechos y en `main`; falta host/credenciales, ver `## ESTADO MVP`). Rewards write-through al ledger: **CERRADO en D1** (`reward_claimed`, único débito).

## ESTADO DEL REPO / ACLARACIONES

- **RESUELTO (`20ed683`, en `main`):** el árbol legacy monolítico de la raíz (`android/`, `src/`, `public/`, `icons/`, `resources/`, `package.json`, `vite.config.js`, `capacitor.config.json`, `eslint.config.js`, `yarn.lock`, `index.html`, `README.md`) — la app React+Vite+Capacitor pre-reestructuración, superada por `frontend-usuario/` + `backend/` — fue eliminada en el commit `chore(repo): remove superseded legacy monolith` (150 archivos, solo borrados; el `.gitignore` raíz se conservó). El `README.md` raíz se recreó después (`353aebd`) describiendo la arquitectura multi-app. Durante meses estos borrados vivieron sin commitear en el working tree ("anomalía de repo conocida"); ya no.
- `frontend-gym/` (móvil/Capacitor) sigue siendo **solo Gym UI Foundation** (shell + login + placeholders — ver `FASE: Gym UI Foundation`; su producto móvil queda para Fase 5, D-GYM-6). `frontend-gym-web/` (web, sin Capacitor) **ya NO es solo shell**: el slice **Gym MVP (D-GYM)** le añadió la gestión real de miembros/coaches y el estado sombra de un miembro (ver `FASE: Gym MVP`). `frontend-couch/` — app del rol Coach, Fase 1 + slice Coach MVP (D-COACH) cerrados (ver `FASE: frontend-couch` y `FASE: Coach MVP`).
- Los 3 `CLAUDE.md` (`CLAUDE.md` raíz, `backend/CLAUDE.md`, `frontend-usuario/CLAUDE.md`) fueron alineados con la arquitectura multi-app real en la Consolidación post-D1 (commit `docs:`). `frontend-couch/CLAUDE.md` ya estaba al día.

## ESTRUCTURA REAL

```
BIAFYT/
├── frontend-usuario/      # app React real, con backend conectado (Auth/Profile/Exercises)
│   └── src/{App.jsx, components/, config/, data/, screens/, state/, theme/, utils/}
├── frontend-couch/        # app del rol Coach — Fase 1 + slice Coach MVP (D-COACH) CERRADOS
│   └── src/{App.jsx, components/, config/, screens/, state/CoachContext.jsx, theme/, utils/}
│       # Auth + relación coach↔atleta + lectura sombra del atleta + notas.
│       # sistema visual copiado textual de frontend-usuario; sin monorepo (sync manual)
├── frontend-gym/          # Gym App (móvil) — UI Foundation. React+Vite+Capacitor.
│   └── src/{App.jsx, components/, config/, state/SessionContext.jsx, screens/, theme/, utils/}
│       # SOLO shell visual + login (contrato /auth/* existente). CERO dominio Gym.
├── frontend-gym-web/      # Gym Web (navegador) — slice Gym MVP (D-GYM) CERRADO. React+Vite, sin Capacitor.
│   └── src/{App.jsx, components/{Sidebar,Topbar}, config/, state/SessionContext.jsx, screens/, theme/, utils/}
│       # shell web + gestión real de member/coach por el gym_admin + estado sombra del miembro.
├── frontend-admin/        # BIAFYT Admin (web) — slice D-GYM-ONBOARDING CERRADO. React+Vite, sin Capacitor.
│   └── src/{App.jsx, components/{Sidebar,Topbar}, config/, state/SessionContext.jsx, screens/, theme/, utils/}
│       # dashboard interno de plataforma: revisa solicitudes de registro de gym + lista gyms.
└── backend/                # Laravel 12 + Sanctum
    └── app/{Http/Controllers/Api/V1/, Models/}, routes/api.php, database/{migrations,seeders}, tests/

# (el árbol legacy monolítico de la raíz — android/, src/, package.json, … — fue
#  eliminado en `20ed683`; ver `## ESTADO DEL REPO / ACLARACIONES`)
```

## BACKEND REAL (verificado leyendo `routes/api.php`)

- Controllers: `AuthController` (register/login/logout/me), `ProfileController` (GET/PATCH profile, upsert diferido), `ExerciseController` (GET exercises, público), `GymController` (GET gyms, público, lectura mínima), `GymAssignmentController` (GET me/gym-assignments, auth:sanctum, lectura mínima), `CoachAthleteRelationshipController` (index/store/accept/destroy, auth:sanctum, consentimiento coach↔atleta), `CoachAthleteController` (index/show/notesIndex/notesStore/notesDestroy, auth:sanctum, lectura coach-scoped del atleta + notas — Coach MVP; gate = relación `active`), `GymAdminController` (members/coaches/userLookup/storeAssignment/destroyAssignment/memberDetail, auth:sanctum — Gym MVP; gate = `GymAssignment(role=gym_admin, active)` en el gym de la ruta), `ProgramController`/`ProgramDayController`/`ProgramExerciseController` (CRUD completo, auth:sanctum, ownership por usuario autenticado), `WorkoutController`/`WorkoutExerciseController`/`ExercisePerformanceController` (CRUD completo, auth:sanctum, ownership por usuario autenticado), `ActivityController` (POST/GET me/activities, auth:sanctum), `PointController` (GET me/points, auth:sanctum, solo lectura del ledger), `CheckInController` (POST/GET me/check-ins, PATCH me/check-ins/today/check-out, auth:sanctum), `ChallengeController` (POST/GET me/challenge-claims, auth:sanctum, modo sombra — registra el claim sin verificar completitud), `StreakController` (GET me/streak, auth:sanctum, solo lectura — racha derivada de `check_ins`).
- Modelos: `User`, `Profile`, `Exercise`, `Gym`, `Branch`, `GymAssignment`, `CoachAthleteRelationship`, `CoachNote`, `Program`, `ProgramDay`, `ProgramExercise`, `Workout`, `WorkoutExercise`, `ExercisePerformance`, `Activity`, `PointTransaction`, `CheckIn`, `ChallengeClaim`, `RewardClaim`. `User::programs(): HasMany`, `User::workouts(): HasMany`, `User::activities(): HasMany`, `User::pointTransactions(): HasMany`, `User::checkIns(): HasMany`, `User::challengeClaims(): HasMany`, `User::rewardClaims(): HasMany`, `User::coachRelationshipsAsCoach(): HasMany`, `User::coachRelationshipsAsAthlete(): HasMany`, `User::coachNotesWritten(): HasMany` y `User::coachNotesReceived(): HasMany` añadidos. `CoachAthleteRelationship::activeBetween(coachId, athleteId): bool` — gate de autorización coach→atleta (relación `active`; un `GymAssignment(role=coach)` revocado después NO la invalida).
- `StoreProgramRequest`/`StoreWorkoutRequest`/`StoreActivityRequest`: únicas `FormRequest` del backend. `StoreActivityRequest` valida los hechos de sesión + cross-field (`finished_at >= started_at`; `workout_id` propio/cerrado/sin Activity previa → 422). `CoachAthleteRelationshipController`, `CoachAthleteController`, `GymAdminController`, `CheckInController` y `ChallengeController` validan inline (o sin cuerpo), sin FormRequest dedicada.
- `app/Support/AthleteSnapshot.php`: constructor único del "snapshot sombra" de un atleta/miembro (`{athlete, profile|null, activity_summary{count,last_activity_at,total_sets,total_exercises,total_duration_seconds,recent[≤10]}, streak{current_streak,longest_streak}, points{balance}}`). Reutiliza `StreakRules::fromDates` + `SUM(point_transactions.amount)` — SIN cálculo ni autoridad de puntos nueva, sin mutar `Activity`/`PointTransaction`/`CheckIn`. Lo consumen `CoachAthleteController::show` (gate = relación `active`) y `GymAdminController::memberDetail` (gate = gym_admin + el target es member activo del gym), devolviendo un shape byte-idéntico.
- `app/Support/PointRules.php`: fuente de verdad backend del cálculo de puntos de ACTIVIDAD y CHECK-IN. `PointRules::forActivity(sets, exercises)` = `min(600, sets*6 + exercises*12)`, conteos clampados a 0. Constantes `PER_SET=6`, `PER_EXERCISE=12`, `PER_ACTIVITY_CAP=600`, `CHECKIN=20` (monto fijo del check-in diario, espejo de `POINT_RULES.checkin`). Clase estática plana.
- `app/Support/ChallengeRules.php`: fuente de verdad backend de los RETOS DIARIOS. `TEMPLATES` (6 retos `{id, reward}`, mismo orden que `frontend/data/community.js#dailyChallengeTemplates`), `forDate(date)` (los 3 del día, port verbatim del seed `dailyChallengesFor`), `rewardFor(id, date)` (reward si es uno de los 3, si no `null`). Solo registra el claim — NO verifica completitud (modo sombra).
- `app/Support/StreakRules.php`: fuente de verdad backend de la RACHA. `fromDates(checkInDates, today)` → `{current_streak, longest_streak}`. Regla aprobada: racha por día calendario, derivada SOLO de `check_ins.check_in_date` (nunca workouts); días consecutivos incrementan, un día perdido rompe; `current_streak` sigue "vivo" mientras el último check-in sea hoy o ayer (hoy aún no es un día perdido), y pasa a 0 si el último check-in tiene 2+ días. Solo lectura — NO alimenta puntos ni un `streak_bonus`; NO reemplaza el `streak` local del frontend.
- `PointTransaction` `reason` en uso: `workout_completed` (crédito de actividad, `source`→`Activity`), `checkin` (crédito fijo +20 del check-in diario, `source`→`CheckIn`), `challenge_claimed` (reward del reto desde `ChallengeRules`, `source`→`ChallengeClaim`). Ledger compartido: `balance = SUM(amount)` de los tres.
- Rutas activas: `POST auth/register`, `POST auth/login` (throttle 6/1), `POST auth/logout`, `GET auth/me` (auth:sanctum), `GET exercises` (público), `GET gyms` (público), `GET/PATCH profile` (auth:sanctum), `GET me/gym-assignments` (auth:sanctum), `POST/DELETE me/gym-assignments` (auth:sanctum, self-assign/revoke del propio rol member), `GET/POST me/coach-relationships`, `POST me/coach-relationships/{id}/accept`, `DELETE me/coach-relationships/{id}` (auth:sanctum), `POST/GET me/programs`, `GET/PATCH/DELETE me/programs/{program}`, `POST me/programs/{program}/days`, `PATCH/DELETE me/program-days/{programDay}`, `POST me/program-days/{programDay}/exercises`, `PATCH/DELETE me/program-exercises/{programExercise}`, `POST/GET me/workouts`, `GET/PATCH/DELETE me/workouts/{workout}`, `POST me/workouts/{workout}/exercises`, `PATCH/DELETE me/workout-exercises/{workoutExercise}`, `POST me/workout-exercises/{workoutExercise}/performances`, `PATCH/DELETE me/exercise-performances/{exercisePerformance}`, `POST/GET me/activities`, `GET me/points`, `POST/GET me/check-ins`, `PATCH me/check-ins/today/check-out`, `POST/GET me/challenge-claims`, `GET me/streak`, `POST/GET me/reward-claims`, `GET me/coach/athletes`, `GET me/coach/athletes/{athleteUserId}`, `GET/POST me/coach/athletes/{athleteUserId}/notes`, `DELETE me/coach/notes/{note}`, `GET me/gym/{gym}/members`, `GET me/gym/{gym}/coaches`, `GET me/gym/{gym}/user-lookup?email=`, `POST me/gym/{gym}/assignments`, `DELETE me/gym/{gym}/assignments/{id}`, `GET me/gym/{gym}/members/{userId}` (todas auth:sanctum; las `me/gym/{gym}/*` con params numéricos-only vía `whereNumber`).
- **Hardening producción (F1–F4, `bootstrap/app.php` + `AppServiceProvider` + `DatabaseSeeder` + `app/Console/Commands/GrantGymAdmin.php`):** el grupo `api` tiene rate limit **120/min** (limiter con nombre `api`, por user o IP); `auth/register|login` conserva su `throttle:6,1` sin colisión. Toda excepción se sirve como JSON (`shouldRenderJsonWhen(fn () => true)`) y el redirect de invitado es `null` (`redirectGuestsTo`) → un guest a un endpoint protegido recibe **401 JSON**, nunca 500/redirect. `DatabaseSeeder` no crea `test@example.com` en `production`. `php artisan BIAFYT:grant-gym-admin {email} {gym-name} {--branch=}` = bootstrap idempotente del primer `gym_admin` (ops-only, NO endpoint).
- `GymAssignment` ya tiene lectura HTTP autenticada (`GET /me/gym-assignments`, solo asignaciones propias/activas del usuario autenticado) y escritura acotada a la propia asignación member (`POST`/`DELETE /me/gym-assignments`, self-assign/revoke, ver fase GymAssignment — Escritura abajo). **Sigue sin ningún endpoint de administración de roles por terceros** (que un admin/coach asigne o revoque roles de otros usuarios) — permanece interno para eso a propósito. `CoachAthleteRelationship` (ver fase abajo) es un mecanismo de consentimiento distinto: no asigna ni modifica ningún `GymAssignment`, solo lo lee para exigir que el solicitante ya sea coach en algún gym.
- `Activity` + `PointTransaction` (ledger de puntos) YA existen (ver fase "Activity + Points" abajo). NO existe: `Routine` backend, `Ranking`/`Challenge`/`Duel`/`Reward`/`Notification`/`streak` backend, ningún endpoint de esos dominios.

## FASES

```
FASE: Auth
STATUS: CLOSED
Notas: Sanctum, invariant signedIn⇔token real, biometría como unlock local no auth.
```

```
FASE: Biometrics / App Lock
STATUS: CLOSED
Notas: biometría nunca setea signedIn por sí sola; confirmSessionAfterBiometric() revalida contra /auth/me.
```

```
FASE: Profile
STATUS: CLOSED
Notas: GET/PATCH /profile, upsert diferido (clave omitida=preserva, null=borra).
```

```
FASE: Identity Isolation / Multi-tab
STATUS: CLOSED
Notas: state = {schemaVersion, device, auth, identitySnapshots, identity}. switchIdentity() snapshotea `identity` completo por user.id (no allowlist por campo). Multi-tab vía evento `storage` nativo únicamente (sin BroadcastChannel/sessionStorage).
```

```
FASE: Exercise Catalog
STATUS: CLOSED
Architect: PASS | Implementation: PASS | Fitness Review: PASS | QA: PASS | Independent Review: PASS
Notas: GET /api/v1/exercises (público). 22/22 ejercicios exactos, id numérico backend + slug estable. Frontend: data/exerciseCatalog.js#loadExerciseCatalog() acepta el catálogo remoto SOLO si coincide ATÓMICAMENTE (misma cantidad, mismos ids, sin duplicados, name/type/machineId idénticos) contra data/exercises.js; cualquier discrepancia → fallback local completo (nunca subconjunto parcial).
```

```
FASE: Training / Programs
STATUS: CLOSED
Architect: PASS | Implementation: PASS | Fitness Review: PASS | QA: PASS | Independent Review: PASS
Notas: buildRoutine(focusId, exerciseSource) — resolver local `resolveExercise(id, source)` DENTRO de training.js (NO en exercises.js, que quedó protegido/intacto). Backward-compatible: buildRoutine(focusId) sin segundo arg = comportamiento histórico vía findExercise(id). AppContext pasa exerciseCatalog como segundo argumento. Fail-fast real: source explícito incompleto NUNCA cae a exercises.js.
```

```
FASE: Custom Routines → Exercise Catalog
STATUS: CLOSED
Architect: PASS | Implementation: PASS | Fitness Review: PASS (2ª ronda; 1ª ronda BLOCKED por prescripción incoherente isométrico/cardio, corregido) | QA: PASS | Independent Review: PASS
Notas: MyRoutines.jsx picker usa exerciseCatalog (22) en vez de machines.js (8/10). exerciseFromCatalog() congela exerciseId/name/type respetando el mismo contrato por type que training.js#buildRoutine: fuerza→sets/reps/rest; isométrico→sets/seconds/rest (sin reps); cardio→duration:null/rest (sin sets/reps/seconds). 20s en isométrico = placeholder de UI editable, NO prescripción fitness. Reduce de "series" usa setsFor() (no e.sets directo) para no dar NaN con cardio. Legacy sin exerciseId/type sigue funcionando sin migración ni heurística name→exerciseId. Único archivo de código: MyRoutines.jsx (+MyRoutines.test.jsx). 68/68 tests, lint limpio, build exitoso. Verificado en navegador real y offline. Commit: 1dabcb0.
```

```
FASE: Gym/Branch — API de lectura mínima
STATUS: CLOSED
Architect/Discovery: PASS | Design: APPROVED | Implementation: PASS | Fitness Review: no requerido (sin lógica fitness) | QA: APPROVED | Independent Review: APPROVED FOR CLOSURE
Notas: GET /api/v1/gyms (público, sin auth:sanctum, mismo precedente que /exercises). Reutiliza Gym/Branch/GymAssignment tal cual, sin ampliar schema. Shape mínimo: Gym→{id,name,branches}, Branch→{id,name} (branches anidadas, sin gym_id en cada branch). Gyms ordenados por name; N+1 verificado ausente (2 queries, with('branches') real). GymAssignment permanece 100% interno, sin endpoint, sin datos suyos en la respuesta (verificado por test). Sin frontend conectado (gyms.js/AppContext/Onboarding/ChangeGym/GPS/Workout intactos). 60/60 tests backend (7 nuevos GymTest + 53 previos), GymAssignmentTest (20) intacto, Pint limpio en archivos tocados. Único archivo de test/controller nuevo: GymController.php, GymTest.php; routes/api.php +2 líneas. Commit: aba1950.
```

```
FASE: GymAssignment — API de lectura mínima
STATUS: CLOSED
Architect: PASS | Implementation: PASS | QA: PASS | Independent Review: PASS
Notas: GET /api/v1/me/gym-assignments (auth:sanctum). Solo devuelve asignaciones ACTIVAS del usuario autenticado — filtro siempre por $request->user()->id, nunca desde query/body (invariante anti-IDOR, verificado en runtime real con intentos de inyección). Shape: id, role, gym{id,name}, branch{id,name}|null. inactive excluida por completo (no aparece, no se marca). Sin deduplicar (mismo gym con roles distintos = filas independientes). Orden: gym.name ASC, branch.name ASC, gym-wide antes que branch específica. with(['gym','branch']) evita N+1 (verificado). Sin Resource/Service/Policy/FormRequest nuevos. GymAssignment.php/ROLE_RANK/activeFor() sin tocar. Sin escritura/administración de roles. Sin frontend conectado. 70/70 tests backend (10 nuevos + 60 previos), GymAssignmentTest (20, dominio) y GymTest (7) intactos, Pint limpio. Único archivo de controller/test nuevo: GymAssignmentController.php, GymAssignmentApiTest.php; routes/api.php +3 líneas. Commit: 068d24f.
```

```
FASE: Programs Backend
STATUS: CLOSED
Architect: PASS | Design: APPROVED | Implementation: PASS | QA: APPROVED | Independent Review: APPROVED FOR CLOSURE
Notas: Program → ProgramDay → ProgramExercise, cadena de dominio separada de Exercise. Ownership 100% por usuario autenticado (patrón anti-IDOR: int params, resolución manual vía $request->user()->..., 404 siempre, nunca 403, nunca user_id desde cliente). CRUD completo de Program y sus subrecursos (days, exercises). Creación anidada de Program+days+exercises transaccional (DB::transaction, todo o nada). `position` única dentro de cada padre (program→days, program_day→exercises), con huecos permitidos; auto-asignada como MAX(position)+1 si se omite. `exercise_id` puede repetirse dentro del mismo ProgramDay (sin UNIQUE compuesta). Conflicto de `position` devuelve 422 (ValidationException) en vez de 500 — bug encontrado por QA (UniqueConstraintViolationException sin capturar) y corregido replicando el patrón `->exists()` ya usado en los `update()` en los tres `store()`; verificado rollback completo ante conflicto (sin filas parciales). 107/107 tests backend. QA APPROVED, Independent Review APPROVED FOR CLOSURE. Sin frontend conectado. Sin Resource/Service/Policy nuevos (solo la FormRequest ya justificada). Commit: e569578.
```

```
FASE: Workout Backend
STATUS: CLOSED
Architect: PASS | Design: APPROVED | Implementation: PASS | QA: APPROVED (tras 1 fix BLOCKED) | Independent Review: APPROVED FOR CLOSURE
Notas: Workout → WorkoutExercise → ExercisePerformance, extiende la cadena de dominio más allá de Program/ProgramDay/ProgramExercise con el registro de ejecución real. Schema/FKs: workouts.user_id→cascade, workouts.program_day_id→nullOnDelete (nullable, standalone permitido), workout_exercises.workout_id→cascade, workout_exercises.exercise_id→restrict (catálogo compartido), workout_exercises.program_exercise_id→nullOnDelete (nullable), exercise_performances.workout_exercise_id→cascade. UNIQUE(workout_id,position) y UNIQUE(workout_exercise_id,set_number). Ownership 100% anti-IDOR (mismo patrón que Programs: 404 en recurso de ruta ajeno, nunca 403; referencias ajenas en body —program_day_id/program_exercise_id— responden 422, no 404). Creación anidada Workout+exercises+performances transaccional (DB::transaction, rollback completo ante cualquier conflicto). WorkoutExercise conserva snapshot histórico (exercise_id+program_exercise_id+position) tomado en el momento de creación; exercise_id debe coincidir con el del program_exercise_id referenciado; editar/borrar el Program después no altera el Workout ya creado (nullOnDelete verificado en runtime real). Standalone (program_day_id=NULL) no puede referenciar program_exercise_id en ninguno de sus exercises (422 si se viola). Workout abierto (finished_at NULL) es editable; al fijar finished_at queda inmutable — cualquier mutación posterior (Workout y cualquier hijo) responde 409, guard evaluado ANTES que la validación del payload; sin reapertura posible. Conflictos de position/set_number devuelven 422 (nunca 500) vía chequeo ->exists() pre-create, implementado correctamente desde el diseño inicial (a diferencia de Programs, que lo tuvo que corregir después). GET /me/workouts sin paginación en esta fase (decisión aprobada, deuda registrada). QA encontró 1 BLOCKED: creación anidada con performances mezclando set_number auto-asignado y explícito no detectaba el conflicto porque Validator::validated() reordena arrays cuando algunos elementos cumplen una regla `sometimes` y otros no (WorkoutController::store() iteraba sobre ese orden ya roto) — el payload se aceptaba con los datos remapeados silenciosamente en vez de dar 422. Fix: iterar sobre $request->input(...) (preserva el orden crudo del cliente) para indexar los valores ya validados, en vez de iterar sobre $request->validated() directamente. QA re-verificó APPROVED, Independent Review APPROVED FOR CLOSURE. 168/168 tests backend. Sin frontend conectado. Sin Resource/Service/Policy nuevos (solo la FormRequest ya justificada). Commit: b4e7e3b.
```

```
FASE: GymAssignment — Escritura (self-assign / revoke member role)
STATUS: CLOSED
Architect: PASS | Implementation: PASS | QA: PASS | Independent Review: APPROVED FOR CLOSURE
Notas: POST/DELETE /api/v1/me/gym-assignments (auth:sanctum). Permite que el usuario autenticado se auto-asigne el rol member en un gym/branch y revoque su propia asignación member, siguiendo el mismo patrón ownership/anti-IDOR ya validado en Programs/Workout. `role` y `user_id` nunca se aceptan del cliente (role forzado a member, user_id siempre del usuario autenticado); `branch_id` requerido (el modelo rechaza una asignación member con branch_id null). Duplicado activo → 422; una asignación previamente revocada (inactive) con la misma key se reactiva en el mismo registro (200) en vez de duplicarse, porque el UNIQUE constraint no contempla status. Revocar desactiva la fila (status→inactive) sin borrarla; destroy() solo puede actuar sobre asignaciones member propias del caller — recursos ajenos y asignaciones propias con otro rol responden 404. Sin cambios de esquema, sin nuevas abstracciones. QA y revisión independiente: APPROVED FOR CLOSURE. Administración de roles por terceros (que un admin/coach asigne o revoque roles de otros usuarios) sigue sin ningún endpoint — queda fuera de esta fase. Único controller/test tocado: GymAssignmentController.php, GymAssignmentApiTest.php; routes/api.php +2 líneas. Commit: 0155c50.
```

```
FASE: CoachAthleteRelationship
STATUS: CLOSED
Architect: PASS (validado post-hoc contra código ya escrito) | Implementation: PASS | QA: APPROVED | Independent Review: APPROVED FOR CLOSURE
Notas: GET/POST /api/v1/me/coach-relationships, POST .../{id}/accept, DELETE .../{id} (auth:sanctum). Relación de CONSENTIMIENTO coach↔atleta, independiente de GymAssignment (no asigna ni modifica roles de gym, solo exige que el solicitante tenga un GymAssignment(role=coach, status=active) vigente en cualquier gym/branch — relación NO scopeada a gym). `coach_user_id` siempre del usuario autenticado en store(); `athlete_user_id` validado (`exists:users,id`), nunca puede ser el propio solicitante. Máquina de estados: pending→active (accept, solo el atleta objetivo, 404 si lo intenta otro), pending→revoked (coach cancela o atleta rechaza), active→revoked (solo el atleta; el coach NO puede revocar una relación activa), cualquier otra transición → 422 (nunca 500). Sin UNIQUE de BD en (coach_user_id, athlete_user_id): duplicado pending/activo se rechaza a nivel aplicación (search-before-create), mismo patrón ya aceptado en GymAssignment::store(); una fila revocada nunca se reutiliza — una solicitud nueva tras revocación crea una fila nueva con su propio requested_at/activated_at (igual criterio histórico que WorkoutExercise). Ownership/anti-IDOR: 404 siempre, nunca 403, scoping siempre por $request->user()->id. Response incluye `viewer_role` (coach/athlete) para que el frontend no compare ids manualmente. Dos notas de alcance verificadas por QA y aceptadas como comportamiento correcto (no defectos): un atleta puede tener relaciones con varios coaches a la vez (sin restricción); la relación NO se invalida si el GymAssignment(role=coach) del coach se revoca después (snapshot histórico). Sin cambios a GymAssignment.php/ROLE_RANK/activeFor(). Sin Resource/Service/Policy/FormRequest nuevos. Sin frontend conectado. 33 tests nuevos (27 API + 6 dominio, patrón CoachAthleteRelationshipTest+CoachAthleteRelationshipApiTest igual al de GymAssignmentTest+GymAssignmentApiTest), 219/219 tests backend totales sin regresiones, Pint limpio. Archivos: CoachAthleteRelationshipController.php, CoachAthleteRelationship.php (modelo), migración create_coach_athlete_relationships_table, CoachAthleteRelationshipTest.php, CoachAthleteRelationshipApiTest.php; User.php +2 relaciones (coachRelationshipsAsCoach/AsAthlete); routes/api.php +4 líneas. Nota de proceso: implementación fue escrita como WIP sin commit antes de la decisión explícita del usuario; QA/Independent Review y esta entrada se hicieron post-hoc sobre el código ya existente, no antes de escribirlo. Commit: 75900cf.
```

```
FASE: Activity + Points (backend)
STATUS: CLOSED
Architect/Design: PASS (informe de diseño con 11 secciones + decisiones A–K aprobadas por el usuario) | Implementation: PASS | Backend/Database review: PASS | API review: PASS | Fitness review: PASS | QA: PASS | Final review: PASS
Notas: `Activity` (hecho histórico de una sesión de entrenamiento COMPLETADA + resumen agregado) + `PointTransaction` (ledger de puntos append-only, firmado, tipado, con `source` polimórfico). Activity NO reemplaza a Workout: responsabilidad distinta (Workout = ejecución detallada con ciclo abierto→cerrado; Activity = hecho inmutable, sin lifecycle, sin update/delete). NO se auto-crea Activity al cerrar un Workout (solo por `POST /me/activities` explícito) — WorkoutController intacto.
  Endpoints (auth:sanctum): `POST /api/v1/me/activities` (crea Activity + su crédito de puntos en UNA `DB::transaction`), `GET /api/v1/me/activities` (solo del caller, `finished_at DESC`, sin paginar), `GET /api/v1/me/points` (`balance` = `SUM(point_transactions.amount)` del caller + `transactions`, sin paginar, sin balance cacheado).
  Regla de puntos (única fuente backend, `app/Support/PointRules.php`): `amount = min(600, sets_completed*6 + exercises_completed*12)`, conteos negativos clampados a 0. Portada de `frontend/utils/validation.js#computeWorkoutPoints` SIN el bono de streak y SIN split competitivo/actividad (ambos fuera de alcance: streak necesita modelo de asistencia autoritativo; el split competitivo necesita la capa anti-fraude/GPS). Consecuencia aceptada: el número backend es menor que el del frontend para usuarios con racha, y no hay "puntos competitivos validados" todavía.
  Cliente envía SOLO hechos de sesión (`workout_id?`, `routine_label?`, `started_at`, `finished_at`, `duration_seconds`, `sets_completed`, `exercises_completed`). `points`/`amount`/`activity_points`/`competitive_points`/`points_awarded`/`user_id` enviados por el cliente se IGNORAN (no están en las reglas de `StoreActivityRequest`; el monto lo deriva el backend, el `user_id` sale del token). `points_awarded` en la respuesta se DERIVA del ledger (`SUM` de las transacciones de esa Activity) — no se almacena en `activities` (una sola fuente de verdad).
  Ownership/anti-IDOR (mismo patrón que Programs/Workout): scoping siempre por `$request->user()->id`; `workout_id` del body validado vía `$request->user()->workouts()` → 422 (campo de body, nunca 404). `workout_id`, si viene: debe ser propio, estar CERRADO (`finished_at != null`) y no tener otra Activity → 422 en cada caso.
  Idempotencia / doble otorgamiento: `UNIQUE(activities.workout_id)` (múltiples NULL permitidos → standalone ilimitado) + `UNIQUE(point_transactions.idempotency_key)` con `"activity:{id}"` + ambas escrituras en la misma transacción. Cadena garantizada: 1 Workout → ≤1 Activity → 1 crédito `workout_completed`. Pre-check `->exists()` en el FormRequest + `catch (QueryException)` en el controlador que reconvierte a 422 (nunca 500, rollback total) = misma defensa en profundidad que los conflictos de position/set_number en Programs/Workout. Actividades standalone (sin `workout_id`) NO tienen clave de idempotencia: cada POST crea Activity+crédito nuevos (documentado, mismo criterio que duplicados permitidos en WorkoutExercise).
  Schema: `activities`(id, user_id FK cascade, workout_id FK nullable nullOnDelete UNIQUE, routine_label nullable, started_at, finished_at [NOT NULL — una Activity siempre está completada], duration_seconds, sets_completed, exercises_completed, timestamps). `point_transactions`(id, user_id FK cascade + índice, amount [integer CON SIGNO — admite débitos/reversiones futuras sin migración], reason [string, const `REASON_WORKOUT_COMPLETED='workout_completed'`], nullableMorphs('source') [+índice (source_type,source_id)], idempotency_key nullable UNIQUE, timestamps).
  Modelos: `Activity` (belongsTo user/workout, morphMany pointTransactions; `user_id` hidden; casts datetime/int). `PointTransaction` (belongsTo user, morphTo source; `user_id`+`idempotency_key` hidden; `amount` cast int). Respuestas mapeadas a mano (patrón `mapWorkout`): nunca `user_id`, `idempotency_key`, ni FQCN del morph (`source_type` se expone como `'activity'` vía `Str::snake(class_basename())`).
  Sin Resource/Policy/evento/listener nuevos. `PointRules` es la única abstracción (clase estática plana, aprobada, reusada por controlador + tests + futuros `reason`). Sin cambios a Workout/WorkoutController/WorkoutExercise/ExercisePerformance. Sin frontend tocado (AppContext/Workout.jsx/Analytics.jsx/validation.js intactos). Sin migración de LocalStorage.
  Tests: 43 nuevos (`PointRulesTest` unit 5, `ActivityTest` dominio 13, `ActivityApiTest` 19, `PointApiTest` 7). 262/262 backend totales sin regresiones (219 previos + 43). Pint limpio en todos los archivos tocados. `php artisan test` exit 0. Nota: la concurrencia real (dos POST paralelos) no es simulable con SQLite `:memory:` — se cubre con el test secuencial (un 201, un 422, una Activity, una PointTransaction) + tests de dominio que prueban el `UNIQUE` de BD como última línea; misma limitación aceptada que la race check-then-act de Programs/Workout.
  Archivos nuevos: migraciones `2026_08_28_000001_create_activities_table.php` / `2026_08_28_000002_create_point_transactions_table.php`, `app/Models/Activity.php`, `app/Models/PointTransaction.php`, `app/Http/Controllers/Api/V1/ActivityController.php`, `app/Http/Controllers/Api/V1/PointController.php`, `app/Http/Requests/StoreActivityRequest.php`, `app/Support/PointRules.php`, `tests/Unit/PointRulesTest.php`, `tests/Feature/ActivityTest.php`, `tests/Feature/Api/V1/ActivityApiTest.php`, `tests/Feature/Api/V1/PointApiTest.php`. Modificados: `routes/api.php` (+2 imports, +3 rutas), `app/Models/User.php` (+`activities()`/`pointTransactions()`). Commit: `66b801b` (código); `PROJECT_STATE.md` sincronizado en `e688537`.
```

```
FASE: Activity + Points — Frontend write-through (copia sombra)
STATUS: CLOSED
Architect/Discovery: PASS (comparativa de 3 candidatas; A elegida como raíz de dependencias) | Implementation: PASS | Tests: PASS | Verificación end-to-end: PASS
Notas: primer tramo de conexión frontend↔backend más allá de Auth/Profile. LocalStorage SIGUE siendo la fuente de verdad VISIBLE (puntos, historial, Analytics, Ranking); el backend recibe una copia de auditoría best-effort. NO hay flip de autoridad, NO se migran datos locales, NO cambia ningún número ni UI.
  `utils/api.js` (+`buildActivityPayload` puro, +`apiCreateActivity`/`apiGetActivities`/`apiGetPoints`, patrón `apiFetch`). `AppContext#addActivity` (NO protegida): conserva intacta su escritura LocalStorage y además dispara `POST /me/activities` best-effort SI hay `state.auth.token`; un fallo se traga con `.catch(()=>{})` — sin reintento, sin cola, sin propagar excepción, sin tocar el estado local. Se envían TODAS las actividades de `addActivity` (único caller: `Workout.jsx`), incluidas las de duelo.
  Payload: `workout_id: null` (una rutina del frontend NO es un `Workout` backend), `routine_label = activity.routine ?? null`, `duration_seconds`/`sets_completed`/`exercises_completed` redondeados a entero y clampados a ≥0 (el backend exige `integer >= 0`; `durationSeconds` local es float), `finished_at = now`, `started_at = finished_at − durationSeconds` (el registro local no guarda hora de inicio — decisión aprobada). NUNCA se envía `points`/`amount`/`user_id`/`activityPoints`/`competitivePoints`/`duelId`: el monto lo deriva `PointRules` en el backend, el usuario sale del token.
  Divergencia esperada y aceptada: para un usuario con racha, el saldo local (`computeWorkoutPoints` incluye `min(100, streak*10)`) es MAYOR que el crédito backend (`PointRules` sin bono de racha). Para racha 0 coinciden. El backend queda como registro paralelo hasta una futura fase de flip de autoridad + reconciliación (que también deberá resolver los huecos por `POST` fallido en offline — deuda conocida de esta fase).
  Sin tocar `Workout.jsx`/`Analytics.jsx`/`validation.js` ni las funciones protegidas de `AppContext`. Sin dependencias nuevas. Frontend: lint limpio, 78/78 tests (68 previos + 10 nuevos), build OK. Backend: 43/43 tests Activity+Points sin cambios. Verificación end-to-end real contra `php artisan serve`: `POST /me/activities` con el payload exacto de `buildActivityPayload` → 201, `points_awarded` calculado por el backend; aparece en `GET /me/activities`; `GET /me/points` refleja `balance` + una transacción `workout_completed` ligada a `source_type:"activity"`.
  Archivos nuevos: `frontend-usuario/src/utils/api.test.js`, `frontend-usuario/src/state/AppContext.activityWriteThrough.test.jsx`. Modificados: `frontend-usuario/src/utils/api.js`, `frontend-usuario/src/state/AppContext.jsx`. Commit: `ad2c412` (código) / `11f2eca` (doc).
```

```
FASE: Check-in write-through (copia sombra)
STATUS: CLOSED
Architect/Discovery: PASS (elegida como versión de-scopeada de "Streak/Attendance", sin regla de racha) | Implementation: PASS | Tests: PASS | Verificación end-to-end: PASS
Notas: extiende el patrón write-through a los check-ins y añade el SEGUNDO `reason` real al ledger (`checkin`). LocalStorage sigue siendo la fuente VISIBLE (puntos, racha, `checkins[]`). El backend registra el check-in del día y acredita `checkin` (+20, monto fijo `PointRules::CHECKIN`) en el mismo ledger que `workout_completed`. La RACHA NO se toca en el backend — no hay regla de ruptura, no hay bono de racha, no hay cálculo de streak.
  Backend: `check_ins`(id, user_id FK cascade, check_in_date [string `Y-m-d`, NO casteado — bucket de día calendario], checked_in_at, checked_out_at nullable, timestamps; `UNIQUE(user_id, check_in_date)`). `CheckIn` (belongsTo user, morphMany pointTransactions; `user_id` hidden). `PointTransaction::REASON_CHECKIN='checkin'`. `CheckInController`:
  - `POST /me/check-ins` (sin cuerpo): crea el check-in de hoy + crédito `checkin` +20 en UNA `DB::transaction`, `idempotency_key="checkin:{user_id}:{YYYY-MM-DD}"`. Pre-check `->where('check_in_date', today)->exists()` + `UNIQUE(user_id,check_in_date)` + `UNIQUE(idempotency_key)` como última línea → 2º check-in del día = **422** (nunca 500, nada persiste). `user_id` del token, monto de `PointRules::CHECKIN` — el cliente nunca envía `amount`/`points`/`user_id`.
  - `PATCH /me/check-ins/today/check-out`: set `checked_out_at` sobre el check-in de HOY del caller. **404** si no hay check-in de hoy (recurso de ruta ausente); **422** si ya hizo check-out. Scoping siempre por `$request->user()`.
  - `GET /me/check-ins`: solo los del caller, más recientes primero (`check_in_date DESC, id DESC`), sin paginar (misma deuda registrada).
  - Respuestas mapeadas a mano: sin `user_id`, sin `idempotency_key`. `source_type` se expone como `'check_in'`.
  Frontend (`AppContext#checkIn`/`checkOut` — NO protegidas): conservan EXACTAMENTE la escritura LocalStorage (puntos +20, `streak+1`, `checkins[]`, `lastCheckIn`/`lastCheckOut`, `pointsLog`; guards 1/día y "salió tras entrar" intactos, return `!already`/`didCheckOut` byte-idéntico). Añaden un chequeo SÍNCRONO sobre `state.identity.lastCheckIn`/`lastCheckOut` (solo para decidir si disparar la copia sombra) y, si procede y hay `state.auth.token`, disparan `apiCheckIn`/`apiCheckOut` best-effort (`.catch(()=>{})`, sin cuerpo, sin reintento/cola). Un 2º check-in local el mismo día NO genera POST. `api.js` +`apiCheckIn`/`apiCheckOut`/`apiGetCheckIns`. `Home.jsx` (único caller) sin tocar.
  Divergencia: el dedupe del frontend usa el día local del cliente; el del backend usa el día del servidor. Aceptable en modo sombra best-effort (documentado). Huecos por POST offline: misma deuda no resuelta que el write-through de actividad.
  Sin `StoreCheckInRequest` (POST/PATCH sin cuerpo). Sin Resource/Policy/evento/listener. Sin tocar Workout.jsx/Analytics.jsx/validation.js/stateSchema.js ni funciones protegidas de AppContext. Sin migración de LocalStorage. NO incluye: racha autoritativa, regla de ruptura, bono de racha, GPS, gym/branch en `check_ins`, flip de autoridad, retos/duelos/premios, ranking, outbox/retry.
  Tests: backend 19 nuevos (`CheckInApiTest` 13 + `CheckInTest` 6), 281/281 backend totales sin regresiones, Pint limpio. Frontend 6 nuevos (`AppContext.checkInWriteThrough.test.jsx`), 84/84 totales, lint limpio, build OK. E2E real contra `php artisan serve`: POST→201/+20 `checkin`, 2º POST→422 sin doble crédito, PATCH check-out→200, 2º check-out→422, `GET /me/check-ins` OK, Activity+Points siguen verdes, ledger compartido suma `checkin`+`workout_completed`.
  Archivos nuevos: `backend/database/migrations/2026_08_28_000003_create_check_ins_table.php`, `backend/app/Models/CheckIn.php`, `backend/app/Http/Controllers/Api/V1/CheckInController.php`, `backend/tests/Feature/Api/V1/CheckInApiTest.php`, `backend/tests/Feature/CheckInTest.php`, `frontend-usuario/src/state/AppContext.checkInWriteThrough.test.jsx`. Modificados: `backend/routes/api.php` (+1 import, +3 rutas), `backend/app/Models/User.php` (+`checkIns()`), `backend/app/Models/PointTransaction.php` (+`REASON_CHECKIN`), `backend/app/Support/PointRules.php` (+`CHECKIN`), `frontend-usuario/src/utils/api.js` (+3 funciones), `frontend-usuario/src/state/AppContext.jsx` (`checkIn`/`checkOut`). Commit: `f5fa82d` (código) / `0dd6a1a` (doc).
```

```
FASE: Challenges write-through (copia sombra)
STATUS: CLOSED
Architect/Discovery: PASS (elegida sobre Streak; modo "solo registrar", sin verificación de completitud) | Implementation: PASS | Tests: PASS | Verificación end-to-end: PASS
Notas: 3er `reason` del ledger (`challenge_claimed`). LocalStorage sigue siendo la fuente VISIBLE (`user.points`, `challengeProgress`). El backend registra el claim del reto y acredita su reward (calculado por `ChallengeRules`, NO enviado por el cliente). **MODO SOMBRA — el backend NO verifica que el reto se completó** (la completitud se sigue calculando en el frontend con `progressForDay`); solo comprueba que el `challenge_id` es uno de los 3 del `challenge_date` y que no está ya reclamado. La racha, retos como concepto verificable y `dc-validated`/`dc-machines` quedan fuera.
  Backend: `challenge_claims`(id, user_id FK cascade, challenge_id string, challenge_date string `Y-m-d` [sin cast, bucket de día — igual que `check_ins`], timestamps; `UNIQUE(user_id, challenge_date, challenge_id)`). `ChallengeClaim` (belongsTo user, morphMany pointTransactions; `user_id` hidden). `app/Support/ChallengeRules.php`: `TEMPLATES` (6 retos `{id, reward}`, MISMO ORDEN que `frontend/data/community.js` — el algoritmo hace splice por índice), `forDate(date)` = port verbatim de `dailyChallengesFor` (seed = Σ `ord` de los chars de la fecha; `index i = (seed*(i+7)) % pool` + splice), `rewardFor(id, date)`. Paridad verificada contra la salida real del JS para 4 fechas. `PointTransaction::REASON_CHALLENGE_CLAIMED='challenge_claimed'`.
  `ChallengeController`:
  - `POST /me/challenge-claims` (body `{challenge_id, challenge_date}`): valida formato `Y-m-d`; `challenge_date` futura (día servidor) → **422**; `challenge_id` no ∈ los 3 de la fecha → **422**; ya reclamado → **422**. Si OK: crea `ChallengeClaim` + crédito `challenge_claimed` con `reward` de `ChallengeRules` en UNA `DB::transaction`, `idempotency_key="challenge:{user_id}:{challenge_date}:{challenge_id}"`. Pre-check `->exists()` + `UNIQUE(user_id,challenge_date,challenge_id)` + `UNIQUE(idempotency_key)` como última línea. `user_id` del token; `reward`/`amount`/`points`/`user_id` del cliente se IGNORAN.
  - `GET /me/challenge-claims`: solo los del caller, `challenge_date DESC, id DESC`, sin paginar.
  - Respuestas mapeadas a mano: `{id, challenge_id, challenge_date, created_at}` — sin `user_id`, sin `idempotency_key`. `source_type` se expone como `'challenge_claim'`.
  Frontend (`AppContext#claimChallenge` — NO protegida): conserva EXACTAMENTE la escritura LocalStorage (`user.points += reward`, `challengeProgress[dayKey].claimed`; guard "ya reclamado" y return `granted` byte-idénticos). Añade un chequeo síncrono sobre `state.identity.challengeProgress[dayKey].claimed` (solo para decidir si disparar la copia sombra) y, si el claim procede y hay `state.auth.token`, dispara `apiClaimChallenge(token, challengeId, dayKey)` best-effort (`.catch(()=>{})`, sin reintento/cola). El cliente envía SOLO `{challenge_id, challenge_date}` — el `reward` NUNCA viaja. Un 2º claim local del mismo reto NO genera POST. `api.js` +`apiClaimChallenge`/`apiGetChallengeClaims`. `Challenges.jsx` y `data/community.js` SIN tocar (solo leídos para portar la lógica).
  Divergencia: `challenge_date` es el día LOCAL del cliente (el que usa `Challenges.jsx#TODAY_KEY`); el backend solo rechaza fechas futuras contra el día servidor. Aceptable en sombra.
  Sin FormRequest, sin Resource/Policy/evento/listener. Sin tocar Workout.jsx/Analytics.jsx/validation.js/stateSchema.js/Challenges.jsx/data/community.js ni funciones protegidas de AppContext. Sin migración de LocalStorage, sin cambios de UI/números visibles. NO incluye: verificación de completitud, racha, duelos, premios, ranking, flip de autoridad, outbox/retry, GPS, arreglar que `claimChallenge` no pase por `pointsLog` (inconsistencia frontend preexistente, fuera de alcance).
  Tests: backend 27 nuevos (`ChallengeApiTest` 14 + `ChallengeTest` 13, incluye paridad `ChallengeRules::forDate` vs JS para 4 fechas), 308/308 backend totales sin regresiones, Pint limpio. Frontend 5 nuevos (`AppContext.challengeWriteThrough.test.jsx`), 89/89 totales, lint limpio, build OK. E2E real contra `php artisan serve`: POST `dc-sets`/`2026-08-28` con `reward:99999` del cliente → 201, crédito = 60 (backend); `source_type:"challenge_claim"`; 2º POST → 422 sin doble crédito; `dc-checkin` (no es reto del día) → 422; fecha futura → 422; `dc-validated` → 201/+100; `GET /me/challenge-claims` OK; balance 160; Activity + Check-in siguen verdes.
  Archivos nuevos: `backend/database/migrations/2026_08_28_000004_create_challenge_claims_table.php`, `backend/app/Models/ChallengeClaim.php`, `backend/app/Support/ChallengeRules.php`, `backend/app/Http/Controllers/Api/V1/ChallengeController.php`, `backend/tests/Feature/Api/V1/ChallengeApiTest.php`, `backend/tests/Feature/ChallengeTest.php`, `frontend-usuario/src/state/AppContext.challengeWriteThrough.test.jsx`. Modificados: `backend/routes/api.php` (+1 import, +2 rutas), `backend/app/Models/User.php` (+`challengeClaims()`), `backend/app/Models/PointTransaction.php` (+`REASON_CHALLENGE_CLAIMED`), `frontend-usuario/src/utils/api.js` (+2 funciones), `frontend-usuario/src/state/AppContext.jsx` (`claimChallenge`). Commit: `9541277` (junto con Streak backend).
```

```
FASE: Streak backend autoritativo (solo lectura)
STATUS: CLOSED
Implementation: PASS | Tests dirigidos: PASS | E2E: PASS
Notas: crea la versión backend AUTORITATIVA de la racha, derivada EXCLUSIVAMENTE de `check_ins` (no crea tabla nueva). `GET /me/streak` → `{current_streak, longest_streak}`, ownership solo por `$request->user()`, el cliente no envía nada. Regla (aprobada): día calendario, 1 check-in/día; consecutivos incrementan; día perdido rompe; `current_streak` vivo si el último check-in es hoy o ayer, 0 si tiene 2+ días. `longest_streak` = run consecutivo más largo del historial. NO reemplaza el `streak` local del frontend (que sigue siendo el número visible y sigue sin decrecer), NO alimenta puntos, NO añade `streak_bonus`. Sin ventana de 24h, sin días de descanso, sin GPS.
  Backend: `app/Support/StreakRules.php` (pura, `fromDates`), `app/Http/Controllers/Api/V1/StreakController.php` (`show`). Modificados: `routes/api.php` (+1 import, +1 ruta). Sin modelo/migración nuevos. Frontend: `utils/api.js` (+`apiGetStreak`, sin consumidor — solo deja el endpoint consumible). `Home.jsx` sin tocar; ninguna UI cambia.
  Tests dirigidos: `tests/Unit/StreakRulesTest.php` (7) + `tests/Feature/Api/V1/StreakApiTest.php` (7) = 14/14. Pint limpio. Frontend lint limpio. (Suites completas NO ejecutadas por instrucción — solo los tests de la fase.) E2E: `GET /me/streak` sin check-ins → `{0,0}`; tras check-in de hoy → `{1,1}`; 401 sin token.
  Archivos nuevos: `backend/app/Support/StreakRules.php`, `backend/app/Http/Controllers/Api/V1/StreakController.php`, `backend/tests/Unit/StreakRulesTest.php`, `backend/tests/Feature/Api/V1/StreakApiTest.php`. Modificados: `backend/routes/api.php`, `frontend-usuario/src/utils/api.js` (+`apiGetStreak`). Commit: `9541277` (junto con Challenges write-through).
```

```
FASE: frontend-couch — App del rol Coach (Fase 1)
STATUS: CLOSED
Implementation: PASS | Tests: PASS (lint · 2/2 · build) | E2E: PASS (HTTP directo contra backend real) | E2E visual: PENDIENTE
Notas: Primera app del rol Coach, en `frontend-couch/` (antes placeholder vacío). Creada A PARTIR de `frontend-usuario/` reutilizando template, sistema visual (theme/`App.css`/`components/UI.jsx`), andamiaje de build (Vite 8 + React 19 + Capacitor 8) y patrón de sesión Sanctum — NO es un rediseño, misma identidad visual y arquitectura. NO toca `frontend-usuario/` ni `backend/` (0 modificaciones; solo copias salientes). No hay monorepo — los archivos del sistema visual se copiaron textual y se sincronizan a mano.
  Alcance (todo lo que el backend expone hoy para coach = `CoachAthleteRelationshipController`): Auth (registro/login/logout Sanctum, sin biometría), panel `Home` (recuento de atletas/solicitudes), `Athletes` (solicitar atleta por ID numérico, aceptar/rechazar recibidas, cancelar/terminar), `Profile` (identidad + logout). Estados loading/error/empty. Navegación Home/Atletas/Perfil + botón atrás Android.
  Estado: `src/state/CoachContext.jsx` — versión MÍNIMA del `AppContext` de usuario: solo `auth` (persistida en LocalStorage bajo `STORAGE_KEY` derivada del `appId` de Couch → clave distinta) + `relationships` (no se persiste, se recarga). Sin snapshots por identidad, sin onboarding, sin biometría, sin App Lock. `src/utils/relationships.js` — `groupRelationships` (lógica pura, agrupa por `viewer_role`+`status`, ignora `revoked`) + test.
  Endpoints usados (todos ya existentes en `routes/api.php`, ninguno inventado): `POST /auth/{register,login,logout}`, `GET /auth/me`, `GET/POST /me/coach-relationships`, `POST /me/coach-relationships/{id}/accept`, `DELETE /me/coach-relationships/{id}`.
  Errores HTTP: 0 (red) / 401 (sesión expirada → cierra sesión y vuelve a `<Auth/>`) / 422 (muestra el primer `errors[*]`) traducidos a español en `apiErrorMessage`.
  QA E2E contra `php artisan serve` + MySQL `BIAFYT`: registro, login (creds malas → 422), `/auth/me`, listado vacío, solicitud sin rol coach → 422, solicitud con rol → 201 `pending`, duplicado → 422, atleta inexistente → 422, `viewer_role` correcto en ambos lados, aceptar (solo atleta) → 200 `active`, coach acepta su propia solicitud → 404 (UI nunca expone ese botón al coach), coach revoca activa → 422, atleta revoca → 204, re-solicitud tras revocar → 201 fila nueva. Correcciones aplicadas en QA: empty-state medido sobre grupos vivos (el backend devuelve filas `revoked`), guarda 401 en todas las acciones autenticadas, dedupe de `formatDate`, `auth.js` recortado a lo usado, limpieza del campo ID solo en éxito.
  `npm install` requiere `--legacy-peer-deps` (bug de npm 10.9.4 resolviendo peers de vitest).
  Archivos: todo bajo `frontend-couch/`.
```

```
FASE: Gym UI Foundation (frontend-gym + frontend-gym-web)
STATUS: CLOSED (foundation) — NO es el inicio de la fase de producto Coach/Gym
Discovery: PASS | Implementación: PASS | Tests/lint/build: PASS (ambas apps)
Notas: **bootstrap visual/técnico** de las DOS superficies Gym, autorizado
  explícitamente por el usuario como "Gym UI Foundation" distinta de la Fase 5
  del roadmap. El dominio Gym (Organization/Branch/Members/Staff/Coaches/
  gym_admin, permisos, authz, endpoints, workflows, D5, D8) sigue **diferido**
  a la Fase 5 — ver BIAFYT_BUSINESS_CORE.md §5–§8, §46 (D5/D8), §47.
  - `frontend-gym/`: Gym App móvil. React 19 + Vite 8 + Capacitor 8
    (`appId com.apysoft.gymprofit.gym`). Shell con bottom-tabs (Resumen/Espacio/
    Cuenta), botón atrás Android. `npm install` requiere `--legacy-peer-deps`.
  - `frontend-gym-web/`: Gym Web navegador. React 19 + Vite 8, **sin Capacitor**
    (`app.config.json` en vez de `capacitor.config.json`). Shell web: sidebar
    persistente + topbar + main fluido, grid de tarjetas, esqueleto de tabla,
    responsive (<860px colapsa el sidebar).
  Identidad visual: `theme/colors.js` copiado **verbatim** de `frontend-usuario`
  (misma paleta profundo/claro/turquesa, liquid-glass, tipografía Outfit).
  `App.css` = extracción lean de las primitivas de `frontend-usuario/src/App.css`
  (~300 líneas: glass, .card/.btn/.input/.field/.badge/.stat/.empty + layout),
  NO la copia de 1689 líneas con CSS de workout/duelos/calendario. Subset de
  `components/UI.jsx`. Patrón Auth/Session (Sanctum) = versión mínima del
  `CoachContext` de `frontend-couch`.
  Login: **funcional** contra el contrato `/auth/*` YA existente
  (register/login/logout/me). Autentica un `User` genérico — **NO hay
  verificación de rol/permiso de Gym** (D5 dormante). Documentado en la UI.
  Todas las pantallas de dominio Gym son **placeholders** explícitos
  ("Pronto" / notas de andamiaje) — cero datos reales, cero workflows.
  NO se creó: endpoint, modelo, migración, policy, authz, router library,
  monorepo/shared package. NO se modificó `frontend-usuario/`, `frontend-couch/`
  ni `backend/` (solo copias salientes). Decisiones nuevas: navegación por
  estado (sin router, convención de la casa); `frontend-gym-web` sin
  `capacitor.config.json`.
  Tests: `frontend-gym` 6 (5 api + 1 smoke), `frontend-gym-web` 6. Lint limpio
  y `vite build` OK en ambas. E2E visual en navegador PENDIENTE (extensión de
  Chrome no disponible), mismo criterio que la QA de `frontend-couch`.
  Archivos: todo bajo `frontend-gym/` y `frontend-gym-web/`.
```

```
FASE: 2 — MVP Producción / Deploy
STATUS: 🟡 BLOCKED (infra) — NO desplegado, NO CLOSED, NO READY
Discovery: PASS (2 rondas) | Etapa 0 (prep del repo): PASS | Hardening discovery: PASS (`docs/PRODUCTION_HARDENING_DISCOVERY.md`) | Hardening F1–F4: IMPLEMENTADOS | Etapas 1–2 (ejecución): BLOCKED por infra
Notas: siguiente fase del roadmap tras la Consolidación post-D1. NO desarrolla
  features de producto (§47 Business Core).
  ACTUALIZACIÓN: el lazo funcional Cliente → Coach → Gym YA existe (Coach MVP
  `aed5490` + Gym MVP `91a2653`, ambos CLOSED). 2ª ronda de discovery de
  producción/hardening registrada en **`docs/PRODUCTION_HARDENING_DISCOVERY.md`**.
  **HARDENING F1–F4: IMPLEMENTADO** (commit `93b0271`, en `main`). Ver el detalle
  en `## ESTADO MVP` arriba. Resumen:
  - F1 — limiter con nombre `api` (`AppServiceProvider::boot()`, 120/min por
    user o IP) + `throttleApi()` en `bootstrap/app.php`; `auth 6,1` intacto y
    sin colisión de contador.
  - F2 — `bootstrap/app.php`: `shouldRenderJsonWhen(fn () => true)` +
    `redirectGuestsTo(fn () => null)` (necesario para no resolver
    `route('login')` eagerly → 500). Guest sin `Accept` → 401 JSON.
  - F3 — `DatabaseSeeder` omite `test@example.com` cuando `APP_ENV=production`.
  - F4 — `app/Console/Commands/GrantGymAdmin.php` (`BIAFYT:grant-gym-admin`),
    idempotente, ops-only (no endpoint, D-GYM-3/8 intactas).
  - F5 — NO implementado (opcional/higiene).
  Tests: `ProductionHardeningTest` (6) + `GrantGymAdminCommandTest` (6). 426/426
  backend, Pint limpio en archivos tocados. 3 frontends re-validados (97/7/19).
  Archivos hardening: `backend/bootstrap/app.php`, `backend/app/Providers/AppServiceProvider.php`,
  `backend/database/seeders/DatabaseSeeder.php` (modificados);
  `backend/app/Console/Commands/GrantGymAdmin.php`,
  `backend/tests/Feature/{ProductionHardeningTest,GrantGymAdminCommandTest}.php`,
  `docs/PRODUCTION_HARDENING_DISCOVERY.md` (nuevos); `DEPLOY.md`, `PROJECT_STATE.md`.
  **DECISIÓN DE ALCANCE TOMADA:** la 1ª producción = `backend/` (`api.`) +
  `frontend-usuario/` (`app.`) + `frontend-couch/` (`coach.`) +
  `frontend-gym-web/` (`gym.`), web-only, subdominios separados → ningún
  frontend necesita `vite base`. **`frontend-gym` móvil/Capacitor FUERA de
  alcance** (D-GYM-6). CORS (`allowed_origins: ['*']`) y tokens Sanctum
  (`expiration: null`) se mantienen para el MVP. `ExerciseSeeder` se ejecuta en
  prod posteriormente a la primera puesta en marcha. Recuperación de contraseña
  NO se implementa (mail = `log`).
  Discovery de producción: código de las 5 superficies compila y pasa tests;
  configuración backend 100% env-driven con defaults sanos; `config:cache` /
  `route:cache` OK; **ningún secreto en git** (solo `.env.example`; `backend/.env`
  untracked+gitignored); sin URLs/valores hardcodeados en src; sin
  `console.log`/`debugger`. Ninguna frontend tiene ErrorBoundary (hardening
  opcional, no bloquea). `frontend-usuario/android/` committeado (no se usa en
  web-only).
  Etapa 0 ejecutada: `DEPLOY.md` ampliado (alcance de la 1ª producción +
  subdominios + `npm ci` + `ExerciseSeeder` posterior + superficies posteriores);
  `frontend-usuario/yarn.lock` eliminado (`git rm`) + `frontend-usuario/CLAUDE.md`
  a npm-only; `backend/CLAUDE.md` corregido (frontend-gym/frontend-gym-web ya no
  "empty placeholder"). Validado: `frontend-usuario` lint / 97 tests / build OK;
  backend `php artisan test` 353/353 + `config:cache`/`route:cache` OK. Sin
  cambios de código de negocio, endpoints, modelos, migraciones ni policies.
  Bloqueo restante (BLOCKED — infra/credencial/decisión externa): host PHP 8.2+,
  MySQL 8+/MariaDB 10.6+, dominio + subdominios, hosting estático × N con
  fallback SPA, TLS, ejecutor con acceso a infra, backups MySQL, agregación de
  logs, `APP_KEY` de prod. Ver `docs/PRODUCTION_HARDENING_DISCOVERY.md` §1 y §7.
  Contradicción `frontend-gym` (web vs móvil): **RESUELTA** en el slice Gym MVP
  (D-GYM-9) — `frontend-gym` = móvil/Capacitor, `frontend-gym-web` = web.
  Rondas de esta fase:
  - Discovery publish: `docs/PRODUCTION_HARDENING_DISCOVERY.md` (nuevo), `PROJECT_STATE.md`. Sin código.
  - **Hardening F1–F4** (`93b0271`): F1 (`bootstrap/app.php` + `AppServiceProvider`), F2 (`bootstrap/app.php`), F3 (`DatabaseSeeder`), F4 (`GrantGymAdmin` command) + 2 test files. `DEPLOY.md` reescrito al alcance de 4 artefactos (`api.`/`app.`/`coach.`/`gym.`) + bootstrap gym_admin + backups + rollback + smoke E2E + prohibición de `db:seed` pelado. 426/426 backend, 3 frontends verdes.
  - **Cierre de Fase 2 / READY FOR INFRA** (parte del commit `e1be4f6`, mergeado a `main` en `80e0057`): junto con el slice D-GYM-ONBOARDING, `DEPLOY.md` + `docs/PRODUCTION_HARDENING_DISCOVERY.md` re-actualizados al alcance de **5 artefactos** (añade `frontend-admin` → `admin.<dominio>`), **24 migraciones**, bootstrap del primer BIAFYT Admin (`BIAFYT:grant-platform-admin`), smoke E2E ampliado con el flujo de onboarding (pasos 0–34). `frontend-admin/.env.example` corregido para prod. **452 backend + Pint verde**, 4 frontends verdes.
  - **Post-consolidación** (en `main`, commits `chore`/`docs`): `20ed683` (elimina el árbol legacy monolítico de la raíz), `353aebd` (README raíz multi-app), `004ba5b` + `0f1c467` (sync de docs con el estado real).
  - **Slice D-CLIENT-COACH** (`8961a73`): cierra el lado del atleta del lazo Coach — ver `FASE: Cliente ↔ Coach`. Con él, el lazo MVP completo Cliente → Coach → Gym quedó **validado E2E contra el backend local real** (smoke de 9 pasos, PASS).
  Estado: la ejecución del deploy sigue **BLOCKED por infra**; el código ya no
  tiene FIX pendientes obligatorios (F5 opcional). **READY FOR INFRA.** Pendiente
  a nivel git: `git push` de `8961a73` a `origin` + tag `fase-2-mvp-ready-for-infra`
  (desde la terminal con acceso al remoto — desde este entorno `origin` da
  `Repository not found`).
```

```
FASE: Puntos — paridad de racha en backend (preparación del flip de autoridad)
STATUS: CLOSED
Implementation: PASS | Tests: PASS | E2E: PASS
Notas: primer paso del bloque "Puntos" del empuje a MVP real (Producción → Puntos → Rewards → Ranking → QA). Decisión de diseño aprobada por el usuario: NO flippear todavía el número visible al backend — Duelos y Premios mutan `user.points` localmente y el backend no los conoce (Duelos queda fuera de alcance del MVP; Premios es el bloque siguiente). Flippear ahora habría sido una regresión real (ganar un duelo o canjear un premio dejaría de reflejarse). Este bloque solo cierra la brecha de paridad que SÍ era resolvible ahora: el bono de racha en el crédito de entreno.
  `PointRules::forActivity(sets, exercises, streak = 0)` ahora replica `computeWorkoutPoints` del frontend exacto: `min(600, sets*6 + exercises*12 + min(100, streak*10))`. Nuevas constantes `STREAK_BONUS=10`, `STREAK_CAP=100` (mirror de `POINT_RULES.streakBonus`/`streakCap`). `streak` es un hecho de sesión enviado por el cliente (mismo modelo de confianza YA existente para `sets_completed`/`exercises_completed`: el backend no valida su veracidad, solo su forma) — deliberadamente NO se sustituye por `GET /me/streak` (backend, autoritativa) porque esa racha tiene semántica distinta (se rompe con un día perdido; la local del frontend nunca decrece) y usarla habría cambiado qué significa el número, no solo su fuente.
  `StoreActivityRequest`: +`'streak' => ['nullable','integer','min:0']` (opcional, default 0 en el controller — compatibilidad con clientes que no lo envían). `ActivityController::store` pasa `(int)($validated['streak'] ?? 0)` a `PointRules::forActivity`.
  Frontend: `buildActivityPayload(activity, now, streak = 0)` (+3er parámetro) agrega `streak` clampado a `POST /me/activities`. `AppContext#addActivity` le pasa `state.identity.user.streak` (la racha local visible, NO la de backend) — sin tocar `Workout.jsx` (protegido): la racha se lee dentro de `AppContext`, no en el objeto `activity` que arma la pantalla.
  Con esto, el ledger backend ahora tiene paridad exacta con el frontend para las 3 fuentes que ya audita (`workout_completed` con bono de racha, `checkin` +20 fijo, `challenge_claimed` con reward calculado igual) — la única divergencia de saldo restante viene de Duelos y Premios, ninguno en el ledger todavía.
  Tests: backend +8 (`PointRulesTest`, bono/tope/negativo) + 2 (`ActivityApiTest`, con y sin `streak` end-to-end) = 329/329 backend sin regresiones, Pint limpio. Frontend +3 (`api.test.js` +2, `AppContext.activityWriteThrough.test.jsx` +1 con racha real vía `checkIn`) = 92/92 sin regresiones, lint limpio, build OK. E2E real contra `php artisan serve`: `POST /me/activities` con `sets=3,exercises=2,streak=5` → `points_awarded:92` (18+24+50); `GET /me/points` → `balance:92`.
  Sin cambios de UI, sin flip todavía: el número visible sigue siendo LocalStorage. Sin tocar Workout.jsx/Analytics.jsx/stateSchema.js. Sin FormRequest/Resource/Policy nuevos.
  Archivos modificados: `backend/app/Support/PointRules.php`, `backend/app/Http/Requests/StoreActivityRequest.php`, `backend/app/Http/Controllers/Api/V1/ActivityController.php`, `backend/tests/Unit/PointRulesTest.php`, `backend/tests/Feature/Api/V1/ActivityApiTest.php`, `frontend-usuario/src/utils/api.js`, `frontend-usuario/src/utils/api.test.js`, `frontend-usuario/src/state/AppContext.jsx`, `frontend-usuario/src/state/AppContext.activityWriteThrough.test.jsx`. Commiteado en el cierre D1 del working tree (Rewards + paridad de racha + skills/agent + `DEPLOY.md` en un solo snapshot).
```

```
FASE: Rewards — persistencia backend (RewardClaim + débito en ledger)
STATUS: CLOSED
Implementation: PASS | Tests: PASS | E2E: PASS
Notas: 2º paso del bloque "Rewards" del empuje a MVP real (Producción → Puntos → Rewards → Ranking → QA). LocalStorage sigue siendo la fuente VISIBLE de premios (`user.rewards`, `user.points`) — mismo criterio write-through sombra que Activity/CheckIn/Challenge, NO el flip de autoridad completo (ese sigue pendiente, ver fase "Puntos — paridad de racha"). A diferencia de Challenge (que no verifica nada), este endpoint SÍ hace una validación real: el saldo se comprueba contra EL PROPIO ledger del backend antes de debitar — la primera vez que el backend rechaza una escritura por integridad de negocio (no solo por forma).
  4º `reason` del ledger (`reward_claimed`, monto NEGATIVO — primer débito real; `PointTransaction.amount` ya estaba diseñado con signo desde la fase Activity+Points). `RewardClaim`(id, user_id FK cascade, prize_id string, reward_uid string, cost integer, timestamps; `UNIQUE(user_id, reward_uid)`). `reward_uid` es el `uid` LOCAL que ya genera el frontend (`r-${Date.now()}`) para cada reward creado — se reutiliza como clave de idempotencia (evita doble débito ante un reintento del MISMO canje), NUNCA como límite de "una vez por prize" (el mismo prize puede canjearse de nuevo con un `reward_uid` distinto, si el saldo alcanza).
  `app/Support/RewardRules.php`: `TEMPLATES` (10 premios `{id, cost}`, port verbatim de `data/prizes.js#prizeCatalog` — MISMOS 10, sin recortar a un subconjunto), `costFor(id): ?int`. Los 3 premios con `cost:0` (desbloqueados por rank/duelos, no por puntos) también son reclamables aquí — un débito de 0 es inocuo; su condición de desbloqueo NO se verifica (igual gap aceptado que `ChallengeRules` con la completitud).
  `RewardController`:
  - `POST /me/reward-claims` (body `{prize_id, reward_uid}`): `prize_id` desconocido → 422; `reward_uid` ya usado por este user → 422 (idempotencia); `cost > SUM(point_transactions.amount)` del propio ledger → **422 "saldo insuficiente"** (única validación de negocio real de esta fase — el resto de los `store()` de fases previas solo validan forma/pertenencia). Si OK: `DB::transaction` crea `RewardClaim` + `PointTransaction(amount: -cost, reason: reward_claimed, idempotency_key: "reward:{user}:{reward_uid}")`. `cost`/`amount`/`points`/`user_id` del cliente se IGNORAN — el costo SIEMPRE sale de `RewardRules::costFor`.
  - `GET /me/reward-claims`: solo del caller, más recientes primero, sin paginar (misma deuda que el resto).
  Frontend (`AppContext#claimPrize` — NO protegida): conserva EXACTAMENTE su escritura LocalStorage. **Bug real encontrado y corregido durante esta fase** (no solo un artefacto de test): la implementación ORIGINAL decidía el resultado (`ok`) y generaba el `uid` DENTRO del callback de `setState`, asumiendo ejecución síncrona inmediata — igual que Activity/CheckIn/Challenge ya evitan deliberadamente (ver sus comentarios "chequeo síncrono desde el `state` actual"). Al agregar la llamada al backend gateada por esa `ok` interna, quedó demostrado (con test + logging dirigido) que tras 2+ acciones `act()` previas en secuencia, React NO garantiza que el callback de `setState` corra de forma síncrona antes de leer `ok` — el canje local SÍ ocurría correctamente, pero la copia sombra al backend simplemente NO se disparaba. Fix: `claimPrize` ahora calcula `canClaim` y genera el `uid` de forma síncrona contra el `state` EXTERNO (mismo patrón que `checkIn`/`checkOut`/`claimChallenge`), y el `setState` interno se limita a aplicar la misma mutación local de siempre reutilizando ese `uid` ya fijado — sin depender de que el updater corra en un momento predecible.
  `apiClaimReward(token, prizeId, rewardUid)` envía SOLO esos 2 campos — el `cost` NUNCA viaja. Un fallo (incluida una 422 real por saldo insuficiente en el ledger backend — posible porque Duelos aporta puntos locales que el backend no conoce, ver fase "Puntos") se traga en silencio, sin reintento ni cola, sin afectar el canje local ya concedido.
  Fuera de alcance deliberado: `useReward`/`giftReward` (usar o regalar un reward ya adquirido) — no gastan puntos ni tienen riesgo de saldo, quedan 100% locales. Verificación de la condición de desbloqueo (rank/duelos) — sigue solo en el frontend. El "flip" real de autoridad del saldo — sigue diferido a después de que Puntos+Rewards+Duelos tengan paridad completa (Duelos queda fuera de este empuje a MVP).
  Tests: backend +24 (`RewardRulesTest` unit 3, `RewardClaimTest` dominio 6, `RewardApiTest` 15 — incluye saldo exacto, saldo insuficiente, saldo que alcanza para 1 pero no 2, reintento de idempotencia, prize de costo 0) = 353/353 backend sin regresiones, Pint limpio. Frontend +5 (`AppContext.rewardWriteThrough.test.jsx`) = 97/97 sin regresiones, lint limpio, build OK. E2E real contra `php artisan serve` (incluyó aplicar la migración pendiente a la BD dev local, batch 13): activity con streak=0/sets=100 → +600 balance; claim `pz-clase-gratis`(600) → 201, débito -600, balance 0; reintento mismo `reward_uid` → 422; segundo claim sin saldo → 422; `GET /me/reward-claims` OK.
  Archivos nuevos: `backend/database/migrations/2026_09_06_000001_create_reward_claims_table.php`, `backend/app/Models/RewardClaim.php`, `backend/app/Support/RewardRules.php`, `backend/app/Http/Controllers/Api/V1/RewardController.php`, `backend/tests/Unit/RewardRulesTest.php`, `backend/tests/Feature/RewardClaimTest.php`, `backend/tests/Feature/Api/V1/RewardApiTest.php`, `frontend-usuario/src/state/AppContext.rewardWriteThrough.test.jsx`. Modificados: `backend/routes/api.php` (+1 import, +2 rutas), `backend/app/Models/User.php` (+`rewardClaims()`), `backend/app/Models/PointTransaction.php` (+`REASON_REWARD_CLAIMED`), `frontend-usuario/src/utils/api.js` (+`apiClaimReward`/`apiGetRewardClaims`), `frontend-usuario/src/state/AppContext.jsx` (`claimPrize`, con el fix de sincronía descrito arriba). Commiteado en el cierre D1 del working tree (Rewards + paridad de racha + skills/agent + `DEPLOY.md` en un solo snapshot).
```

```
FASE: Coach MVP — información del atleta + notas (slice D-COACH)
STATUS: CLOSED
Discovery: PASS | Decisión de negocio (D-COACH-1..5): APROBADA por el usuario | Implementation: PASS | Tests backend anti-IDOR: PASS | lint/test/build frontend-couch: PASS | E2E HTTP: PASS
Notas: **adelanta el bloque Coach/Gym** respecto al roadmap D6/D8 previo (ver
  BIAFYT_BUSINESS_CORE.md §46 D-COACH). Cierra el lazo mínimo
  **Coach → atleta → información real → nota → persistencia** SOBRE la
  foundation (`frontend-couch` Fase 1) y la relación de consentimiento ya
  existentes. NO implementa: programas/asignaciones, dominio Gym, autoridad
  nueva de puntos, cambios en `frontend-usuario`, cambios en `GymAssignment`,
  roles nuevos, búsqueda de usuarios.
  Decisiones aprobadas (D-COACH-1..5): (1) adelantar Coach MVP; (2) aceptar
  los datos del atleta como **sombra/best-effort** (Profile autoritativo;
  actividad/puntos/racha vienen del write-through best-effort de la app de
  usuario y pueden tener huecos offline); (3) un coach con relación `active`
  puede LEER `Profile` + resumen de actividad + racha (`StreakRules`) +
  saldo de puntos del atleta; (4) la acción del MVP es una **nota/feedback**
  de texto libre (`CoachNote`), que el atleta NO recibe todavía; (5) el rol
  `coach` se sigue concediendo a mano en la BD y el atleta se sigue
  solicitando por ID numérico.
  Backend: gate `CoachAthleteRelationship::activeBetween(coachId, athleteId)`
  (relación `active`; anti-IDOR: 404 siempre, nunca 403; scoping por
  `$request->user()->id`). `CoachAthleteController`:
  - `GET /me/coach/athletes` — atletas con relación `active` del coach
    (`{athlete:{id,name}, since}`); excluye pending y revoked.
  - `GET /me/coach/athletes/{athleteUserId}` — `{athlete, profile|null,
    activity_summary{count,last_activity_at,total_sets,total_exercises,
    total_duration_seconds,recent[≤10]}, streak{current,longest},
    points{balance}}`. Reutiliza `StreakRules::fromDates` y
    `SUM(point_transactions.amount)` — sin cálculo nuevo ni autoridad nueva.
  - `GET /me/coach/athletes/{athleteUserId}/notes` — notas que ESTE coach
    escribió sobre ESE atleta, requiere relación `active`.
  - `POST /me/coach/athletes/{athleteUserId}/notes` — body `{body}` (req,
    string, max 2000); `coach_user_id` del token, `athlete_user_id` de la
    ruta — nunca del body. Requiere relación `active`.
  - `DELETE /me/coach/notes/{note}` — solo el coach autor (`404` si es de
    otro coach o no existe); NO exige que la relación siga `active` (borrar
    tu propia nota toca solo tus datos — interpretación de D-COACH-4,
    señalada, no una regla de negocio nueva).
  `coach_notes`(id, coach_user_id FK cascade, athlete_user_id FK cascade,
  body text, timestamps; index(coach_user_id, athlete_user_id)). Sin UNIQUE
  (varias notas por par). `CoachNote` (belongsTo coach/athlete; ambos ids
  hidden). Sin FormRequest/Resource/Policy/Service nuevos.
  Frontend-couch: `api.js` (+5: `apiGetCoachAthletes`, `apiGetAthleteDetail`,
  `apiGetAthleteNotes`, `apiCreateAthleteNote`, `apiDeleteAthleteNote`).
  `CoachContext` (+4 acciones `getAthleteDetail`/`getAthleteNotes`/
  `createAthleteNote`/`deleteAthleteNote`, envueltas en `runAuthed` para el
  guard de 401; el detalle NO se guarda en el contexto, es por-pantalla).
  `utils/athlete.js` (`profileRows` + `formatDuration`, puros, con test).
  Nueva pantalla `AthleteDetail.jsx` (racha/récord/puntos, perfil, actividad
  reciente, notas + textarea, aviso de datos sombra). `App.jsx` (navegación
  `athleteDetail` + botón atrás Android). `Athletes.jsx` (atletas activos
  ahora son tarjetas que abren el detalle; `onOpenAthlete`).
  Tests: backend `CoachAthleteApiTest` 19 nuevos (gate: sin relación /
  pending / revoked / otro coach → 404; payload; `profile` sin fugas de
  email/ids; notas scoped por coach+atleta; borrado propio vs ajeno). 372/372
  backend totales sin regresiones, Pint limpio. Frontend-couch: lint limpio,
  7/7 tests (`relationships.test.js` 2 + `athlete.test.js` 5 nuevos), build OK.
  E2E HTTP real contra `php artisan serve` + MySQL `BIAFYT` (migración
  `2026_09_06_000002` aplicada, batch 14): sin relación → `GET athletes` 200
  vacío / `GET athlete/{id}` 404; pendiente → 404; tras aceptar → detalle con
  profile+actividad (points_awarded 162)+streak+balance 182; `GET
  /me/coach/athletes` lista al atleta; nota 201 (ids del body ignorados),
  body vacío 422, `GET notes` scoped, `DELETE` propia 204 / repetida 404 /
  de otro coach 404 / por el atleta 404; outsider a detalle/notas 404;
  tras revocar la relación → detalle 404 y la lista queda vacía.
  Nota pre-existente (no regresión): una petición sin `Accept: application/json`
  y sin token da 500 (redirect al route `login` inexistente) — mismo
  comportamiento que todo el resto de la API; `frontend-couch/src/utils/api.js`
  siempre envía `Accept: application/json` (401 correcto).
  Archivos nuevos: `backend/database/migrations/2026_09_06_000002_create_coach_notes_table.php`,
  `backend/app/Models/CoachNote.php`,
  `backend/app/Http/Controllers/Api/V1/CoachAthleteController.php`,
  `backend/tests/Feature/Api/V1/CoachAthleteApiTest.php`,
  `frontend-couch/src/screens/AthleteDetail.jsx`,
  `frontend-couch/src/utils/athlete.js`,
  `frontend-couch/src/utils/athlete.test.js`.
  Modificados: `backend/routes/api.php` (+1 import, +5 rutas),
  `backend/app/Models/User.php` (+2 relaciones),
  `backend/app/Models/CoachAthleteRelationship.php` (+`activeBetween()`),
  `frontend-couch/src/utils/api.js`, `frontend-couch/src/state/CoachContext.jsx`,
  `frontend-couch/src/App.jsx`, `frontend-couch/src/screens/Athletes.jsx`.
  Commit: `aed5490` (rama `feat/coach-gym-mvp`).
  NOTA post-cierre: la fase Gym MVP (D-GYM) extrajo el snapshot de `show()` a
  `App\Support\AthleteSnapshot` — `CoachAthleteController::show` ahora es
  `return response()->json(AthleteSnapshot::for($athlete))`; respuesta
  byte-idéntica, verificada por `CoachAthleteApiTest` (19/19) y por un test
  cruzado en `GymAdminApiTest` (`assertSame($coachView, $gymView)`).
```

```
FASE: Gym MVP — gestión de miembros/coaches + estado del miembro (slice D-GYM)
STATUS: CLOSED
Discovery: PASS | Decisión de negocio (D-GYM-0..9): APROBADA por el usuario | Implementation: PASS | Tests backend anti-IDOR: PASS (42 nuevos) | lint/test/build frontend-gym-web: PASS | E2E HTTP (19 pasos): PASS
Notas: **adelanta el bloque Coach/Gym** por delante del Bloque Puntos y de
  Ranking, y **revisa D5** (ver `BIAFYT_BUSINESS_CORE.md` §46 D-GYM).
  Cierra el lazo **gym_admin → gestiona miembros/coaches → coach funciona →
  atleta entrena → gym_admin ve el estado sombra del miembro**, SOBRE
  `Gym`/`Branch`/`GymAssignment` y la foundation `frontend-gym-web` ya
  existentes. **CERO migraciones, CERO modelos nuevos.**
  Decisiones aprobadas (D-GYM-0..9): (0) activar `gym_admin` + adelantar el
  slice; (1) Gym MVP = ver miembros + ver coaches + estado mínimo del
  miembro + alta/revocación de member/coach; (2) solo `gym_admin`
  administra; (3) `gym_admin` inicial = bootstrap manual (tinker), sin
  endpoint; member/coach por API/UI; `gym_admin`/`staff` NUNCA por API; (4)
  Opción A — el gym_admin añade por email, `frontend-usuario` SIN tocar; (5)
  mismo snapshot sombra que Coach MVP; (6) SOLO `frontend-gym-web` (la app
  móvil `frontend-gym` queda para fase posterior); (7) Programs/Workouts/
  asignaciones 100% fuera; (8) sin endpoint de creación de Gym/gym_admin;
  (9) corregida la contradicción documental (`frontend-gym` = móvil/
  Capacitor, `frontend-gym-web` = web).
  Backend (`GymAdminController`, `auth:sanctum`; gate privado
  `assertGymAdmin` = `GymAssignment` activo `role=gym_admin` en el `{gym}`
  de la RUTA; anti-IDOR: 404 siempre, nunca 403; `gym_id` jamás del body;
  sin route-model-binding; params `{gym}`/`{id}`/`{userId}` numéricos-only
  vía `Route::whereNumber`):
  - `GET /me/gym/{gym}/members` · `.../coaches` — assignments `member` /
    `coach` ACTIVOS del gym: `{id, user{id,name}, role, branch{id,name}|null,
    since}`. Excluye `inactive` y otros roles. No filtra email.
  - `GET /me/gym/{gym}/user-lookup?email=` — match EXACTO → `{user:{id,name}}`;
    404 si no hay match (no revela existencia) o si el caller no es admin.
    Nunca devuelve el email. No es un `GET /users/{id}` general.
  - `POST /me/gym/{gym}/assignments` — body `{user_id, role:"member"|"coach",
    branch_id?}`. `role∉{member,coach}` → 422 (`gym_admin`/`staff`
    rechazados). `user_id` validado `exists:users,id`. `branch_id` (si viene)
    debe pertenecer al `{gym}`; `member` exige `branch_id` (regla de dominio
    de `GymAssignment`, pre-chequeada → 422 limpio, nunca el `DomainException`
    crudo). Duplicado activo → 422; una asignación `inactive` con la misma
    key se reactiva en el mismo registro (200). `catch(QueryException)` →
    422 como última línea (mismo patrón que `GymAssignmentController::store`).
  - `DELETE /me/gym/{gym}/assignments/{id}` — solo assignments `member`/
    `coach` ACTIVOS del `{gym}`; revocar = `status→inactive`, nunca hard
    delete. Ajeno / de otro gym / `gym_admin` / ya `inactive` → 404.
  - `GET /me/gym/{gym}/members/{userId}` — **doble gate**: caller = gym_admin
    del `{gym}` Y `{userId}` = `member` ACTIVO del `{gym}` (cualquiera que
    falle → 404; el `userId` de la URL nunca salta el gate). Devuelve
    `AthleteSnapshot::for($member)` — **mismo shape exacto que
    `GET /me/coach/athletes/{id}`**. Sin autoridad de puntos nueva, sin
    tocar `Activity`/`PointTransaction`/`CheckIn`, sin exponer email.
  `App\Support\AthleteSnapshot` extraído (ver NOTA en la fase Coach MVP).
  Sin FormRequest/Resource/Policy/Service nuevos. `GymAssignment.php` /
  `ROLE_RANK` / `activeFor()` / `booted()` intactos (ningún test demostró
  incompatibilidad). `CoachAthleteRelationship`/`CoachNote` intactos salvo
  el uso compartido del snapshot.
  Frontend-gym-web: `api.js` (+8 funciones: assignments/gyms/members/
  coaches/lookup/create/revoke/memberDetail). `SessionContext`: tras
  confirmar sesión consulta `GET /me/gym-assignments` y deriva los gyms
  `gym_admin` (`utils/gym.js#adminGymsFrom` — filtro por rol, dedupe,
  orden determinista nombre→id); `gym_id` NUNCA de LocalStorage; sin
  `gym_admin` activo → estado `none`. `selectGym` para multi-gym. `utils/
  gym.js` (`dedupeById`, `adminGymsFrom`, `profileRows`, `formatDuration`,
  `formatDate` — puras, con test). Pantallas: `NoGymAccess` (sin rol →
  mensaje + reintentar/logout, sin shell, sin datos de ningún gym),
  `Workspace` (alta por email → rol → sede; tablas de miembros/coaches con
  revocar + confirmación en `Modal`; abre `MemberDetail`), `MemberDetail`
  (`Modal` con el snapshot sombra; NO muestra email/ubicación/rewards/
  duelos/notas del coach), `Overview` (cifras reales: sedes/miembros/
  coaches). `App.jsx` gatea `loading`/`none`/shell. `Sidebar`/`Account`
  actualizados (rol gym_admin real).
  Tests: backend `GymAdminApiTest` 42 nuevos (gate por gym; `gym_admin`
  inactivo → 404; admin de otro gym → 404; segmento no-numérico → 404;
  `role` gym_admin/staff → 422; `branch` de otro gym → 422; `gym_id` del
  body ignorado; duplicado/reactivación; revoke member/coach/ajeno/gym_admin/
  repetido; doble gate de `memberDetail`; `profile` null; snapshot idéntico
  al de Coach; revocar membresía NO toca `CoachAthleteRelationship`).
  **414/414 backend** (372 + 42), Pint limpio. `CoachAthleteApiTest` 19/19
  intacto tras el refactor. Frontend-gym-web: lint limpio, **19/19 tests**
  (`gym.test.js` 11 + `api.test.js` 5 + `App.test.jsx` 3, incl. "sin
  gym_admin → Sin acceso de Gym" y "con gym_admin → entra al shell"), build
  OK.
  E2E HTTP real contra `php artisan serve` + MySQL `BIAFYT` (19 pasos):
  bootstrap tinker (Gym KAIROS + Branch Norte + A gym_admin); A ve su gym;
  A lookup B/C por email → `{id,name}`; A concede coach a B (201) y member a
  C en Norte (201); B (rol coach) solicita a C → C acepta; C entrena
  (`+116`) + check-in (`+20`) + perfil; B ve a C por Coach MVP (`balance
  136`) + deja nota; A `GET members` → C, `GET coaches` → B, `GET
  members/{C}` → snapshot completo sin email; A revoca la membresía de C
  (204) → `members/{C}` 404, C fuera de la lista, revoke repetido 404; A no
  puede borrar el assignment de OTRO gym (404) ni listar sus miembros (404);
  B sigue funcionando como coach (`GET /me/coach/athletes` lista a C,
  detalle 200); **la `CoachAthleteRelationship` sigue `active`** tras
  revocar la membresía. Anti-IDOR extra verificado: `role=gym_admin`/`staff`
  → 422, `member` sin branch → 422, no-admin → 404, unauth+Accept → 401.
  Fuera de alcance (D-GYM-7 / NO TOCAR): Programs/Workouts/asignaciones de
  workout, dominio Gym completo (Organization, `Gym` con lat/lng/etc.),
  `staff`, concesión de `gym_admin` por API, creación de Gym por API/UI,
  Ranking, autoridad de puntos, Billing, `frontend-gym` móvil, cualquier
  cambio en `frontend-usuario`/`frontend-couch`/`data/gyms.js`/GPS/archivos
  protegidos.
  Archivos nuevos: `backend/app/Support/AthleteSnapshot.php`,
  `backend/app/Http/Controllers/Api/V1/GymAdminController.php`,
  `backend/tests/Feature/Api/V1/GymAdminApiTest.php`,
  `frontend-gym-web/src/screens/{NoGymAccess,Workspace,MemberDetail}.jsx`,
  `frontend-gym-web/src/utils/{gym.js,gym.test.js}`.
  Modificados: `backend/routes/api.php` (+1 import, +6 rutas en grupo
  `whereNumber`), `backend/app/Http/Controllers/Api/V1/CoachAthleteController.php`
  (refactor a `AthleteSnapshot`), `frontend-gym-web/src/utils/api.js`,
  `frontend-gym-web/src/state/SessionContext.jsx`,
  `frontend-gym-web/src/App.jsx`, `frontend-gym-web/src/App.test.jsx`,
  `frontend-gym-web/src/screens/{Overview,Account}.jsx`,
  `frontend-gym-web/src/components/Sidebar.jsx`.
```

```
FASE: Gym Onboarding + BIAFYT Admin (slice D-GYM-ONBOARDING)
STATUS: CLOSED
Discovery: PASS | Decisión de negocio (D-GYM-ONB-1..7): APROBADA por el usuario (spec) + asunciones ⚠ marcadas | Implementation: PASS | Tests backend: PASS (28 nuevos) | lint/test/build de los 4 frontends: PASS
Notas: **revisa D-GYM-8** (ya NO "bootstrap solo por tinker": hay un flujo
  de alta usuario→admin). Cierra el lazo comercial mínimo:
  usuario SOLICITA registrar su Gym → un **BIAFYT Admin** (autoridad de
  PLATAFORMA, distinta de `gym_admin`) aprueba/rechaza → aprobar crea
  atómica e idempotentemente `Gym` + `Branch` principal +
  `GymAssignment(gym_admin, active)` → el usuario administra su Gym desde
  Gym Web (que ya deriva `gym_admin` de `GET /me/gym-assignments` — **CERO
  cambios en frontend-gym-web**).

  AUTORIDAD DE PLATAFORMA: booleano `users.is_platform_admin` (migración
  `2026_09_07_000001`), SEPARADO de `GymAssignment` — no es rol de gym, no
  vive en `gym_assignments`. `casts()` `'boolean'`, NO en `$fillable`. Se
  concede solo por ops: `php artisan BIAFYT:grant-platform-admin {email}
  [--revoke]` (idempotente, exit 1 si el user no existe, espeja
  `BIAFYT:grant-gym-admin`). NUNCA endpoint, NUNCA UI, NUNCA
  autoasignable. `AuthController::me` ya serializa el flag (cast, no
  `$hidden`).

  MODELO `GymRegistrationRequest` (migración `2026_09_07_000002`):
  `user_id`, `status` (pending|approved|rejected, sin UNIQUE en BD),
  `gym_name`, `branch_name`, `applicant_message?`, `review_note?`,
  `reviewed_by_user_id?`, `reviewed_at?`, `gym_id?`. Máquina de estados =
  mismo patrón que `CoachAthleteRelationship`: "no dos pending por usuario"
  a nivel de aplicación (`->where('status','pending')->exists()` → 422);
  tras `rejected` se puede volver a solicitar (fila nueva). `$hidden`
  [user_id, reviewed_by_user_id]. Relaciones `applicant`/`reviewer`/`gym`.

  ENDPOINTS (todos `auth:sanctum`, prefijo `/api/v1`):
  Usuario (`GymRegistrationRequestController`):
  - `POST /me/gym-registration-request` — crea (status forzado a `pending`;
    ignora `status`/`user_id`/`gym_id` del cliente). Valida `gym_name`
    (req, ≤255), `branch_name` (req, ≤255), `applicant_message` (opt,
    ≤2000). 2º pending → 422.
  - `GET /me/gym-registration-request` — solo las propias, `orderByDesc(id)`.
    `mapRequest`: `{id, status, gym_name, branch_name, applicant_message,
    review_note, reviewed_at, gym:{id,name}|null, created_at}` — **NUNCA**
    `user_id`, identidad del revisor ni emails.
  Admin (`Admin\GymRegistrationRequestController`, `Admin\GymController`;
  gate privado `assertPlatformAdmin` = `abort_unless(is_platform_admin,
  404)`; rutas en grupo `->prefix('admin')->whereNumber('registrationRequest')`):
  - `GET /admin/gym-registration-requests?status=` (filtro opcional).
  - `GET /admin/gym-registration-requests/{id}` — `mapRequest` de admin
    INCLUYE `applicant:{id,name,email}` (due diligence del revisor); nunca
    `user_id`.
  - `POST .../{id}/approve` — `DB::transaction` + `lockForUpdate` +
    `findOrFail`. Ya `approved` → devuelve el mismo resultado (idempotente,
    no duplica). `rejected` → 422. Si `pending`: `Gym::create`,
    `Branch::create`, `GymAssignment::create(gym_admin, active,
    branch_id=null)`, y sella la solicitud (`status`, `review_note`,
    `reviewed_by_user_id`, `reviewed_at`, `gym_id`).
  - `POST .../{id}/reject` — `approved` → 422; ya `rejected` → idempotente;
    `pending` → sella.
  - `GET /admin/gyms` — `withCount` de `gym_admin`/`coach`/`member` activos,
    `with('branches')`. `{id, name, branches:[{id,name}], *_count,
    created_at}` — sin datos personales.
  Anti-IDOR/authz existentes intactos: Bearer Sanctum, 404 (no 403) en toda
  la superficie `/admin/*` para no-admins (no descubrible), rate limiter
  `api` 120/min. Modelos `Gym`/`Branch`/`GymAssignment` y el gate
  `gym_admin` de Gym MVP sin tocar.

  FRONTEND-USUARIO (los flujos Cliente/Coach NO se tocan): `utils/api.js`
  (+`apiCreateGymRegistrationRequest`/`apiGetGymRegistrationRequests`),
  `screens/RegisterMyGym.jsx` (formulario + estado pending/approved/
  rejected + link opcional a Gym Web vía `VITE_GYM_WEB_URL` si está
  aprobado), `App.jsx` (ruta `gymRegistration` + botón atrás → settings),
  `screens/Settings.jsx` (botón "REGISTRAR MI GIMNASIO" en la tarjeta
  GIMNASIO), `.env.example` (`# VITE_GYM_WEB_URL`). `api.test.js` +2.

  FRONTEND-ADMIN (app web NUEVA, sin Capacitor — D-GYM-ONB-5): scaffold
  copiado de `frontend-gym-web` (sistema visual). `SessionContext`
  (`auth.isPlatformAdmin` SIEMPRE del backend `/auth/me`; solo token +
  identidad en LocalStorage; `adminActions` inyectan el token),
  `utils/{api,admin,admin.test}.js`, `components/{Sidebar,Topbar}.jsx`,
  `screens/{Auth,NoAccess,Requests,RequestDetail,Gyms,Account}.jsx`,
  `App.jsx` (gatea `authChecking`→`signedIn`→`isPlatformAdmin`→shell),
  `App.test.jsx`. `CLAUDE.md` propio. Alcance: login, solicitudes (filtro),
  detalle, aprobar/rechazar, lista de gyms. Nada más.

  Tests backend (28 nuevos, **452/452**, Pint limpio):
  `GymRegistrationRequestApiTest` (9: unauth 401, crear, validación, no dos
  pending, re-solicitar tras rechazo, ignora status/user_id/gym_id del
  cliente, index propio ordenado, index nunca expone user_id/revisor),
  `Admin/GymRegistrationRequestApiTest` (13: unauth 401, user normal 404 en
  cada endpoint admin, lista+filtro, detalle con `{id,name,email}`, 404
  inexistente, approve crea gym/branch/gym_admin, approve idempotente,
  rejected→approve 422, reject pending, reject idempotente + approved→reject
  422, tras aprobar el solicitante administra SU gym y ningún otro,
  aislamiento entre dos gyms aprobados), `Admin/GymApiTest` (2: unauth 401 +
  no-admin 404; lista con sedes y recuentos, sin `email`),
  `GrantPlatformAdminCommandTest` (4: falla sin user, concede, idempotente,
  `--revoke`).
  Frontends: usuario lint+**99**+build, couch lint+7+build, gym-web
  lint+**19**+build, admin lint+**8**+build. Todo verde.

  CÓMO CREAR EL PRIMER BIAFYT ADMIN (local):
  1. `cd backend && php artisan migrate` (aplica `2026_09_07_000001/2`).
  2. Registrarse/tener un usuario (p. ej. desde frontend-admin o
     `frontend-usuario`).
  3. `php artisan BIAFYT:grant-platform-admin tu@correo.com`
  4. Entrar en `frontend-admin` (`.env` → `VITE_API_BASE_URL`) con ese
     usuario → ve el panel. (`--revoke` lo quita.)

  CÓMO PROBAR EL FLUJO COMPLETO (local):
  - Usuario A (cliente) en `frontend-usuario`: Ajustes → "Registrar mi
    gimnasio" → envía la solicitud → ve "En revisión".
  - Admin S en `frontend-admin`: Solicitudes → abre la de A → "Aprobar" →
    se crea el Gym + sede + A como `gym_admin`.
  - Usuario A en `frontend-gym-web`: entra → ve su Gym y lo administra
    (Gym MVP). En `frontend-usuario` la pantalla ahora muestra "Aprobada" +
    link a Gym Web.
  - Repetir "Aprobar" sobre la misma solicitud → mismo resultado, sin
    duplicar (idempotente). Rechazar otra solicitud → A puede volver a
    solicitar.

  DECISIONES DE NEGOCIO ASUMIDAS (⚠ no fijadas explícitamente por el spec):
  - Autoridad de plataforma = booleano en `users`, no tabla/rol nuevo
    (D-GYM-ONB-1). Mínimo, "separado" de `GymAssignment`.
  - Datos de la solicitud = `gym_name` + `branch_name` + mensaje opcional;
    NO dirección/NIT/teléfono (no hay regla que los use — §5 diferido)
    (D-GYM-ONB-3).
  - `frontend-admin` como app separada, no pantalla dentro de Gym Web
    (D-GYM-ONB-5): audiencia/autoridad/despliegue distintos.
  - Sin notificación al solicitante: consulta su propio estado (pull-only).
  - Aprobar con la solicitud `rejected` → 422 (no se "reabre"); el usuario
    crea una solicitud nueva.

  PENDIENTE para declarar el MVP COMERCIAL CLOSED (no bloquea este slice;
  todo lo de repo/docs ya HECHO en el cierre de Fase 2):
  - [HECHO] `DEPLOY.md` + `docs/PRODUCTION_HARDENING_DISCOVERY.md`
    actualizados: 5 artefactos (incl. `admin.<dominio>`), 24 migraciones,
    bootstrap BIAFYT Admin, smoke E2E con onboarding (0–34).
  - [HECHO] `frontend-admin/.env.example` corregido para producción.
  - [INFRA] Provisionar y desplegar `admin.<dominio>` (hosting estático +
    fallback SPA + restricción de acceso de infra recomendada).
  - [OPS] Decidir el/los primeros `is_platform_admin` de prod (fuera de banda).
  - Opcional/no-MVP: notificar al solicitante, editar/suspender gyms desde
    Admin, métricas de plataforma.
  Archivos nuevos: `backend/database/migrations/2026_09_07_000001_*`,
  `..._000002_*`, `backend/app/Models/GymRegistrationRequest.php`,
  `backend/app/Http/Controllers/Api/V1/GymRegistrationRequestController.php`,
  `backend/app/Http/Controllers/Api/V1/Admin/{GymRegistrationRequestController,GymController}.php`,
  `backend/app/Console/Commands/GrantPlatformAdmin.php`,
  `backend/tests/Feature/Api/V1/GymRegistrationRequestApiTest.php`,
  `backend/tests/Feature/Api/V1/Admin/{GymRegistrationRequestApiTest,GymApiTest}.php`,
  `backend/tests/Feature/GrantPlatformAdminCommandTest.php`,
  `frontend-usuario/src/screens/RegisterMyGym.jsx`, todo `frontend-admin/`.
  Modificados: `backend/app/Models/User.php` (cast + `gymRegistrationRequests()`),
  `backend/routes/api.php` (+3 imports, +5 rutas usuario/admin),
  `frontend-usuario/src/{App.jsx,screens/Settings.jsx,utils/api.js,utils/api.test.js,.env.example}`,
  `CLAUDE.md`, `BIAFYT_BUSINESS_CORE.md`.
```

```
FASE: Cliente ↔ Coach — consentimiento en la app del atleta (slice D-CLIENT-COACH)
STATUS: CLOSED
Discovery: PASS | Implementation: PASS | Tests frontend-usuario: PASS | Smoke E2E del lazo completo Cliente → Coach → Gym contra backend local real (9 pasos): PASS
Notas: **cierra el último eslabón del MVP.** Hasta este slice `frontend-usuario`
  no consumía ningún endpoint de coach: una solicitud coach↔atleta nunca podía
  pasar a `active` sin tocar la BD, así que el tramo Cliente → Coach estaba muerto
  para usuarios reales. Ahora el atleta, desde su app, ve las solicitudes de coach
  entrantes y las acepta o rechaza, y ve de forma **pasiva** el/los coach(es) que
  ya lo entrenan.
  **Solo frontend.** Usa endpoints ya existentes en `backend/routes/api.php`
  (`GET /me/coach-relationships`, `POST /me/coach-relationships/{id}/accept`,
  `DELETE /me/coach-relationships/{id}`) — **CERO endpoints/migraciones/modelos
  nuevos**. No toca `AppContext`, `stateSchema`, puntos, actividad ni racha. No
  convierte `CoachAthleteRelationship` en gym-scoped. No abre la Fase 5.
  Pantalla `CoachRelationship.jsx` ("MI COACH", accesible desde Perfil): estado
  local propio (mismo patrón que `RegisterMyGym`), carga fresca de
  `/me/coach-relationships`, `groupRelationships` (helper puro copiado textual de
  `frontend-couch/src/utils/relationships.js` — sin monorepo, re-sync a mano;
  consume `activeCoaches` + `pendingReceived`). `respond(id, kind)`: `accept` →
  POST `.../accept`; `reject` → DELETE (pending → revoked). Botón "MI COACH" en
  `Profile.jsx`; ruta `coachRelationship` + botón atrás Android en `App.jsx`.
  Tests: `relationships.test.js` (3, helper puro) + `api.test.js` +3 (path/método
  de las 3 fns) + `CoachRelationship.test.jsx` (2, flujo aceptar/rechazar a nivel
  de pantalla con `react-dom/client` + `act`, sin `@testing-library`). Suite
  `frontend-usuario`: **107/107**, lint limpio, build OK. Backend intacto
  (452/452 sin re-ejecutar por este slice; sin cambios de backend).
  Smoke E2E real (`python` + `php artisan serve` + MySQL `BIAFYT`): 9 pasos,
  PASS — gym solicita (doble → 422) → usuario normal a `/admin/*` 404 → BIAFYT
  Admin lista y aprueba (idempotente) → A queda `gym_admin` → alta de coach B y
  member C por email → B solicita a C (201 `pending`) → **C ve la solicitud
  entrante (`viewer_role: athlete`) y la ACEPTA → `active`** → C completa perfil,
  entrena (activity 201) y hace check-in (201) → B ve el snapshot sombra de C
  (actividad ≥1, racha ≥1, puntos >0, **sin email**) y deja una nota (201) → A
  (`gym_admin`) ve members/coaches y el mismo snapshot del miembro → anti-IDOR:
  outsider 404 en coach y gym, el coach no puede aceptar su propia solicitud (404).
  Commit: `8961a73` (`feat(cliente): add coach relationship consent flow`), en `main`.
  Archivos nuevos: `frontend-usuario/src/screens/CoachRelationship.jsx` (+ `.test.jsx`),
  `frontend-usuario/src/utils/relationships.js` (+ `.test.js`). Modificados:
  `frontend-usuario/src/{App.jsx, screens/Profile.jsx, utils/api.js, utils/api.test.js}`.
  Pendiente (NO-MVP): notificar al atleta de una solicitud nueva; que el coach
  elija atleta desde el roster de su gym (hoy: id numérico); botón "terminar
  relación" desde la app del atleta.
```

```
FASE: 5 — Rutinas Coach/Gym + Inventario de equipamiento
STATUS: CLOSED (sin commit todavía — pendiente de instrucción del usuario)
Discovery: PASS | Decisión de negocio (Opción C + 1a): APROBADA por el usuario | Implementation: PASS (por etapas) | Tests backend: 516/516 | lint/test/build de los 4 frontends afectados: PASS
Notas: **Habilita el uso pleno de rutinas con y sin Coach/Gym.** El atleta
  independiente NO cambia: `customRoutines` (LocalStorage) sigue siendo su
  fuente de verdad, sin migración, sin gate de gym/coach. Todo lo nuevo es
  ADITIVO.
  A) **Inventario de gym** (nuevo): catálogo global `equipment` (1:1 de
  `machines.js`, 10 filas, seed idempotente) ↔ pivote `gym_equipment`
  (`available` bool, UNIQUE(gym_id, equipment_id)). Sin duplicar máquinas por
  gym. `equipment.slug` = `exercises.machine_id` (join, sin FK nueva).
  Público: `GET /equipment` (solo `is_active`), `GET /gyms/{gym}/equipment`.
  gym_admin: `GET`/`PUT`/`DELETE /me/gym/{gym}/equipment[/{equipment}]`
  (`GymAdminController`, gate `assertGymAdmin`).
  B) **Rutinas del coach** (reutiliza `Program→Day→Exercise`): `programs`
  +`reference_gym_id` (nullable FK, "entrenar en este gym", el dueño NO
  necesita pertenecer) +`created_by_user_id` (nullable FK, el coach autor).
  `App\Support\ProgramTree` (create + map, compartido por `ProgramController`
  y el endpoint del coach). `App\Support\GymInventory`
  (`assertProgramExercisesAvailable`: con `reference_gym_id`, una máquina no
  disponible en ese gym → 422 por-ejercicio; sin `reference_gym_id` → sin
  restricción). Endpoints coach: `GET/POST/PATCH/DELETE
  /me/coach/athletes/{id}/programs[/{program}]` (`CoachAthleteController`,
  gate = `CoachAthleteRelationship::activeBetween`, GymAssignment NO
  participa; `reference_gym_id` solo un gym del coach). El atleta ve las
  rutinas del coach en `GET /me/programs` (traen `created_by`); `PATCH
  /me/programs/{id}` del atleta sobre una rutina de autoría coach → **403**
  (decisión deliberada: el atleta la ve pero no la edita; la copia a
  `customRoutines`). Al copiarla, `POST /me/programs/{id}/import` marca
  `programs.imported_at` (persistente, por atleta) y deja de ofrecerse en
  "DE MI COACH" — ver `FASE: Importación persistente de rutinas del coach`.
  C) **Solicitudes de equipamiento** (nuevo, patrón `GymRegistrationRequest`):
  `equipment_requests` (estados `pending→in_review→changes_requested→pending`
  / `in_review→approved|rejected`; `resulting_equipment_id`) +
  `equipment_request_events` (audit append-only, no había paquete de
  auditoría). Gym: `GET/POST/PATCH /me/gym/{gym}/equipment-requests`
  (`GymAdminController`; edita+reenvía solo `pending`/`changes_requested`).
  BIAFYT Admin: `Admin\EquipmentController` (catálogo global — ÚNICO lugar
  donde se escribe `equipment`; `slug` derivado del nombre, no editable;
  `gym_count`) + `Admin\EquipmentRequestController` (start-review /
  request-changes / correct-info / reject / approve). **Anti-duplicados**: al
  aprobar, el admin elige EXPLÍCITAMENTE `equipment_id` (asociar existente) o
  `create_equipment: true` (crear nuevo); aprobar NO añade a ningún
  `gym_equipment`. Gate `is_platform_admin` (404 si no).
  Frontends: `frontend-usuario` (`MyRoutines.jsx`: sección "DE MI COACH" +
  "COPIAR A MIS RUTINAS"; picker prioriza equipo del gym backend del atleta
  vía `GET /me/gym-assignments` de SOLO LECTURA — no toca el `gymId` mock);
  `frontend-couch` (`RoutineBuilder.jsx` nuevo + card "RUTINAS" en
  `AthleteDetail`); `frontend-gym-web` (`Inventory.jsx` + solicitudes);
  `frontend-admin` (`EquipmentCatalog.jsx` + `EquipmentRequests.jsx`).
  `frontend-gym` (móvil) NO tocado (D5). Edición del coach = reemplazo
  completo vía `PUT` (sin sub-recursos coach-scoped). Migraciones nuevas:
  `2026_09_09_00000{1,2,3}` (equipment, gym_equipment, programs+2 cols),
  `2026_09_10_00000{1,2,3}` (equipment+6 cols, equipment_requests,
  equipment_request_events).
  D) **Catálogo de máquinas = fuente única en BD** (cierre del hallazgo de la
  auditoría): migración `2026_09_11_000001` añade a `equipment` los campos
  educativos que vivían en `frontend-usuario/src/data/machines.js`
  (`purpose`, `primary_muscle`, `secondary_muscles`, `movement`, `level`,
  `tips`, `mistakes`, `related`, `art`). `EquipmentSeeder` los siembra 1:1
  (idempotente). `GET /equipment` (público, solo activos) devuelve el shape
  completo. `Admin\EquipmentController` (store/update) los edita.
  `frontend-usuario`: `data/equipmentCatalog.js#loadEquipmentCatalog()`
  hidrata `state.machineCatalog` desde `GET /equipment`; `machines.js` queda
  SOLO como fallback offline (no se mezcla). `Machines.jsx` consume
  `machineCatalog`; `analytics.js#routineMuscleGroups(exercises,
  machineCatalog)` recibe el catálogo desde `Analytics.jsx`. `MachineArt.jsx`
  sigue siendo presentación (SVG por `art`, con dibujo por defecto).
  `frontend-admin` `EquipmentCatalog.jsx` gana los campos de ficha.
  Verificado en vivo: `PATCH /admin/equipment` → `GET /equipment` refleja el
  cambio sin tocar frontend; re-seed restaura.
  Sin tocar `customRoutines`, motor de entrenamiento, duelos, puntos,
  check-ins, GPS, `CoachAthleteRelationship`, el picker de ejercicios ni
  `gym_equipment`. Commit `5795bcb` en `main` (sin push).
```

```
FASE: Racha canónica (D2 / roadmap 3a)
STATUS: CLOSED (sin commit todavía)
Discovery: PASS | Implementation: PASS | Tests: PASS | Sin cambios de backend
Notas: La racha VISIBLE en `frontend-usuario` pasa a venir EXCLUSIVAMENTE de
  `GET /me/streak` (backend, `StreakRules` sobre `check_ins`). **Cero cambios
  de backend** — el endpoint y `StreakRules` ya existían (`9541277`) sin
  consumidor; ahora lo tienen.
  `AppContext`: nuevo estado en memoria `streak = { current, longest, status }`
  (`status`: idle | loading | ok | error). Se recarga vía `apiGetStreak` en
  cada arranque con sesión confirmada y tras cada `checkIn` (el POST de
  check-in puede haber cambiado la racha). NO se persiste (mismo criterio que
  `exerciseCatalog` / `machineCatalog`). **Sin fallback a valores locales**:
  si el backend no responde, `status != "ok"` y la UI muestra "—" — nunca se
  mezcla con `identity.user.streak`.
  UI: `Home.jsx` (`🔥 {current} días`), `Profile.jsx` (`🔥 {current}` +
  `récord {longest}`), `Challenges.jsx` (`Stat "Racha" 🔥 {current}`) leen
  `streak` del contexto. Nueva acción `refreshStreak()`.
  NO tocado: `identity.user.streak` en LocalStorage (persiste, se sigue
  incrementando en el check-in y se sigue enviando como hecho de sesión a
  `POST /me/activities` vía `buildActivityPayload` — es la entrada de puntos
  hasta el flip 3c). `Workout.jsx` / `validation.js#computeWorkoutPoints`
  (protegidos, ruta de puntos). `Ranking.jsx` (muestra `u.streak` de
  `communityUsers` mock — fuera de alcance). `stateSchema.js` (no se añadió
  nada al `state` persistido). Duelos, puntos, ranking, billing, customRoutines.
  Tests: `frontend-usuario` +10 (`AppContext.streak.test.jsx` 5:
  carga desde backend / anónimo=idle / refresco tras check-in / error sin
  fallback / `refreshStreak`; `screens/streak.ui.test.jsx` 5: Home/Profile/
  Challenges renderizan `current`/`longest` del backend, "—" sin sesión,
  refresco tras check-in). 138/138 frontend-usuario, lint + build verdes.
  Backend 518/518 sin cambios (`StreakApiTest` confirma el shape exacto
  `{current_streak, longest_streak}`).
  Archivos: `frontend-usuario/src/{state/AppContext.jsx, screens/{Home,Profile,Challenges}.jsx, utils/api.js (import), state/AppContext.streak.test.jsx (nuevo), screens/streak.ui.test.jsx (nuevo)}`.
  Sin commit.
```

```
FASE: Duelos reales (roadmap 3b)
STATUS: CLOSED (sin commit todavía)
Discovery: PASS | Implementation: PASS | Tests: PASS (backend 537, frontend-usuario 149)
Notas: El dominio de duelos deja de ser mock (`communityUsers` + rival
  simulado en `duelEngine.js`) y pasa a un dominio de backend con dos `User`
  reales. Es un duelo ASÍNCRONO de dos jugadores: el retador crea → el rival
  acepta → AMBOS ejecutan la MISMA rutina y envían su run → el backend
  resuelve el ganador CARA A CARA cuando llegan las dos ejecuciones. NO hay
  simulación de rival.

  BACKEND (nuevo):
  - Migración `2026_09_12_000001_create_duels_table`: `duels`
    (`challenger_user_id`/`opponent_user_id` → users cascade;
    `gym_id` → gyms nullOnDelete, el gym común capturado al crear;
    `modality`, `stake` unsigned, `status`, `winner_user_id` nullOnDelete,
    `outcome`, `result` json, `accepted_at`, `finished_at`) + `duel_runs`
    (una ejecución por participante, `UNIQUE(duel_id, user_id)`;
    `competitive_eligible` bool — hecho reportado por el cliente, mismo
    modelo de confianza que Activity).
  - `App\Support\DuelRules`: las 5 modalidades (mismos ids/pesos que
    `duelEngine.js#modalities`) + `resolve(modality, runA, runB)` — puntúa
    cada métrica normalizada contra la mejor de las dos ejecuciones (tiempo
    inverso), aplica pesos, gana el total más alto, empate = draw. No
    necesita conocer la rutina.
  - `Duel` / `DuelRun` models. `PointTransaction`: 2 razones nuevas
    (`duel_won` +stake / `duel_lost` -stake) — **5ª fuente del ledger**,
    escrita best-effort al finalizar un duelo DECISIVO (draw / unvalidated
    → sin movimiento). `User::duelsAsChallenger/duelsAsOpponent`.
  - `DuelController` + rutas `me/duels*` (auth:sanctum, `whereNumber('duel')`):
    `GET /me/duels` (mis duelos, ambos lados), `GET /me/duels/opponents`
    (usuarios reales con `GymAssignment` activo en un gym que comparto,
    excluye self + duelos abiertos), `POST /me/duels` (retador = token),
    `GET/accept/reject/cancel/run` sobre `{duel}`. Anti-IDOR: todo scopeado
    al participante (`findParticipantDuel` → 404, nunca 403);
    `challenger_user_id`/`winner_user_id`/`stake`/`status` nunca del cliente;
    stake ≤ máximo de la modalidad. Máquina de estados:
    pending→accepted/rejected/cancelled; accepted→in_progress (1ª ejecución)
    →finished (2 ejecuciones válidas, con ganador) | unvalidated (alguna no
    elegible); challenger puede cancelar hasta que termine. Sin expiración
    por tiempo (deuda: barrido si stale duels importan).

  FRONTEND (`frontend-usuario`):
  - `utils/api.js`: `apiGetDuels`, `apiGetDuelOpponents`, `apiCreateDuel`,
    `apiGetDuel`, `apiAcceptDuel`, `apiRejectDuel`, `apiCancelDuel`,
    `apiSubmitDuelRun`.
  - `AppContext`: nuevo estado en memoria `duels = { list, status }` (se
    recarga en cada arranque con sesión y al abrir la pantalla + tras cada
    acción). El ESTADO del duelo es del backend. `identity.duels` se
    REPROPÓSITO: ya no es la lista de duelos, es el registro LOCAL de
    conciliación de la APUESTA — `{ id, stake, locked, settled }`. Al
    crear/aceptar se BLOQUEA `stake` (`lockPoints`, mecanismo sin cambios);
    `reconcileDuels` libera el bloqueo UNA vez cuando el backend marca el
    duelo terminal: gano → +stake neto, pierdo → -stake neto, empate / no
    validado / rechazo / cancelación → devolución íntegra;
    `identity.user.duels.{wins,losses}` solo con resultados decisivos.
    Acciones nuevas: `createDuel`/`acceptDuel`/`rejectDuel`/`cancelDuel`/
    `submitDuelRun`/`refreshDuels`. `createDuel`/`updateDuel` viejas
    ELIMINADAS.
  - `screens/Duels.jsx`: reescrita — rivales reales de
    `GET /me/duels/opponents`, lista/detalle desde `duels.list`, sin
    `data/users.js`. Modalidades = solo texto de UI (los pesos y el cálculo
    del ganador viven en el backend). Se eliminó el análisis profundo de
    stats del rival y `estimateProbability` (no hay datos de otros usuarios;
    exponerlos es una cuestión de privacidad sin resolver) y el modal
    "equipos" (mock). `App.jsx#resolveDuelRun`: envía la propia ejecución
    (`submitDuelRun`) y notifica según el estado que devuelve el backend;
    la conciliación de puntos la hace `AppContext`. `Home.jsx` badge de
    duelos desde `duels.list`.
  - `data/users.js`: SIGUE en uso (Ranking + regalo de premios en Prizes) —
    NO tocado. `utils/duelEngine.js`: sin consumidores de producción
    (solo su propio test); dejado en el árbol, cleanup pendiente.

  NO tocado: `customRoutines`, motor de entrenamiento, ranking, billing,
  GPS, `Analytics.jsx`, `validation.js` (ruta de puntos), el saldo VISIBLE
  de puntos (sigue LocalStorage — sin flip 3c), `stateSchema.js` (no se
  añadió ninguna clave al `state` persistido).

  Cómo se calcula/registra el resultado: `DuelRules::resolve` compara las
  dos ejecuciones cara a cara con los pesos de la modalidad → `outcome`
  (challenger|opponent|draw) + `winner_user_id` + `result` (desglose). Si
  alguna ejecución no es `competitive_eligible` → `unvalidated`, sin ganador
  ni ledger. Un finish decisivo escribe `duel_won`/`duel_lost` en
  `point_transactions` (idempotency_key `duel:{id}:won|lost`). El frontend
  concilia la apuesta local por separado (`reconcileDuels`).

  Tests: BACKEND +19 (`DuelApiTest`: creación / identidad-y-stake no del
  cliente / self / modalidad inválida / stake sobre máximo / rival de otro
  gym / duelo duplicado / opponents (excluye self+standing, vacío sin gym) /
  anti-IDOR (no participante 404 en show/accept/cancel/run) / accept-reject-
  cancel (solo actor correcto, solo estado correcto) / run (accepted→
  in_progress, run duplicado 422, run antes de aceptar 422) / resolución
  con ledger / unvalidated sin ganador ni ledger / empate sin ledger /
  index ambos lados). FRONTEND +11 (`AppContext.duels.test.jsx` 8:
  crear bloquea / gano +stake neto una sola vez / pierdo -stake / empate
  devolución / no validado devolución / cancelar devuelve / rival acepta y
  bloquea+gana / anónimo idle; `screens/duels.ui.test.jsx` 3: lista vacía /
  terminado ganado en historial con signo / «RETAR» carga rivales reales).
  537/537 backend, 149/149 frontend-usuario, lint + build verdes.

  Archivos: `backend/{database/migrations/2026_09_12_000001_create_duels_table.php (nuevo), app/Support/DuelRules.php (nuevo), app/Models/{Duel,DuelRun}.php (nuevos), app/Models/{PointTransaction,User}.php, app/Http/Controllers/Api/V1/DuelController.php (nuevo), routes/api.php, tests/Feature/Api/V1/DuelApiTest.php (nuevo)}`,
  `frontend-usuario/src/{utils/api.js, state/AppContext.jsx, App.jsx, screens/{Duels.jsx (reescrita),Home.jsx}, state/{AppContext.duels.test.jsx (nuevo),AppContext.closure.test.jsx}, screens/duels.ui.test.jsx (nuevo)}`.
  Pendiente para 3c: flip del saldo visible al backend + reconciliación de
  huecos offline (outbox/retry) + paridad `Analytics.jsx` /
  `validation.js#competitivePoints`. Cleanup de `duelEngine.js` +
  `teams`/`findUser` de `data/users.js`. Notificar al rival cuando le retan
  / cuando se resuelve (hoy solo se ve al abrir la pantalla). Expiración de
  duelos stale.
  Sin commit.
```

```
FASE: Importación persistente de rutinas del coach (fix)
STATUS: CLOSED (sin commit todavía)
Discovery: PASS | Implementation: PASS | Tests: PASS (backend 544, frontend-usuario 151)
Notas: Bug: en "MIS RUTINAS" → "DE MI COACH", tras "COPIAR A MIS RUTINAS" la
  copia local aparecía bien pero la rutina del coach seguía en la lista con
  el botón de copiar, y reaparecía al recargar. La "bandeja de entrada" del
  coach se filtraba solo por `created_by` (sin estado de importación).

  Solución (sigue la arquitectura de Fase 5 — coach programs son una
  superficie de backend separada, `customRoutines` NO se migra):
  - Migración `2026_09_13_000001_add_imported_at_to_programs`: `programs`
    +`imported_at` (timestamp nullable). Vive en la fila del PROPIO atleta
    (`programs.user_id` = atleta), así que "importado" es **por atleta +
    programa** por construcción: cada atleta para el que el coach construye
    tiene su propia fila `Program`. NULL = pendiente. No destructiva,
    retro-compatible.
  - `ProgramController@import` + `POST /me/programs/{program}/import`: marca
    `imported_at = now()` en el programa del atleta autenticado. Solo
    programas de autoría coach (422 si es propio); 404 si es de otro atleta;
    **idempotente** (conserva el primer timestamp). El programa del coach NO
    se borra; los días/ejercicios quedan intactos (la copia los necesita).
  - `ProgramTree::map` +`imported_at` (campo nuevo nullable — consumidores
    existentes, incluida la app del coach, no afectados).
  - `CoachAthleteController@programsUpdate` NO toca `imported_at` → si el
    coach edita la rutina después, NO reaparece como pendiente (requisito
    cubierto sin código extra).
  - `frontend-usuario`: `utils/api.js#apiImportProgram`. `MyRoutines.jsx`:
    la lista "DE MI COACH" filtra `created_by && !imported_at`;
    `copyCoachRoutine` es async — llama `apiImportProgram` PRIMERO y solo si
    tiene éxito crea la `customRoutine` local (nunca queda una copia sin su
    marca); quita la tarjeta al instante + recarga. Sin comparar nombres,
    sin depender solo de LocalStorage.

  NO tocado: `customRoutines` (sigue LocalStorage, sin migrar), motor de
  entrenamiento, puntos, duelos, ranking, billing, GPS, el flujo del
  atleta independiente, `frontend-couch` (cambio de contrato aditivo).

  Tests: BACKEND +7 (`ProgramImportApiTest`: 401; importa y sale de la
  bandeja + programa del coach intacto + persiste al recargar; idempotente
  conserva timestamp; no puedes importar tu propio programa (422); no
  puedes importar el de otro atleta (404); por-atleta — la copia de otro
  atleta sigue pendiente; el coach editando después NO resetea la
  importación). `ProgramApiTest` shape assertion actualizada (+`imported_at`).
  FRONTEND +2 (`MyRoutines.test.jsx`: la rutina copiada desaparece de "DE MI
  COACH" y `apiImportProgram` fue llamada con el id real; no reaparece al
  remontar/recargar; un programa que ya viene con `imported_at` no se
  ofrece). 544/544 backend, 151/151 frontend-usuario, lint + build verdes.

  Archivos: `backend/{database/migrations/2026_09_13_000001_add_imported_at_to_programs.php (nuevo), app/Models/Program.php, app/Support/ProgramTree.php, app/Http/Controllers/Api/V1/ProgramController.php, routes/api.php, tests/Feature/Api/V1/{ProgramImportApiTest.php (nuevo), ProgramApiTest.php}}`,
  `frontend-usuario/src/{utils/api.js, screens/{MyRoutines.jsx, MyRoutines.test.jsx}}`.
  Sin commit.
```

```
FASE: Vouchers V1 — Gym→Athlete y Coach→Athlete (ecosistema, sin dinero)
STATUS: CLOSED (sin commit todavía) — alcance PARCIAL, fuera del roadmap
  aprobado (ver "## SIGUIENTE FASE" y BIAFYT_BUSINESS_CORE.md §52)
Discovery: PASS | Implementation: PASS | Tests: PASS (backend 623/623)
Notas: **Vouchers V1 NO es el sistema de promociones de BIAFYT — es solo
  la mitad "ecosistema" de él** (ver BIAFYT_BUSINESS_CORE.md §52 para el
  concepto de negocio completo y qué falta). Documentado aquí tal cual
  existe hoy en el working tree, sin tocar código.

  IMPLEMENTADO:
  - Modelo `Voucher`: invariante "exactamente un emisor" (`gym_id` XOR
    `coach_user_id`, `booted()`), estados `issued`/`redeemed`/`revoked` +
    `expired` derivado de `expires_at` (nunca almacenado, sin cron, mismo
    criterio que el resto del proyecto).
  - `App\Support\Vouchers`: generación de código (`VCH-` + 12 chars
    Crockford base32), `issue()`, `redeem()`/`revoke()` con UPDATE
    condicional atómico (`WHERE status='issued'`) como guarda de
    concurrencia.
  - **Gym → Athlete**: `GymVoucherController` — gate = `GymAssignment
    (gym_admin, active)` del `{gym}` de la ruta + destinatario debe ser
    `GymAssignment(role=member, active)` de ESE gym. Emitir / listar / ver /
    redimir / revocar.
  - **Coach → Athlete**: `CoachVoucherController` — gate =
    `CoachAthleteRelationship` activa. Emitir / listar / ver / redimir /
    revocar.
  - **Athlete**: `VoucherController` — solo lectura de sus propios vouchers
    (`GET /me/vouchers`, `GET /me/vouchers/{id}`); no emite, no redime, no
    revoca (son acciones del emisor).
  - Migración `create_vouchers_table`: sin columna de moneda — BIAFYT no
    calcula precio ni mueve dinero; la redención es "off the platform",
    confirmada por el propio emisor.
  - Rutas montadas en `routes/api.php` bajo `me/vouchers`,
    `me/coach/athletes/{id}/vouchers`, `me/gym/{gym}/vouchers`.
  - Tests: 35 tests de voucher (`VoucherTest` + `VoucherApiTest` +
    `CoachVoucherApiTest` + `GymVoucherApiTest`), todos en verde. Suite
    backend completa: 623/623 en verde.

  NO CUBRE (fuera de este V1):
  - DIFERIDO — **Gym → Coach**: no existe ni a nivel de schema.
    `GymVoucherController@store` filtra el destinatario por `role=member`;
    un `coach` del gym queda excluido. La tabla `vouchers` solo tiene
    `athlete_user_id` como recipient, no un `recipient_user_id` genérico.
  - PENDIENTE DE DECISIÓN — **BIAFYT → promoción para inscripción de
    Gym / Coach / Athlete**: no existe ningún modelo, endpoint ni diseño.
    Es la mitad "plataforma" del concepto de negocio y toca directamente
    "Fase 6 — Billing" (BIAFYT_BUSINESS_CORE.md §43-44): monetización,
    planes, proveedor, checkout y modelo de subscription siguen sin
    decidirse — "no existe nada hoy" (ver `## SIGUIENTE FASE` punto 6).
  - PENDIENTE DE DECISIÓN — Billing, pagos, checkout, suscripciones:
    deliberadamente fuera de alcance (Voucher es ortogonal a
    puntos/rewards/promotions/billing por diseño, ver comentarios de
    `App\Models\Voucher`). Vouchers V1 no define precios, porcentajes,
    límites ni expiraciones por defecto — esos campos existen en el schema
    como datos libres que carga el emisor, no como reglas de negocio.
  - PENDIENTE DE DECISIÓN — Frontend: cero integración en
    `frontend-usuario` / `frontend-couch` / `frontend-gym-web` /
    `frontend-gym`.

  Archivos: `backend/{app/Models/Voucher.php (nuevo), app/Support/
  Vouchers.php (nuevo), app/Http/Concerns/{PaginatesWithCursor,
  PresentsVouchers}.php (nuevos, compartidos con Activity/Point),
  app/Http/Controllers/Api/V1/{VoucherController,CoachVoucherController,
  GymVoucherController}.php (nuevos), database/migrations/
  2026_09_15_000001_create_vouchers_table.php (nuevo), routes/api.php,
  tests/Feature/{VoucherTest.php (nuevo), Api/V1/{VoucherApiTest,
  CoachVoucherApiTest,GymVoucherApiTest}.php (nuevos)}}`.
  Sin commit. Sin frontend. Sin mención previa en PROJECT_STATE.md ni
  BIAFYT_BUSINESS_CORE.md hasta este registro.
```

```
FASE: Promotion V0 — BIAFYT → inscripción de Athlete (registro)
STATUS: CLOSED (sin commit todavía) — alcance PARCIAL (solo platform→athlete),
  fuera del roadmap aprobado, mismo estatus que `Vouchers V1` (ver
  BIAFYT_BUSINESS_CORE.md §52)
Discovery: PASS | Implementation: PASS | Review: PASS WITH NOTES | QA: PASS
Tests: PASS (backend 639/639)
Notas: Dominio nuevo y separado de `Voucher` — ver
  BIAFYT_BUSINESS_CORE.md §52 para la distinción de negocio completa.
  Un `Promotion` es un código compartible reutilizable por muchos usuarios
  (a diferencia de `Voucher`, emitido a un único destinatario ya
  relacionado). V0 cubre ÚNICAMENTE BIAFYT → inscripción de Athlete
  (registro); Gym/Coach y el resto de vouchers de captación quedan fuera.

  IMPLEMENTADO:
  - Modelo `Promotion`: `code` único (normalizado trim+mayúsculas antes de
    guardar/buscar), `benefit_type`/`benefit_value`/`benefit_description`
    (mismo vocabulario que `Voucher::BENEFIT_TYPES`, sin compartir tabla ni
    código), `created_by_user_id` (oculto en el contrato API). Sin
    `gym_id`/`coach_user_id`/`status`/`expires_at`/moneda — no anticipados.
  - Modelo `PromotionRedemption`: una fila por `(promotion_id, user_id)`
    — `UNIQUE(promotion_id, user_id)` en BD (una promoción, una vez por
    usuario). Snapshot copiado de `benefit_type/value/description` al
    momento de redimir (una edición posterior de la promoción NUNCA cambia
    lo ya otorgado). `nullOnDelete` en `promotion_id`: el redemption
    sobrevive si se borra la promoción.
  - `Admin\PromotionController@store` (`POST /v1/admin/promotions`) — gate
    `is_platform_admin` (404 para cualquier otro, mismo patrón que los 4
    controllers `Admin\*` existentes). Creación únicamente: sin
    index/show/update en V0.
  - `AuthController::register` extendido con `promo_code` opcional:
    inválido → 422 y el `User` NO se crea (validado antes de la
    transacción); válido → `User` + `PromotionRedemption` creados en la
    MISMA `DB::transaction` (atómico, todo o nada).
  - Tests: 13 nuevos (`PromotionTest` modelo + `Admin\PromotionApiTest`
    API) + 3 nuevos en `AuthTest` (código válido/inválido/ausente). Suite
    backend completa: 639/639 en verde. Pint verde.

  REVIEW (PASS WITH NOTES) — hallazgos no bloqueantes, sin corregir en V0
  por decisión explícita:
  - Race `exists()`→`create()` en `PromotionController@store`: dos
    creaciones concurrentes con el mismo código podrían dar un 500 en vez
    de un 422 limpio (el índice único de BD igual protege la integridad).
    Bajo riesgo — endpoint solo-admin, uso manual esporádico.
  - `Promotion` no repite el patrón de invariante en `booted()` de
    `Voucher`; la validación de beneficio vive solo en el controller.
  - Duplicación deliberada y aceptada: la lógica de validación de
    beneficio (percent/fixed requieren valor, percent ≤100, text anula
    valor) está casi igual en `PresentsVouchers` (Voucher) y en
    `Admin\PromotionController` (Promotion) — consecuencia directa de la
    decisión de no tocar Voucher V1.

  NO CUBRE (fuera de este V0):
  - DIFERIDO — Gym→Coach, Gym→Athlete (captación), Coach→Athlete
    (captación): no diseñado, no implementado.
  - PENDIENTE DE DECISIÓN — BIAFYT → promoción para inscripción de Gym
    y de Coach: sin modelo, sin endpoint.
  - PENDIENTE DE DECISIÓN — Billing, pagos, checkout, suscripciones,
    entitlements: deliberadamente fuera de alcance, sin anticipar.
  - PENDIENTE DE DECISIÓN — Frontend: cero integración en ninguna app.

  Archivos: `backend/{app/Models/{Promotion,PromotionRedemption}.php
  (nuevos), app/Http/Controllers/Api/V1/Admin/PromotionController.php
  (nuevo), app/Http/Controllers/Api/V1/AuthController.php, routes/api.php,
  database/migrations/2026_09_16_00000{1,2}_create_promotion{s,
  _redemptions}_table.php (nuevos), tests/Feature/{PromotionTest.php
  (nuevo), Api/V1/{AuthTest.php, Admin/PromotionApiTest.php (nuevo)}}}`.
  Sin commit. Sin frontend. No toca `Voucher`/`App\Support\Vouchers`.
```

```
FASE: Promotion V1 — audiencia (Athlete/Coach/Gym) + duración por regla
STATUS: CLOSED (sin commit todavía) — resuelve, por decisión explícita del
  usuario, el punto "PENDIENTE DE DECISIÓN — BIAFYT → promoción para
  inscripción de Gym y de Coach" dejado abierto en Promotion V0 (arriba) y
  en BIAFYT_BUSINESS_CORE.md §52. Sigue sin tocar Billing/Plans/Google
  Play/Stripe — ver "NO CUBRE" abajo.
Discovery: PASS | Implementation: PASS | Tests: PASS (backend 646/646,
  frontend-admin 14/14)
Notas: El beneficio deja de vivir en `Promotion` — se mueve a
  `PromotionRule`, una fila por `(audience, duration_months)`. Un único
  código (p.ej. `ANIVERSARIO2026`) puede así ofrecer descuentos distintos
  para Athlete/Coach/Gym y distintos por duración (3/6/12 meses) dentro de
  la misma audiencia. Una promoción puede tener 1, 2 o las 3 audiencias —
  la audiencia nunca vive en la cabecera. Sin comodín "aplica a todos" en
  V1 (cada regla nombra una audiencia explícita). Sin `plan_id`: la regla
  referencia audiencia+duración directamente, no una entidad `Plan`
  (no existe todavía).

  IMPLEMENTADO:
  - Modelo `PromotionRule` (nuevo): `audience` (athlete|coach|gym),
    `duration_months` (3|6|12), `benefit_type` (percent|fixed — sin `text`
    en V1), `benefit_value`. `UNIQUE(promotion_id, audience,
    duration_months)` en BD — ninguna regla duplicada para la misma
    combinación (defensa en profundidad; el controller también la rechaza
    antes del insert).
  - `Promotion`: pierde `benefit_type`/`benefit_value`/`benefit_description`
    (migran a `PromotionRule`); gana `active` (bool, default true),
    `valid_from`/`valid_until` (nullable) — deliberadamente fuera de V0,
    ahora necesarios para una campaña real con vigencia.
  - `Admin\PromotionController@store` — crea la promoción y sus N reglas en
    una sola transacción; exige al menos una regla; valida audiencia,
    duración, tipo de beneficio y tope de 100% en percent; rechaza reglas
    duplicadas antes de tocar la BD. `@index` incluye las reglas
    (`with('rules')`). Sigue sin show/update/delete/status toggle.
  - Admin UI (`frontend-admin/src/screens/Promotions.jsx`): formulario de
    creación con reglas dinámicas (agregar/quitar), cada una con
    audiencia/duración/tipo/valor; campos de vigencia y estado activo.
  - **Cambio consecuente en `AuthController::register`**: se retira
    `promo_code` por completo. El modelo por regla ya no tiene un único
    beneficio que redimir en el registro — no hay audiencia ni duración
    resueltas en ese evento. La redención de una Promotion V1 queda
    diferida a un futuro flujo de compra (fuera de alcance de esta fase).
    `PromotionRedemption` y su patrón de snapshot quedan intactos para ese
    futuro flujo; solo se ajustaron los tests que construían su fixture a
    partir de los campos ahora removidos de `Promotion`.

  NO CUBRE (fuera de esta fase, explícito):
  - Billing, Google Play, Stripe, pagos, entitlements, enforcement
    Free/Premium, `Plan` como entidad, frontend de compra — ninguno
    implementado ni diseñado técnicamente aquí.
  - Límites de uso (máximo de redenciones por promoción/usuario/audiencia):
    no forma parte de esta fase, no hay ningún campo ni mecanismo para
    ello todavía.
  - Edición/eliminación de una promoción o de una regla después de creada.
  - `Voucher`/beneficios Gym-Coach→Athlete: sin cambios, dominio separado.

  Archivos: `backend/{app/Models/{Promotion (editado),
  PromotionRule.php (nuevo)}, app/Http/Controllers/Api/V1/
  {Admin/PromotionController.php, AuthController.php} (editados),
  routes/api.php (comentario), database/migrations/2026_09_17_00000{1,2}_
  {update_promotions_for_v1,create_promotion_rules_table}.php (nuevos),
  tests/Feature/{PromotionTest.php, Api/V1/{AuthTest.php,
  Admin/PromotionApiTest.php}} (reescritos)}`, `frontend-admin/src/
  {screens/Promotions.jsx, utils/api.js (comentarios), App.test.jsx}`
  (editados). Sin commit.
```

## FUENTES DE VERDAD (no duplicar)

| Dominio | Fuente única | Archivo |
|---|---|---|
| Catálogo de ejercicios (id/name/type/machineId) | `exercises.js` (local) + `exerciseCatalog.js` (integración remota validada atómicamente) | `frontend-usuario/src/data/exercises.js`, `data/exerciseCatalog.js` |
| Generación de rutina automática y sus 8 focos | `training.js#buildRoutine/focuses/shape` | `frontend-usuario/src/data/training.js` |
| Interpretación de prescripción por `type` (fuerza/isométrico/cardio) | `exercisePrescription.js#typeOf/setsFor/unitFor` | `frontend-usuario/src/utils/exercisePrescription.js` |
| Catálogo educativo de máquinas | `machines.js` (independiente, NO es el catálogo de ejercicios) | `frontend-usuario/src/data/machines.js` |
| Forma de `state` (device/auth/identity) | `stateSchema.js` (lista manual, no derivada) | `frontend-usuario/src/state/stateSchema.js` |
| Cliente API | `utils/api.js` | `frontend-usuario/src/utils/api.js` |
| Catálogo de gyms/sedes (lectura, id/name/branches) | `GymController@index` (backend, real; sin consumidor frontend aún) | `backend/app/Http/Controllers/Api/V1/GymController.php` |
| Asignaciones gym del usuario autenticado (lectura id/role/gym/branch; escritura acotada a self-assign/revoke del propio rol member) | `GymAssignmentController@index/store/destroy` (backend, real; `GET /me/gym-assignments` lo consume `frontend-gym-web` para detectar el rol `gym_admin`) | `backend/app/Http/Controllers/Api/V1/GymAssignmentController.php` |
| Roles/jerarquía Gym (lógica de dominio) | `GymAssignment::ROLE_RANK/activeFor`; helpers `User::hasRoleInGym/hasExactRoleInGym` (D5). El slice Gym MVP los USA de forma efímera (el gate `gym_admin` de `GymAdminController` es una query inline equivalente); `GymAssignment.php` sin tocar | `backend/app/Models/GymAssignment.php`, `backend/app/Models/User.php` |
| Administración gym-scoped de member/coach + estado sombra del miembro (Gym MVP) | `GymAdminController@members/coaches/userLookup/storeAssignment/destroyAssignment/memberDetail` (backend, real; consumido por `frontend-gym-web`). Gate: `GymAssignment(role=gym_admin, active)` en el `{gym}` de la ruta. `gym_admin`/`staff` NO se conceden por API. Reutiliza `Gym`/`Branch`/`GymAssignment` sin migración | `backend/app/Http/Controllers/Api/V1/GymAdminController.php` |
| Relación de consentimiento coach↔atleta (request/accept/revoke, no gym-scoped) | `CoachAthleteRelationshipController@index/store/accept/destroy` (backend, real; consumido por `frontend-couch` —lado coach— y `frontend-usuario` —el atleta acepta/rechaza + ve su coach activo, slice D-CLIENT-COACH `8961a73`—) | `backend/app/Http/Controllers/Api/V1/CoachAthleteRelationshipController.php` |
| Gate de autorización coach→atleta (¿este coach puede leer a este atleta?) | `CoachAthleteRelationship::activeBetween(coachId, athleteId)` — relación `active` | `backend/app/Models/CoachAthleteRelationship.php` |
| Snapshot sombra de un atleta/miembro (`{athlete, profile, activity_summary, streak, points}`) | `App\Support\AthleteSnapshot::for($user)` — constructor ÚNICO, reutiliza `StreakRules` + `SUM(point_transactions.amount)`; sin autoridad nueva. Lo consumen `CoachAthleteController::show` y `GymAdminController::memberDetail` (shape idéntico, gate distinto) | `backend/app/Support/AthleteSnapshot.php` |
| Lectura coach-scoped del atleta + notas | `CoachAthleteController@index/show/notesIndex/notesStore/notesDestroy` (backend, real; consumido por `frontend-couch/src/screens/AthleteDetail.jsx`). `show` delega en `AthleteSnapshot` | `backend/app/Http/Controllers/Api/V1/CoachAthleteController.php` |
| Nota/feedback del coach sobre un atleta (privada del coach; el atleta NO la recibe) | `CoachNote` + `CoachAthleteController@notesIndex/notesStore/notesDestroy` | `backend/app/Models/CoachNote.php` |
| Cálculo de puntos por actividad (backend autoritativo) | `PointRules::forActivity` = `min(600, sets*6 + exercises*12)` | `backend/app/Support/PointRules.php` |
| Saldo de puntos del usuario (backend autoritativo) | `SUM(point_transactions.amount)` — ledger append-only, sin balance cacheado; expuesto por `PointController@show` | `backend/app/Models/PointTransaction.php`, `backend/app/Http/Controllers/Api/V1/PointController.php` |
| Hecho histórico de una sesión completada + resumen agregado (backend) | `Activity` + `ActivityController@store/index` (backend real; alimentado por **write-through sombra** desde `AppContext#addActivity` — best-effort, no autoritativo aún, sin migración) | `backend/app/Models/Activity.php`, `backend/app/Http/Controllers/Api/V1/ActivityController.php` |
| Economía de puntos del FRONTEND (autoritativa VISIBLE, LocalStorage, NO migrada) | `POINT_RULES`/`computeWorkoutPoints` + `grantPoints`/`pointsLog` en `AppContext`. El backend recibe copia sombra de las 5 fuentes: `workout_completed` (actividad), `checkin` (+20), `challenge_claimed` (reward del reto), `reward_claimed` (débito), `duel_won`/`duel_lost` (roadmap 3b). NO es la fuente del número que ve el usuario. | `frontend-usuario/src/utils/validation.js`, `frontend-usuario/src/state/AppContext.jsx` |
| Duelos reales (dominio backend) | `duels` + `duel_runs` + `App\Support\DuelRules` (modalidades + `resolve` cara a cara) + `DuelController` (`me/duels*`). Estado del duelo = backend. La APUESTA visible de puntos se concilia en LocalStorage: `AppContext#reconcileDuels` sobre `identity.duels` (registro `{id, stake, locked, settled}`, NO la lista de duelos). Un finish decisivo escribe `duel_won`/`duel_lost` en el ledger (best-effort, 5ª fuente). | `backend/app/Models/{Duel,DuelRun}.php`, `backend/app/Support/DuelRules.php`, `backend/app/Http/Controllers/Api/V1/DuelController.php`, `frontend-usuario/src/{state/AppContext.jsx, screens/Duels.jsx}` |
| Retos diarios (definición + selección del día + reward) | Frontend VISIBLE: `data/community.js#dailyChallengeTemplates`/`dailyChallengesFor` + `progressForDay` (completitud). Backend SOMBRA: `ChallengeRules::TEMPLATES`/`forDate`/`rewardFor` (port verbatim del seed; solo `id`+`reward`; NO verifica completitud). | `frontend-usuario/src/data/community.js`, `backend/app/Support/ChallengeRules.php` |
| Racha (`streak`) — VISIBLE | Frontend: `AppContext#checkIn` hace `streak+1`, nunca decrece, sin regla de ruptura. Es el número que ve el usuario. | `frontend-usuario/src/state/AppContext.jsx` |
| Racha VISIBLE — AUTORITATIVA (backend) | `StreakRules::fromDates` sobre `check_ins`, expuesta por `GET /me/streak` (`current_streak` = racha actual, rompe con un día perdido; `longest_streak` = récord). **Consumida por la UI desde el roadmap 3a** (`AppContext.streak` → `Home`/`Profile`/`Challenges`). NO alimenta puntos. `identity.user.streak` (LocalStorage) persiste SOLO como hecho de sesión para `POST /me/activities` hasta el flip (3c). | `backend/app/Support/StreakRules.php`, `backend/app/Http/Controllers/Api/V1/StreakController.php`, `frontend-usuario/src/state/AppContext.jsx` |
| Contrato de envío frontend→backend de actividad (write-through) | `buildActivityPayload` (puro) + `apiCreateActivity`/`apiGetActivities`/`apiGetPoints` | `frontend-usuario/src/utils/api.js` |
| Premios (catálogo + costo) — VISIBLE | Frontend: `data/prizes.js#prizeCatalog` (10 premios, incluye condición de desbloqueo rank/duelos/puntos). Backend SOMBRA: `RewardRules::TEMPLATES`/`costFor` (port verbatim, solo `id`+`cost`; NO verifica la condición de desbloqueo). | `frontend-usuario/src/data/prizes.js`, `backend/app/Support/RewardRules.php` |

## CONTRATO CRÍTICO: shape de ejercicio por `type`

```
fuerza (o type ausente = legacy)  → sets, reps, rest
isométrico                         → sets, seconds, rest   (NUNCA reps)
cardio                              → duration:null, rest   (NUNCA sets/reps/seconds)
```
Definido en `training.js#buildRoutine`, consumido por `exercisePrescription.js`/`Workout.jsx`, y ahora también respetado por `MyRoutines.jsx#exerciseFromCatalog`. Cualquier código nuevo que construya un objeto de ejercicio DEBE seguir esta forma exacta — no inventar campos nuevos.

## ARCHIVOS PROTEGIDOS (no modificar sin aprobación explícita y sin necesidad técnica demostrada)

- `frontend-usuario/src/data/exercises.js` — 22 ejercicios, `findExercise(id)` un solo argumento.
- `frontend-usuario/src/data/exerciseCatalog.js` — validación atómica, fallback local.
- `frontend-usuario/src/data/machines.js`
- `frontend-usuario/src/data/training.js`
- `frontend-usuario/src/utils/exercisePrescription.js`
- `frontend-usuario/src/screens/Workout.jsx`, `Analytics.jsx`
- `frontend-usuario/src/state/stateSchema.js`, `AppContext.jsx` (`normalizeIdentity`, `switchIdentity`, `saveRoutine`, `deleteRoutine`, `setActiveRoutine`)
- Todo `backend/`

## DECISIONES DE ARQUITECTURA/PRODUCTO YA APROBADAS

- `id` numérico backend + `slug` estable (no slug-as-PK) para Exercise.
- Catálogo real = 22 ejercicios exactos (no 26 — cifra descartada de un roadmap viejo).
- Validación atómica todo-o-nada para el catálogo remoto (nunca subconjunto parcial silencioso).
- Resolución catalog-aware de Training vive en `training.js` (no en `exercises.js`, que permanece de un solo argumento).
- Identity: snapshot completo de `identity` por `user.id` (no allowlist por campo) — `switchIdentity()`.
- Multi-tab: solo evento `storage` nativo, sin BroadcastChannel/sessionStorage.
- Custom Routines: sin migración automática ni heurística `name→exerciseId`; solo filas nuevas (elegidas desde el picker) ganan `exerciseId`/`type`; legacy se preserva intacta.
- Deudas de clasificación fitness aprobadas y NO resueltas a propósito: `ex-movilidad-cadera`/`ex-movilidad-toracica` tipadas `"fuerza"`; `ex-salto-cajon` tipado `"fuerza"` heredando plantilla `performance`.
- Gym/Branch: API de lectura pública, sin ampliar schema (solo `id`/`name`, sin `lat/lng/address/city/country/status/members`), branches anidadas en un único endpoint (no dos rutas separadas).
- GymAssignment: lectura (`GET /me/gym-assignments`) autenticada y scopeada al propio usuario; `inactive` se excluye por completo de la respuesta; se incluye el `id` de la propia asignación (referencia estable, ya usada por la fase de escritura). Escritura ahora existe pero acotada: el propio usuario puede self-assign/revoke únicamente su propio rol member (`POST`/`DELETE /me/gym-assignments`, ver fase GymAssignment — Escritura). Administración de roles por terceros (asignar/revocar el rol de otro usuario, o roles distintos de member) permanece completamente interna — ninguna fase futura debe exponerla sin una decisión explícita nueva. **ACTUALIZACIÓN:** `frontend-gym-web` ya consume `GET /me/gym-assignments` (para detectar el rol `gym_admin`) y los endpoints del slice Gym MVP (`GymAdminController`); `frontend-usuario` sigue sin conectarse a `Gym`/`Branch`/`GymAssignment`.
- CoachAthleteRelationship: relación de consentimiento coach↔atleta, deliberadamente NO gym-scoped (un coach activo en cualquier gym/branch puede solicitar a cualquier atleta del sistema). Un atleta puede tener relaciones simultáneas con más de un coach — sin restricción, decisión implícita del código validada por QA, no bloqueante. La relación no se invalida si el `GymAssignment(role=coach)` del coach se revoca después (snapshot histórico, mismo criterio que `WorkoutExercise`). No reemplaza ni modifica `GymAssignment`; ambos son conceptos independientes. Sin UNIQUE de BD en el par coach/atleta (deduplicación de pending/active a nivel aplicación, mismo patrón que GymAssignment). **ACTUALIZACIÓN:** `frontend-couch` consume estos endpoints por el lado coach (Fase 1 + slice Coach MVP: solicitar/aceptar/revocar + lectura sombra del atleta + notas); `frontend-usuario` los consume por el lado atleta (slice D-CLIENT-COACH `8961a73`: ver / aceptar / rechazar la solicitud + ver el coach activo).
- Programs: propiedad exclusiva del usuario autenticado (sin concepto de coach/staff assignment en esta fase). Coexiste con Custom Routines (frontend) sin ninguna migración ni conversión automática entre ambos — son dos conceptos independientes hasta nueva decisión explícita. `ProgramDay` NO introduce weekday/fecha en esta fase (solo `position`). `ProgramExercise` mantiene únicamente `exercise_id`+`position` (sin sets/reps/rest/prescripción — deferido a una futura fase de Workout). El mismo `exercise_id` puede repetirse dentro del mismo `ProgramDay` (decisión explícita, sin UNIQUE compuesta).
- Activity + Points: `Activity` es un dominio ORTOGONAL a la cadena Exercise→...→ExercisePerformance — hecho histórico e inmutable de una sesión COMPLETADA + resumen agregado, NO un eslabón más y NO reemplaza a `Workout`. `Activity.workout_id` nullable (`nullOnDelete`, `UNIQUE`): 0..1 Activity por Workout, actividades standalone ilimitadas; borrar un Workout abierto solo limpia el vínculo. Sin lifecycle abierto/cerrado (`finished_at` NOT NULL — la Activity solo existe ya completada), sin update/delete por API. NO se auto-crea al cerrar un Workout (solo `POST /me/activities` explícito). `PointTransaction` = ledger append-only, `amount` con signo, `reason` tipado, `source` polimórfico (esta fase: siempre `Activity`); sin endpoint de escritura directa; `balance = SUM(amount)` sin cachear. Cálculo AUTORITATIVO en `PointRules::forActivity` (`min(600, sets*6 + exercises*12)`); el cliente nunca envía `points`/`amount`/`user_id`. NO incluye (fases posteriores, con dependencia señalada): bono de streak (necesita modelo de asistencia autoritativo), split competitivo/actividad y su gate (necesita capa anti-fraude/GPS), check-in/challenge/duel/reward como `reason` del ledger, migración del LocalStorage. La economía de puntos del frontend (`validation.js`/`AppContext`) queda como legacy, sin migrar, coexistiendo. ACTUALIZACIÓN: la fase "Frontend write-through" (ver FASES) YA conecta `AppContext#addActivity` → `POST /me/activities` como copia sombra best-effort; el backend recibe una `Activity` + crédito `workout_completed` por cada entreno, pero NO es autoritativo — el flip de autoridad y la reconciliación quedan para una fase futura. D1 añadió además el bono de racha en `PointRules::forActivity` (paridad con `computeWorkoutPoints`, usando la racha local enviada como hecho de sesión) y el 4º `reason` `reward_claimed` (débito) al ledger.
- Workout: `program_day_id` nullable (Workout standalone permitido, sin obligar vínculo a un Program). `program_exercise_id` en `WorkoutExercise` nullable y pasa a NULL al borrarse el `ProgramExercise` referenciado (`nullOnDelete`, nunca cascade ni restrict — el Workout es histórico y debe sobrevivir intacto). Un Workout standalone (`program_day_id=NULL`) no puede tener ningún `workout_exercise` con `program_exercise_id` no-NULL (regla de consistencia explícita). `WorkoutExercise` conserva un snapshot histórico (`exercise_id`+`program_exercise_id`+`position`) tomado en el momento de creación; el `exercise_id` enviado debe coincidir con el del `program_exercise_id` referenciado (ambos se envían explícitos, sin auto-derivación). `exercise_id` puede repetirse dentro del mismo `WorkoutExercise`/Workout, mismo criterio ya aprobado para `ProgramExercise`/`ProgramDay` — sin restricción nueva. `finished_at` (no-NULL) define el cierre del Workout: inmutable a partir de ese momento, cualquier mutación posterior (Workout o cualquier hijo) responde 409, evaluado antes que la validación del payload; sin ningún camino de reapertura. `GET /me/workouts` queda sin paginación en esta fase (decisión aprobada, registrada como deuda futura, no resuelta ahora). Points/Activities/Ranking/Challenges/Duels/Rewards/Notifications/Calendar/GPS/anti-fraude/cálculo de puntos/Custom Routines/prescripción en `ProgramExercise`/conexión de frontend quedan explícitamente fuera de esta fase.

## DEUDAS TÉCNICAS CONOCIDAS (no resolver salvo que se apruebe explícitamente como su propia fase)

- Repo: el árbol legacy monolítico de la raíz fue **eliminado** en `20ed683` (ver `## ESTADO DEL REPO / ACLARACIONES`). Ya no hay deuda aquí.
- `Gym`/`Branch`: ya tienen `GET /api/v1/gyms` (lectura mínima, id/name/branches). `GymAssignment` ya tiene `GET /me/gym-assignments` (lectura) y `POST`/`DELETE /me/gym-assignments` (self-assign/revoke del propio rol member). **Administración de roles por terceros (que un admin/coach asigne o revoque roles de otros usuarios) sigue sin ningún endpoint.** Mock de frontend (`gyms.js`) sigue 100% desconectado del backend (shapes incompatibles: mock tiene dirección/lat-lng/status B2B/members, backend solo `id`/`name`) — conectar `AppContext.jsx#selectGym/registerGym`/`Onboarding.jsx`/`ChangeGym.jsx` al backend real sigue pendiente. **`lat`/`lng` no es cosmético**: `Workout.jsx` (protegido) lo usa para el gate de GPS competitivo vía `evaluateProximity()` — conectar el frontend a `GET /gyms` sin resolver esto rompería esa validación silenciosamente; no ampliar el schema de `Gym`/`Branch` solo por paridad sin necesidad demostrada.
- `analytics.js`: reconstruye rutina histórica por coincidencia de texto (`activity.routine === focus.label`) — frágil, ya documentado como deuda conocida en el propio código.
- `MyRoutines.jsx` línea ~35 (`const auto = buildRoutine(state.identity.user.focusId)`, vista previa "AUTOMÁTICA"): no pasa `exerciseCatalog` como segundo argumento, a diferencia del uso real en `AppContext.jsx`. Preexistente, no introducido por la última fase, señalado por Independent Review, no bloqueante.
- Datos LocalStorage autoritativos VISIBLES en el FRONTEND: `points`/`pointsLog`/`streak`, `checkins`, `rewards`, `activities`, `customRoutines`, `challengeProgress`, `agenda`, `notifications`, `ranking` (mock) — manipulables desde DevTools. (`identity.duels` dejó de ser la lista de duelos con el roadmap 3b: ahora es el registro local de conciliación de la apuesta; el estado del duelo es del backend.) Deuda de integridad conocida, NO convertir automáticamente en la siguiente fase sin decisión de producto explícita. ESTADO: `activities` + los puntos de entreno ya se envían al backend como **copia sombra write-through** (`AppContext#addActivity` → `POST /me/activities`, best-effort), pero el backend NO es autoritativo todavía — el número que ve el usuario sigue saliendo de LocalStorage. Los **check-ins** también se envían como copia sombra (`AppContext#checkIn`/`checkOut` → `POST /me/check-ins` / `PATCH .../today/check-out`) y acreditan `checkin` +20. Los **claims de retos diarios** también (`AppContext#claimChallenge` → `POST /me/challenge-claims`, best-effort) y acreditan `challenge_claimed` (reward calculado por el backend, sin verificar completitud). Falta: el "flip de autoridad" (que el frontend lea saldo/historial del backend), la reconciliación (huecos por `POST` fallido en offline — sin reintento ni cola en las fases write-through; el dedupe de check-in/reto usa día-cliente en frontend y día-servidor en backend), y decidir seed único vs. empezar de cero. La **racha visible** YA es del backend (`GET /me/streak`, roadmap 3a — ver `FASE: Racha canónica`); `identity.user.streak` persiste en LocalStorage pero SOLO como hecho de sesión para el cálculo de puntos (`buildActivityPayload`) hasta el flip. **Duelos** ya es dominio de backend (roadmap 3b — ver `FASE: Duelos reales`): el estado del duelo lo lleva el backend y un finish decisivo escribe `duel_won`/`duel_lost` en el ledger (best-effort); la APUESTA visible se concilia en LocalStorage (`AppContext#reconcileDuels`, sobre `identity.duels` repropósito como registro de conciliación `{id,stake,locked,settled}`) — el saldo visible NO se flipeó. Los **premios** YA acreditan `reward_claimed` (débito, monto negativo) en el ledger en modo sombra desde D1 (`AppContext#claimPrize` → `POST /me/reward-claims`, best-effort), pero el número visible de premios/puntos sigue saliendo de LocalStorage.
- Activity + Points: (a) balance = `SUM(point_transactions.amount)` sin cachear — a escala de ranking podrá requerir tabla `point_balances` o columna cacheada (misma clase de deuda diferida que la paginación de `GET /me/workouts`). (b) `GET /me/activities` y `GET /me/points` sin paginación (el historial y el ledger crecen sin límite con el uso real). (c) Actividades standalone (sin `workout_id`) no tienen clave de idempotencia: un reintento tras respuesta perdida duplicaría Activity+crédito — aceptable a la escala actual, cerrable con un header `Idempotency-Key` en el futuro. (d) Misma race check-then-act que Programs/Workout/Coach en `POST /me/activities` (`->exists()` + `catch(QueryException)`); los `UNIQUE(workout_id)` / `UNIQUE(idempotency_key)` son la defensa real. (e) `point_transactions.source` es `nullableMorphs` sin FK real: si una fase futura permite borrar una `Activity` (hoy imposible por API), tendría que limpiar sus filas de ledger — hoy el único camino de borrado es cascade por `user_id`. (f) Concurrencia real (POST paralelos) no simulable con SQLite `:memory:` en los tests — cubierta con test secuencial + tests de dominio del `UNIQUE`.
- Check-in write-through: (a) el dedupe "1/día" del frontend usa el día calendario del cliente; el del backend usa el día del servidor — pueden discrepar cerca de medianoche o con zonas horarias distintas (aceptado en modo sombra best-effort). (b) `check_in_date` es string `Y-m-d` sin cast (bucket de día) — decisión deliberada para que el `UNIQUE(user_id, check_in_date)` sea simple y portable; `checked_in_at` sí es `datetime`. (c) `check_ins` NO guarda gym/branch (el frontend pasa IDs del mock `data/gyms.js`) — el vínculo gym real es problema de la fase de conexión de Gym. (d) Huecos por `POST`/`PATCH` offline sin outbox — misma deuda que el write-through de actividad. (e) `GET /me/check-ins` sin paginación.
- Challenges write-through: (a) **modo sombra explícito — el backend NO verifica que el reto se completó**; solo comprueba que el `challenge_id` es uno de los 3 del día y no está ya reclamado. La completitud real se sigue calculando en el frontend (`progressForDay`). Un usuario podría "reclamar" desde DevTools un reto que no completó y el backend lo registraría; aceptado en sombra (el sistema entero ya es client-trusted), a resolver en el flip. (b) `ChallengeRules::TEMPLATES`/`forDate` son un **port de `data/community.js`** — si el frontend cambia los retos o el algoritmo de selección, el backend queda desincronizado (sin mecanismo de sincronización; misma clase de duplicación aceptada que `PointRules` vs `computeWorkoutPoints`). (c) `challenge_date` = día local del cliente; el backend solo rechaza futuro contra el día servidor (misma divergencia que check-in). (d) `challenge_id` sin FK (catálogo en código). (e) `claimChallenge` (frontend) sigue sin pasar por `grantPoints`/`pointsLog` — inconsistencia preexistente NO arreglada (fuera de alcance). (f) Huecos offline sin outbox; `GET /me/challenge-claims` sin paginación.
- `Program`/`ProgramDay`/`ProgramExercise`/`Workout`/`WorkoutExercise`/`ExercisePerformance` ya existen en backend con CRUD completo (ver FASES Programs Backend / Workout Backend), sin frontend conectado todavía. Una `customRoutine`/`buildRoutine()` actual (frontend) **no equivale** a un `Program`/`Workout` (backend) — coexisten sin migración ni conversión automática entre ambos (decisión aprobada).
- Programs Backend / Workout Backend: race condition teórica check-then-act sobre `position`/`set_number` (`SELECT ... exists()` seguido de `INSERT` sin lock) en los `store()` de Program/ProgramDay/ProgramExercise y de Workout/WorkoutExercise/ExercisePerformance — bajo escritura concurrente real sobre el mismo padre podría colarse un duplicado antes de que la constraint UNIQUE de la base de datos lo bloquee; esa constraint UNIQUE sigue siendo la última línea de defensa real. Aceptado como deuda conocida en ambas fases, no bloqueante para el volumen de uso actual, no resuelta.
- CoachAthleteRelationship: misma familia de race condition check-then-act que Programs/Workout, pero sin ninguna constraint UNIQUE de BD como última línea de defensa (el índice sobre `(coach_user_id, athlete_user_id)` no es UNIQUE, a diferencia de `position`/`set_number`) — bajo escritura concurrente real podría colarse una fila `pending`/`active` duplicada para el mismo par antes de que el chequeo de aplicación la bloquee. No resuelta, no bloqueante para el volumen actual. Adicionalmente: un atleta puede tener relaciones activas con múltiples coaches (sin restricción, decisión de alcance no explícitamente aprobada por el usuario de antemano, solo verificada coherente por QA post-hoc) — señalar si en el futuro se requiere limitar esto.
- Gym MVP (slice D-GYM): (a) el estado del miembro (`GET /me/gym/{gym}/members/{userId}`) es **sombra/best-effort** — misma deuda y aceptación explícita que Coach MVP (D-GYM-5). (b) `members`/`coaches` sin paginación (misma deuda que el resto de listados `/me/*`). (c) el gate `gym_admin` es una query inline en `GymAdminController::assertGymAdmin` (equivalente a `hasExactRoleInGym`); si aparecen más superficies gym-scoped conviene extraerlo a un helper/gate compartido — no se hizo para no ampliar el alcance. (d) `since` en los listados = `gym_assignments.created_at`; una reactivación (`inactive`→`active`) conserva el `created_at` original (fecha de la 1ª asignación, no de la reactivación) — aceptable en el MVP. (e) `whereNumber` en las rutas evita el 500 por segmento no-numérico SOLO en `me/gym/*`; el resto de la API (rutas coach, etc.) mantiene el comportamiento previo. (f) un `coach` concedido por un gym puede solicitar atletas que no son de ese gym (`CoachAthleteRelationship` no es gym-scoped, §8 — decisión previa, no regresión). (g) revocar la membresía de un usuario NO revoca su relación coach↔atleta ni ninguna otra (verificado en E2E y en test); son dominios independientes.
- Coach MVP (slice D-COACH): (a) los datos del atleta que ve el coach (`GET /me/coach/athletes/{id}`) son **sombra/best-effort** — si la app del atleta no sincronizó una sesión (offline, sin outbox), el coach no la ve; misma deuda que el resto del write-through, aceptada explícitamente en D-COACH-2. (b) `GET /me/coach/athletes` y `.../notes` sin paginación (misma deuda registrada que el resto de listados `/me/*`). (c) `coach_notes` sin `UNIQUE` (varias notas por par a propósito); sin FK-race relevante (no hay constraint que forzar). (d) `DELETE /me/coach/notes/{note}` NO exige que la relación siga `active` — solo pertenencia de la nota al coach; interpretación de D-COACH-4 (borrar tu propia nota toca solo tus datos), señalada, revisar si el producto define lo contrario. (e) una nota escrita permanece en BD tras revocarse la relación, pero deja de ser legible (todas las lecturas gatean por `activeBetween`); no hay purga.
- **`frontend-couch` — bloqueos de backend (Fase 1 cerrada; cada uno es una DECISIÓN DE PRODUCTO/ARQUITECTURA pendiente, no un bug; NO resolver de paso en otra fase):**
  1. **Asignación del rol `coach`**: **RESUELTO para el flujo MVP** por el slice Gym MVP (D-GYM-3): un `gym_admin` concede el rol `coach` a un usuario de su gym vía `POST /me/gym/{gym}/assignments {role: coach}` (verificado en el smoke E2E de D-CLIENT-COACH). Lo que sigue sin existir: auto-servicio / concesión del rol `coach` a un usuario **fuera de un gym** (sin endpoint; para ese caso aislado se concede a mano en la BD — `php artisan tinker` → `GymAssignment::create([...'role'=>'coach','status'=>'active'])`; snippet en `frontend-couch/CLAUDE.md`). `POST /me/coach-relationships` sigue respondiendo 422 sin un `GymAssignment(role=coach, status=active)` vigente.
  2. **Acceso coach-scoped a datos de atletas**: **PARCIALMENTE RESUELTO** por el slice D-COACH (ver `FASE: Coach MVP — información del atleta + notas`). Un coach con relación `active` YA puede LEER, vía `CoachAthleteController` (`GET /me/coach/athletes`, `GET /me/coach/athletes/{id}`), el `Profile` + resumen de actividad + racha (`StreakRules`) + saldo de puntos del atleta — datos de calidad **sombra/best-effort** (D-COACH-2). Sigue SIN existir: acceso del coach a **programas / workouts / check-ins crudos / progreso detallado** del atleta — todos esos `me/*` siguen auto-scopeados al usuario. No inventar ni mockear esos datos; su diseño es Fase 5.
  3. **Búsqueda / lookup de usuarios (para `frontend-couch`)**: sigue sin existir. Solicitar un atleta exige su **ID numérico exacto** (`athlete_user_id`, entero); la UI lo pide directamente. NOTA: el slice Gym MVP añadió un lookup por email **acotado al `gym_admin` de un gym** (`GET /me/gym/{gym}/user-lookup`), pero es específico de esa superficie — no hay lookup general reutilizable por el coach. Un lookup general → Fase 5.
  4. **E2E visual y empaquetado Android pendientes**: la validación E2E se hizo por HTTP directo contra el backend + revisión de código + `build`; el E2E visual en navegador/dispositivo NO se ejecutó (extensión de Chrome no disponible en la sesión de QA) y `npx cap add android` todavía no se ha corrido (no hay carpeta `frontend-couch/android/`). Responsive/mobile y comportamiento real en Capacitor quedan sin verificar en pantalla.
- Comportamiento de errores en desarrollo (`APP_DEBUG=true`, preexistente, no introducido por Programs/Workout Backend): cualquier excepción no anticipada expone stack trace/SQL en la respuesta HTTP. Ya mitigado específicamente para los conflictos de `position`/`set_number` (ahora 422 limpio en vez de 500 en ambas fases), pero sigue siendo el comportamiento general del entorno para excepciones no cubiertas.
- `GET /me/workouts` sin paginación (decisión aprobada para la fase Workout Backend): el historial de Workouts crece sin límite con el uso real de la app, a diferencia de Programs (pocos registros por usuario). Podrá requerir paginación en una fase futura si el volumen lo justifica — no resuelta ahora.

## CADENA DE DOMINIO (backend, `backend/CLAUDE.md`)

```
Exercise (catálogo)  → Program → ProgramDay → ProgramExercise → Workout → WorkoutExercise → ExercisePerformance
     CLOSED               CLOSED    CLOSED         CLOSED         CLOSED       CLOSED            CLOSED

Activity        (ORTOGONAL — no es un eslabón; workout_id nullable 0..1)               CLOSED
CheckIn         (ORTOGONAL — check-in diario; UNIQUE(user_id, check_in_date))          CLOSED
ChallengeClaim  (ORTOGONAL — claim de reto; UNIQUE(user_id, date, challenge_id))       CLOSED
RewardClaim     (ORTOGONAL — canje de premio; UNIQUE(user_id, reward_uid))             CLOSED
PointTransaction (ledger append-only; source polimórfico → Activity|CheckIn|ChallengeClaim|RewardClaim)  CLOSED
```

Toda la cadena de dominio hasta `ExercisePerformance` está implementada y cerrada en backend, con el frontend conectado a `Activity`/`PointTransaction`/`CheckIn`/`ChallengeClaim`/`RewardClaim` solo en modo write-through sombra (LocalStorage sigue siendo la fuente visible). Cada concepto permanece separado según `backend/CLAUDE.md`. `Activity`, `CheckIn`, `ChallengeClaim` y `RewardClaim` son dominios ortogonales a la cadena: hechos históricos que alimentan el ledger `PointTransaction` (`reason` `workout_completed` / `checkin` / `challenge_claimed` / `reward_claimed`, este último el primer DÉBITO — monto negativo). `ChallengeClaim` NO verifica completitud y `RewardClaim` NO verifica la condición de desbloqueo (ambos frontend-local); `RewardClaim` SÍ valida el saldo contra el propio ledger backend antes de debitar. La **racha autoritativa** SÍ existe en backend (`StreakRules`/`GET /me/streak`, derivada de `check_ins`, solo lectura) pero NO reemplaza aún el `streak` local visible; SÍ alimenta puntos de forma indirecta (el frontend envía su racha local como hecho de sesión a `POST /me/activities`, ver fase "Puntos — paridad de racha"). **Duelos** ya es un dominio de backend real (roadmap 3b — `duels`/`duel_runs`/`DuelRules`/`DuelController`, ver `FASE: Duelos reales`): con él el ledger `PointTransaction` tiene sus 5 fuentes (`duel_won`/`duel_lost` best-effort). Falta en backend: Ranking y Notifications; ambos dependen del ledger + comunidad real de `User`.

`CoachAthleteRelationship` es un dominio independiente, ORTOGONAL a esta cadena: no es un eslabón de Exercise→...→ExercisePerformance, sino una relación de consentimiento entre dos `User`, ligada a `GymAssignment` solo como precondición de creación (requiere `role=coach` activo al solicitar), sin modificarlo. No confundir con `GymAssignment` (rol dentro de un gym/branch) ni asumir que reemplaza la deuda pendiente de "administración de roles por terceros" — son conceptos distintos. El slice **Coach MVP** (D-COACH) añade `CoachAthleteController` + `CoachNote`: con la relación `active` como gate (`activeBetween`), un coach LEE datos sombra del atleta (Profile/actividad/racha/puntos, reutilizando `StreakRules` y el `SUM` del ledger — sin autoridad nueva) y escribe notas privadas. NO toca ningún `me/*` del atleta, ni `Program`/`Workout`, ni el dominio Gym.

El slice **Gym MVP** (D-GYM) es la PRIMERA activación real de `GymAssignment` como autorización: `GymAdminController`, gateado por un `GymAssignment(role=gym_admin, active)` en el `{gym}` de la ruta, deja al `gym_admin` (a) listar los assignments `member`/`coach` activos de SU gym, (b) resolver un usuario por email exacto, (c) conceder/revocar `member`/`coach` a otros usuarios EN SU gym (nunca `gym_admin`/`staff`, nunca en otro gym), y (d) leer el mismo `AthleteSnapshot` sombra de un miembro activo. `Gym`/`Branch`/`GymAssignment` se reutilizan sin migración ni cambio de esquema. Sigue SIN existir: `Organization` por encima de `Gym`, `Gym` con lat/lng/dirección/estado, `staff` operativo, concesión de `gym_admin`, creación de `Gym` por API, y acceso del gym a programas/workouts del miembro (nada de eso está en el slice).

## SIGUIENTE FASE

**Roadmap aprobado (decisión del usuario en la sesión de Consolidación post-D1).** Todo local salvo el paso 2. Cada paso es su propia fase con Architect/discovery real antes de implementar.

1. **Consolidación post-D1** — CERRADA (esta fase, commits `docs:`). Working tree sin deriva; 3 `CLAUDE.md` alineados con la arquitectura real; `chatv1.txt` eliminado; roadmap y decisiones D2–D8 registrados. NO implementa ninguna feature.
2. **MVP Producción — deploy** — **🟡 BLOCKED (infra)**. Etapa 0 (prep del repo) HECHA; 2ª ronda de discovery de hardening HECHA (`docs/PRODUCTION_HARDENING_DISCOVERY.md`). Etapas 1–2 (ejecución) BLOCKED por infra/credenciales/decisión externa. **F1–F3 (fixes de código pequeños) son obligatorios antes de exponer a Internet; F4 recomendado; F5 opcional.** DECISIÓN pendiente: alcance = solo `backend/`+`frontend-usuario/` o también `frontend-couch/`+`frontend-gym-web/` (ambos ya funcionales). `frontend-gym` móvil FUERA. Ver `## ESTADO MVP`, `DEPLOY.md`, `docs/PRODUCTION_HARDENING_DISCOVERY.md`.
3. **Bloque Puntos** (en orden, cada sub-paso su propia fase):
   - **3a — D2, semántica de racha**: **IMPLEMENTADO (sin commit)** — ver `FASE: Racha canónica (D2 / roadmap 3a)`. `current_streak` (de `StreakRules`, rompe con un día perdido) es la "racha" visible en Home/Profile/Challenges; `longest_streak` es "récord". Fuente única: `GET /me/streak`. `StreakRules` sin cambios. Precede al flip.
   - **3b — Duelos reales**: **IMPLEMENTADO (sin commit)** — ver `FASE: Duelos reales (roadmap 3b)`. Dominio de backend nuevo (`duels` + `duel_runs` + `DuelRules` + `DuelController`), `User` reales del mismo gym, duelo asíncrono 1v1 resuelto cara a cara. Ledger `PointTransaction`: 5ª y última fuente (`duel_won`/`duel_lost`, best-effort). El saldo VISIBLE sigue LocalStorage (`reconcileDuels` concilia la apuesta) — NO es el flip.
   - **3c — Flip de autoridad de puntos**: el frontend lee saldo/historial del backend. Requiere 3a + 3b + reconciliación de huecos offline (outbox/retry) + paridad de `Analytics.jsx` (protegido) / `validation.js#competitivePoints`.
4. **Ranking real** — sobre el saldo AUTORITATIVO (post-flip) + comunidad real de `User` + `GymAssignment`/ciudad/país conectados + `rankingOptIn` backend. NO antes del flip.
5. **Coach / Gym (resto)** — lo que los slices D-COACH y D-GYM NO cubren: acceso del coach/gym a programas/workouts del atleta, programas asignados por coach (D3), `Organization` por encima de `Gym`, `Gym` con lat/lng/dirección/estado, `staff` operativo, concesión de `gym_admin` por API, creación de Gym por API/UI, lookup general de usuarios, `frontend-gym` móvil, permisos granulares. Depende de la dirección de D3 y del resto de D5.
6. **Billing** — post-producción. Requiere MVP desplegado + decisión de monetización/proveedor/modelo. No existe nada hoy.

**Nota — Vouchers V1, FUERA de este roadmap aprobado, PENDIENTE DE DECISIÓN
DE ENCAJE.** Existe una implementación completa y testeada de un dominio
`Voucher` (Gym→Athlete, Coach→Athlete — ver `FASE: Vouchers V1` arriba y
`BIAFYT_BUSINESS_CORE.md` §52), pero no fue registrada como parte de
ningún paso 1–6 de arriba: no hay una decisión explícita del usuario que la
incluya en este roadmap ni que defina su orden respecto a Puntos/Ranking/
Coach-Gym/Billing. Antes de continuar este trabajo hace falta decidir dónde
encaja, si se amplía a Gym→Coach, y si/cuándo se aborda la mitad
BIAFYT→inscripción (que toca Billing, paso 6, hoy sin decisión de
monetización).

**Nota — Promotion V0, FUERA de este roadmap aprobado, alcance PARCIAL.**
Por decisión explícita del usuario se implementó únicamente la porción
BIAFYT → inscripción de Athlete (registro) de la mitad "plataforma" que
`Vouchers V1` había dejado señalada como `PENDIENTE DE DECISIÓN` — ver
`FASE: Promotion V0` arriba y `BIAFYT_BUSINESS_CORE.md` §52. Sigue sin
existir: promoción de inscripción de Gym, promoción de inscripción de
Coach, y cualquier vínculo con Billing (paso 6, sin decisión de
monetización). No amplía ni reordena el roadmap 1–6 de arriba.

**Excepción registrada — Coach MVP (slice) YA CERRADO.** Por decisión explícita
del usuario (D-COACH-1..5, ver `BIAFYT_BUSINESS_CORE.md` §46 D-COACH) se
adelantó el slice mínimo de Coach: lectura coach-scoped del atleta
(`Profile` + actividad + racha + puntos, gate = relación `active`) + notas de
feedback (`CoachNote`). Ver `FASE: Coach MVP — información del atleta + notas`.
Esto NO abre el resto de la Fase 5 (programas/asignaciones, dominio Gym
completo, `staff`, `gym_admin` por API, creación de Gym, acceso a programas/
workouts) — todo eso sigue diferido a la Fase 5. El bloqueo #2 de
`frontend-couch` ("acceso coach-scoped a datos de atletas") queda
**parcialmente resuelto** (solo lectura de Profile/actividad/racha/puntos;
sin programas/workouts del atleta).

**Excepción registrada — Gym MVP (slice) YA CERRADO.** Por decisión explícita
del usuario (D-GYM-0..9, ver `BIAFYT_BUSINESS_CORE.md` §46 D-GYM) se
adelantó el slice mínimo de Gym: `gym_admin` administra `member`/`coach`
(alta por email + revocación) y lee el estado sombra de un miembro
(`AthleteSnapshot`), TODO scopeado a su propio gym. Ver `FASE: Gym MVP —
gestión de miembros/coaches + estado del miembro`. Activa `gym_admin` (D5
revisada). NO abre: `staff`, `gym_admin` por API, creación de Gym,
`Organization`, `Gym` con lat/lng/estado, acceso a programas/workouts,
`frontend-gym` móvil — todo eso sigue en Fase 5. `frontend-usuario` y
`frontend-couch` intactos.

### DECISIONES D2–D8 — TOMADAS, NO IMPLEMENTADAS

Cerradas por el usuario en la sesión de Consolidación post-D1. Ninguna está implementada; ninguna cambia código/API/esquema/dominio hasta su fase.

- **D2 — Racha canónica**: **IMPLEMENTADA (sin commit, roadmap 3a).** `current_streak` (rompe con un día perdido, de `StreakRules`) = la "racha" visible; `longest_streak` (nunca decrece) = "récord". Fuente única = `GET /me/streak`, consumida por `AppContext` (`streak` en memoria, se recarga en cada arranque con sesión y tras cada check-in) y mostrada en `Home.jsx`/`Profile.jsx`/`Challenges.jsx`. Sin fallback a `identity.user.streak` (que persiste pero solo como hecho de sesión para puntos hasta el flip). Ranking (mock) sin tocar. Sigue precediendo al flip (3c).
- **D3 — Program/Workout backend vs Custom Routines**: la cadena `Program`→`Workout` del backend representa **programas estructurados de coach (top-down)**. `buildRoutine`/`customRoutines` siguen siendo la vía del solo-user. El puente entre ambos queda diferido a una decisión explícita futura. Sin conexión de frontend a `Program`/`Workout` hasta entonces.
- **D4 — Flip de autoridad de puntos**: NO todavía. Bloqueado por duelos fuera del ledger + D2 + reconciliación offline + paridad `Analytics.jsx`. Es el paso 3c.
- **D5 — Roles `staff`/`gym_admin`**: **PARCIALMENTE REVISADA por D-GYM** (ver abajo). `gym_admin` está ACTIVO (autorización real en `GymAdminController`, acotada a member/coach dentro del propio gym). `staff` sigue **dormante**: `GymAssignment::ROLE_STAFF` y la parte de `ROLE_RANK`/`hasRoleInGym()` que lo cubre permanecen sin uso funcional. `GymAssignment.php`/`ROLE_RANK`/`activeFor()`/`booted()` sin tocar. `gym_admin` NO se concede ni revoca por API (bootstrap manual). El resto de la administración organizacional (staff, Organization, permisos granulares) sigue en Fase 5.
- **D6 — Siguiente fase**: NO es Ranking. Es Consolidación (paso 1) → deploy (paso 2). "Ranking básico" queda **descartado** como siguiente fase (dependía de datos/flip inexistentes).
- **D7 — Billing**: fuera del roadmap cercano hasta MVP desplegado + decisión de monetización. Es el paso 6.
- **D8 — Desbloqueo Coach/Gym**: diferido hasta después de cerrar el Bloque Puntos (paso 3). Es el paso 5. **PARCIALMENTE REVISADA por D-COACH** (ver abajo y `BIAFYT_BUSINESS_CORE.md` §46 D-COACH): se adelantó SOLO el slice mínimo de Coach (lectura del atleta + notas). El resto de D8 (programas/asignaciones, dominio Gym, authz, lookup de usuarios, asignación de rol coach) sigue diferido a la Fase 5.
- **D-COACH — Adelanto del Coach MVP (slice)**: TOMADA E IMPLEMENTADA (ver `FASE: Coach MVP — información del atleta + notas`).
  - **D-COACH-1**: adelantar el Coach MVP por delante del Bloque Puntos y de Ranking real. Revisa el orden de D6 y de §47 para este slice concreto.
  - **D-COACH-2**: los datos del atleta que ve el coach son **sombra/best-effort** (Profile autoritativo; actividad/puntos/racha del write-through, con posibles huecos offline). Se renuncia explícitamente a la premisa de D8 de "datos de atleta suficientemente reales" para este slice.
  - **D-COACH-3**: un coach con relación `active` puede LEER `Profile` + resumen de actividad + racha (`current`/`longest` de `StreakRules`) + saldo de puntos del atleta. Solo lectura. NO: check-ins crudos/ubicación, rewards, duelos, programas/workouts del atleta, edición de nada.
  - **D-COACH-4**: la acción del Coach MVP es una **nota de texto libre** (`CoachNote`), privada del coach, que el atleta NO recibe todavía. NO programas ni asignaciones.
  - **D-COACH-5**: el rol `coach` se sigue concediendo a mano en la BD (sin endpoint); el atleta se sigue solicitando por ID numérico exacto (sin búsqueda). Administración de roles y lookup de usuarios → Fase 5. **ACTUALIZACIÓN (D-GYM-3)**: ahora un `gym_admin` SÍ puede conceder el rol `coach` a un usuario de su gym (`POST /me/gym/{gym}/assignments`), y existe un lookup por email ACOTADO al gym_admin (`GET /me/gym/{gym}/user-lookup`). El lookup general de usuarios sigue sin existir; el `coach` inicial fuera de un gym sigue siendo manual.
- **D-GYM — Adelanto del Gym MVP (slice)**: TOMADA E IMPLEMENTADA (ver `FASE: Gym MVP — gestión de miembros/coaches + estado del miembro`).
  - **D-GYM-0**: activar `gym_admin` y adelantar el Gym MVP como slice explícito, por delante del Bloque Puntos y de Ranking. Revisa D5, D6 y §47 para este slice.
  - **D-GYM-1**: Gym MVP = ver miembros + ver coaches + estado mínimo del miembro + alta/revocación de `member`/`coach`.
  - **D-GYM-2**: solo `gym_admin` administra usuarios en este MVP (`staff` no).
  - **D-GYM-3**: `gym_admin` inicial = bootstrap manual (tinker), sin endpoint. `member`/`coach` se asignan/revocan por el `gym_admin` vía API/UI. `gym_admin` y `staff` NUNCA por API. Nunca en otro gym.
  - **D-GYM-4**: Opción A — el `gym_admin` añade miembros/coaches por email. `frontend-usuario` NO se toca. La pertenencia real vive en `GymAssignment` aunque la app Cliente no la muestre (§31 se respeta).
  - **D-GYM-5**: el `gym_admin` ve de un miembro el MISMO snapshot que Coach MVP (`profile` + `activity_summary` + `streak` + `points`). Datos sombra/best-effort. Solo lectura.
  - **D-GYM-6**: SOLO `frontend-gym-web` entra en el MVP. `frontend-gym` (móvil/Capacitor) queda para una fase posterior.
  - **D-GYM-7**: Programs/Workouts/asignaciones de workout quedan 100% fuera.
  - **D-GYM-8**: sin endpoint para crear `Gym`/`Branch`/`gym_admin` — bootstrap por tinker.
  - **D-GYM-9**: contradicción documental corregida — `frontend-gym` = móvil/Capacitor, `frontend-gym-web` = web (ver §"Gym UI Foundation" y root `CLAUDE.md`, ya coherentes con el código).

### Legacy D — ELIMINADO

Los ~150 archivos legacy "D" en la raíz (`android/`, `src/`, `package.json`, `README.md`, …) — el monolito pre-reestructuración — se mantuvieron deliberadamente fuera de la Consolidación post-D1 hasta que el usuario autorizó la limpieza; fueron **eliminados** en el commit `20ed683` (ver `## ESTADO DEL REPO / ACLARACIONES`).

### Guard

NO asumir automáticamente la siguiente fase. Repetir Architect/discovery real contra el repositorio antes de proponer o implementar cualquier paso. El orden de arriba es el acuerdo actual, no una obligación ciega — si el discovery revela una dependencia nueva, detenerse y reportar. En particular: **Duels** es un dominio multijugador nuevo (no un write-through); el **flip de autoridad** requiere las 5 fuentes del ledger + reconciliación offline + paridad de `Analytics.jsx` (protegido); **Ranking** necesita saldo autoritativo + `GymAssignment`/ciudad/país + `rankingOptIn` backend.

Últimas en `main` (chore/docs, no fases): **eliminación del legacy monolith** (`20ed683`) + **README raíz multi-app** (`353aebd`) + **sync de docs con el estado real** (`004ba5b`, `0f1c467`) + esta sync (`docs:`). HEAD de `main`: `8961a73`. `origin/main` confirmado en `e4cda8f`; `8961a73` pendiente de push.
Últimas fases cerradas: **Cliente ↔ Coach — consentimiento en la app del atleta** (slice D-CLIENT-COACH, commit `8961a73`; cierra el lazo MVP Cliente → Coach → Gym, validado E2E contra backend local, PASS); **Gym Onboarding + BIAFYT Admin** (slice D-GYM-ONBOARDING, commit `e1be4f6`, mergeado a `main` en `80e0057`); **Gym MVP — gestión de miembros/coaches + estado del miembro** (slice D-GYM, commit `91a2653`); **Coach MVP — información del atleta + notas** (slice D-COACH, commit `aed5490`); **Consolidación post-D1** (commits `docs:`); **frontend-couch — App del rol Coach (Fase 1)** — `e23f31d`; **Rewards — persistencia backend** + **Puntos — paridad de racha en backend** — cierre D1 `de34897` (ver FASES); **Activity + Points (backend)** — `66b801b` / `e688537`; **Frontend write-through** — `ad2c412` / `11f2eca`; **Check-in write-through** — `f5fa82d` / `0dd6a1a`; **Challenges write-through** + **Streak backend autoritativo** — `9541277`.

## PHASE WORKFLOW

```
Architect/discovery
  → decisión explícita (del usuario)
  → implementation
  → Fitness/Domain Review (cuando el dominio fitness esté involucrado)
  → QA
  → Independent Review
  → closure
```

Una fase marcada CLOSED **no se reabre** salvo evidencia técnica nueva concreta o instrucción explícita del usuario.

## NON-REDUNDANCY RULES

- Antes de crear una función/helper, buscar si ya existe (`grep`/lectura de los archivos de la tabla de fuentes de verdad).
- Antes de crear un modelo, endpoint, componente o servicio, verificar si ya existe uno equivalente (p. ej. `Gym`/`Branch`/`GymAssignment` ya existen en backend, sin exponer).
- Reutilizar contratos y fuentes de verdad existentes — no crear una segunda fuente de verdad para ejercicios, prescripción, identidad o catálogo.
- No duplicar lógica de prescripción fitness fuera de `exercisePrescription.js`/`training.js`.
- No migrar datos ni introducir heurísticas (p. ej. matching por nombre) sin necesidad demostrada y aprobación explícita.
- No ampliar el alcance de una fase para corregir deudas preexistentes salvo aprobación explícita — reportarlas, no resolverlas de paso.
- No modificar archivos protegidos sin autorización explícita y sin haber demostrado que no hay alternativa dentro del archivo en alcance.
- No asumir que la siguiente fase es backend, Gym/Branch, Programs, Workouts, Activities o Multi-tenancy: siempre ejecutar primero Architect/discovery contra el repositorio real.
