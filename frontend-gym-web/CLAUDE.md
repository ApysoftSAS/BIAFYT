# CLAUDE.md — frontend-gym-web

App **Gym Web** (navegador/desktop) de BIAFYT. Superficie hermana de
`../frontend-gym/` (Gym App **móvil/Capacitor**); comparten identidad
visual, no navegación. El backend es `../backend/` (Laravel).

## ESTADO: Gym UI Foundation + slice Gym MVP (D-GYM) CERRADO

La foundation (shell web + login Sanctum) sigue en pie. **El slice Gym MVP
(D-GYM) añadió gestión real**: un `gym_admin` administra los roles
`member`/`coach` de su gym y consulta el estado (sombra) de un miembro.
**No agregar más funcionalidades ni cambios arquitectónicos sin una
decisión explícita nueva.** Ver `../PROJECT_STATE.md` → `FASE: Gym MVP` y
`../BIAFYT_BUSINESS_CORE.md` §46 D-GYM.

`lint`, `test` y `build` en verde.

## Qué existe

| Elemento | Estado |
|---|---|
| Bootstrap React 19 + Vite 8 (**sin Capacitor**) | Real |
| Shell web: sidebar + topbar + main, `.gym-table`, `.gym-grid`, `Panel`, responsive (<860px colapsa el sidebar) | Real |
| Login / registro / logout (`/auth/*` Sanctum) + sesión persistida (`SessionContext`, token en LocalStorage, revalidación al arrancar) | Real |
| Detección de rol: tras `auth/me`, `GET /me/gym-assignments` → gyms donde el usuario es `gym_admin` activo | **Real** (slice D-GYM) |
| `NoGymAccess` — sin `gym_admin` activo → pantalla "Sin acceso de Gym", sin shell, sin datos de ningún gym | **Real** |
| `Workspace` — alta de persona por email + rol + sede; tablas de miembros/coaches con revocar (confirmación en `Modal`); abre el detalle del miembro | **Real** (slice D-GYM) |
| `MemberDetail` (`Modal`) — snapshot sombra del miembro | **Real** (slice D-GYM) |
| `Overview` — cifras reales (sedes/miembros/coaches del gym) | **Real** (slice D-GYM) |
| `Inventory` — inventario del gym (añadir/quitar/togglear disponibilidad de items del catálogo global) + "Solicitar nuevo equipamiento" + "Mis solicitudes" (editar y reenviar si BIAFYT pide correcciones) | **Real** (Fase 5: D-GYM-INVENTORY + D-GYM-EQUIPMENT-REQUEST) |
| `Reports` — reportes administrativos: KPIs (miembros, check-ins hoy/periodo, dentro ahora estimado, hora pico, permanencia, nuevos, entrenamientos), horas pico, mapa día×hora, asistencia diaria, por sede, miembros sin asistir, vouchers; filtros 7/30/90 días y sede; vista de tabla | **Real** (2026-11-15) |
| `Branches` — sedes del gym: crear, renombrar, eliminar (no la única ni una con miembros/historial → 422) | **Real** (2026-11-14) |
| `Vouchers` — emitir a UN miembro, a VARIOS (todos / una sede / elegidos) o con un CÓDIGO COMPARTIDO con cupo; vigencia "N días" o fecha; tabla de códigos (canjes, cerrar); lista, "Marcar usado", "Anular" | **Real** (2026-11-15; `VoucherIssuePanel.jsx`, `utils/voucher.js`) |
| Rol `staff` (recepción) | **Real** (2026-11-15): lo concede/revoca el gym_admin desde Espacio (tabla "Staff"); ve Resumen, Espacio (miembros + coaches solo lectura; da de alta/baja SOLO miembros), Vouchers (solo "Marcar usado") y Cuenta. NO ve Reportes, Sedes ni Inventario (`utils/gym.js#canOpen`; el backend responde 404 igual) |
| Concesión de `gym_admin` | **NO existe** por API (bootstrap `BIAFYT:grant-gym-admin`) |

## Endpoints del backend que usa

Todos bajo `VITE_API_BASE_URL` (`.env`), prefijo `/api/v1`. Definidos en
`../backend/routes/api.php` — **ninguno inventado**. Cliente en
`src/utils/api.js`.

| Método | Ruta | Uso | Gate backend |
|---|---|---|---|
| POST | `/auth/{register,login}` · POST `/auth/logout` · GET `/auth/me` | Sesión | — / token |
| GET | `/me/gym-assignments` | Detectar el/los gym(s) donde soy `gym_admin` activo | token; solo las propias activas |
| GET | `/gyms` (público) | Sedes del gym administrado (`gym.branches`) | — |
| GET | `/me/gym/{gym}/members` · `/coaches` | Listas de `member`/`coach` activos del gym | `gym_admin` activo en `{gym}` |
| GET | `/me/gym/{gym}/user-lookup?email=` | Resolver un usuario por email EXACTO → `{id,name}` | `gym_admin` activo en `{gym}` |
| POST | `/me/gym/{gym}/assignments` | Alta: body `{user_id, role:"member"\|"coach", branch_id?}` | `gym_admin` activo en `{gym}` |
| DELETE | `/me/gym/{gym}/assignments/{id}` | Revocar (→ `inactive`, no borra) | `gym_admin` activo en `{gym}` |
| GET | `/me/gym/{gym}/members/{userId}` | Snapshot sombra del miembro | `gym_admin` de `{gym}` **Y** target = `member` activo de `{gym}` |
| GET | `/equipment` (público) | Catálogo global de equipamiento (solo `is_active`) | — |
| GET · PUT · DELETE | `/me/gym/{gym}/equipment[/{equipment}]` | Inventario del gym: leer catálogo anotado, añadir/togglear `available`, quitar | `gym_admin` activo en `{gym}` |
| GET · POST · PATCH | `/me/gym/{gym}/equipment-requests[/{equipmentRequest}]` | Solicitar una máquina nueva al catálogo global; editar+reenviar mientras `pending`/`changes_requested` | `gym_admin` activo en `{gym}` |
| GET | `/me/gym/{gym}/reports?days=&branch_id=` (`days` = 7, 30 o 90) | Reporte administrativo (solo lectura; backend `App\Support\GymReport`) | `gym_admin` activo en `{gym}` |
| GET · POST · PATCH · DELETE | `/me/gym/{gym}/branches[/{branch}]` | Sedes del gym (con `members_count`) | `gym_admin` activo en `{gym}` |
| GET · POST | `/me/gym/{gym}/vouchers` · POST `.../vouchers/{id}/redeem` · `.../revoke` | Vouchers del gym a sus miembros | `gym_admin` activo en `{gym}`; destinatario = `member` activo |

## Authz / anti-IDOR (lo que el backend garantiza — no replicar en frontend)

- **404 siempre, nunca 403**, cuando el caller no es `gym_admin` activo de
  `{gym}`, cuando el `{gym}` no existe, cuando el recurso pertenece a otro
  gym, o cuando el target de `members/{userId}` no es `member` activo de ese
  gym. El frontend solo traduce el `ApiError` a un mensaje.
- El `gym_id` sale **exclusivamente de la ruta**; el backend ignora cualquier
  `gym_id` en el body. El frontend NUNCA toma un `gym_id` de LocalStorage:
  lo deriva de `GET /me/gym-assignments` en cada arranque.
- `role` en `POST assignments` está limitado a `member`/`coach` server-side;
  `gym_admin`/`staff` → 422. No intentar concederlos desde la UI.
- Revocar una membresía **no** toca la relación coach↔atleta ni ninguna otra
  — son dominios independientes.
- Rutas `me/gym/{gym}/*` con params numéricos-only (`whereNumber`): un
  segmento no-numérico → 404 en el router.

## Shape de datos

- **Assignment** (listas + alta): `{ id, user: {id, name}, role, branch: {id, name} | null, since }`. Sin `email`, sin ids internos.
- **Snapshot del miembro** (`memberDetail`): `{ athlete: {id, name}, profile: {...} | null, activity_summary: {count, last_activity_at, total_sets, total_exercises, total_duration_seconds, recent: [...] }, streak: {current_streak, longest_streak}, points: {balance} }`. **Idéntico** al de Coach MVP (`GET /me/coach/athletes/{id}`) — mismo `App\Support\AthleteSnapshot` en backend. **Calidad sombra/best-effort**: `Profile` es autoritativo; actividad/puntos/racha vienen del write-through de la app del Cliente y pueden tener huecos offline.
- **NO se muestra** de un miembro: email, ubicación, rewards, duelos, notas del coach, nada fuera del snapshot. **Solo lectura** — el gym_admin no edita datos del miembro.

## Arquitectura / estado

`src/state/SessionContext.jsx` — sesión Sanctum + `gymAccess`
(`{status: "loading"|"ok"|"none", gyms: [{id,name}], activeGymId, error}`).
`gyms` = gyms donde el usuario es `gym_admin` activo (`utils/gym.js#adminGymsFrom`:
filtra por rol, deduplica por gym, ordena nombre→id para una selección por
defecto determinista). `selectGym(gymId)` para multi-gym. El detalle del
miembro NO se persiste en el contexto: es estado por-pantalla en
`MemberDetail`. Acciones del contexto envueltas en `runAuthed` (401 → cierra
sesión).

`src/utils/gym.js` — lógica pura con test (`gym.test.js`): `dedupeById`,
`adminGymsFrom`, `profileRows`, `formatDuration`, `formatDate`.

Pantallas: `Auth`, `NoGymAccess`, `Overview`, `Reports`, `Workspace`, `MemberDetail`
(Modal), `Branches`, `Inventory`, `Vouchers`, `Account`. Navegación por estado en
`App.jsx` (sin router), que gatea `authChecking` → `signedIn` → `gymAccess.status`.

**Reportes — qué significan los números (no esconder estas limitaciones en la UI):** el check-in NO guarda en qué gimnasio ocurrió, así que se atribuye al gym por la membresía ACTIVA del autor, desde su fecha de alta (alguien miembro de dos gyms cuenta en ambos). Solo ve a quien usa la app BIAFYT: no es un conteo de acceso físico. "Dentro ahora" es un ESTIMADO (check-in de hoy sin salida en las últimas 3 h). Horas y días en `REPORT_TIMEZONE` (la BD está en UTC). Gráficos propios en `components/Charts.jsx` (HTML/CSS, sin librería; tooltips por portal a `<body>` porque las tarjetas usan `backdrop-filter`); helpers puros en `utils/report.js`.

Alcance del MVP (lo que NO se puede hacer aquí sin decisión nueva):
conceder `gym_admin`, crear gyms, programas/workouts del miembro,
`frontend-gym` móvil, tocar `frontend-usuario`/`frontend-couch`.

## Comandos

```bash
npm install --legacy-peer-deps   # bug de npm 10.9.4 con peers de vitest
npm run dev                       # requiere .env con VITE_API_BASE_URL
npm run build
npm run lint
npm run test
```

## Convenciones

Colores solo vía `theme/colors.js`; identidad de app solo vía
`config/appConfig.js`; textos y comentarios en español; reutilizar
`components/UI.jsx` (`Card`, `Panel`, `Button`, `Field`/`Input`, `Badge`,
`Stat`, `EmptyState`, `Modal`) y las clases del shell web (`.gym-table`,
`.gym-grid`, `.gym-main-head`) antes de crear nada nuevo. Sin monorepo: si
cambia el sistema visual en `frontend-usuario`, re-sincronizar a mano.

## Staff, exportación (2026-11-15)

- Rol por gym: `SessionContext.activeRole` (`gym_admin` | `staff`, de `utils/gym.js#gymAccessFrom`). Capacidades de staff = PROPUESTA mía, no decisión de negocio: ver `BIAFYT_BUSINESS_CORE.md` §55. `GET /me/gym/{gym}/staff` es solo gym_admin.
- Reportes exporta a **CSV** (`utils/report.js#reportToCsv`, `;` + BOM, neutraliza fórmulas) y a **PDF** vía `window.print()` con estilos `@media print` (sin colores propios: `Canvas`/`CanvasText`). En la app nativa (Capacitor) no se muestran los botones.

### Endpoints de vouchers añadidos (2026-11-15)

`POST /me/gym/{gym}/vouchers/bulk` (`scope` all|branch|selected, todo o nada, máx. 500) · `GET·POST /me/gym/{gym}/voucher-campaigns` · `POST /me/gym/{gym}/voucher-campaigns/{id}/close`. Los tres son solo gym_admin (staff → 404). El atleta canjea el código con `POST /me/voucher-campaigns/claim` desde `frontend-usuario`.
