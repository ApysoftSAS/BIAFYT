# CLAUDE.md — frontend-couch

App **Couch** de BIAFYT (rol coach/entrenador). Creada a partir de
`frontend-usuario/`, reutilizando su template, sistema visual (theme,
`App.css`, `components/UI.jsx`), andamiaje de build (Vite 8 + React 19 +
Capacitor 8) y patrón de sesión Sanctum. **No es un rediseño**: misma
identidad visual y arquitectura que la app de usuario.

## ESTADO: Fase 1 CERRADA + slice Coach MVP (D-COACH) CERRADO

Primera fase entregable (Auth + relación de consentimiento coach↔atleta) +
el slice **Coach MVP** (D-COACH): pantalla de detalle de atleta con lectura
de datos **sombra** (Profile + resumen de actividad + racha + puntos) y
notas de feedback. **No agregar más funcionalidades ni cambios
arquitectónicos sin una decisión explícita nueva.** El bloqueo #2 de abajo
quedó parcialmente resuelto; los demás siguen requiriendo trabajo de backend
(Fase 5).

`lint`, `test` y `build` en verde. Ver `PROJECT_STATE.md` → `FASE: Coach MVP
— información del atleta + notas` y `BIAFYT_BUSINESS_CORE.md` §46 D-COACH.

## Funcionalidades implementadas y validadas

Validadas extremo a extremo contra el backend Laravel real
(`php artisan serve`, MySQL `BIAFYT`) vía peticiones HTTP directas:

| Funcionalidad | Estado |
|---|---|
| Registro (nombre/correo/contraseña) | **Implementado y validado** — 201 `{user, token}` |
| Login (correo/contraseña) | **Implementado y validado** — credenciales incorrectas → 422 bajo `email` |
| Logout | **Implementado y validado** — revoca el token en el backend; la sesión local se limpia aunque falle |
| Persistencia de sesión | **Implementado y validado** — token en LocalStorage; al arrancar se revalida contra `GET /auth/me` (401 → sesión terminada; error de red → se conserva la sesión) |
| Carga de relaciones coach↔atleta | **Implementado y validado** — `GET /me/coach-relationships`, agrupadas por `viewer_role` + `status`; `revoked` se excluye de todas las vistas |
| Enviar solicitud a un atleta | **Implementado y validado** — 201; duplicado → 422; atleta inexistente → 422; sin rol coach → 422 |
| Aceptar solicitud recibida | **Implementado y validado** — solo el atleta objetivo; `pending → active` |
| Rechazar / cancelar / terminar relación | **Implementado y validado** — `pending→revoked` (coach o atleta), `active→revoked` (solo atleta); transición inválida → 422 |
| Estados loading / error / empty | **Implementado** — "Cargando…" durante fetch, tarjeta de error con mensaje del backend, `EmptyState` cuando no hay relaciones vivas |
| Manejo de errores HTTP | **Implementado y validado** — 0 (red) / 401 (sesión expirada) / 422 (validación, muestra el primer `errors[*]`) traducidos a español; 401 en cualquier acción autenticada cierra la sesión y vuelve a `<Auth/>` |
| Navegación Home / Atletas / Perfil | **Implementado** — 3 pestañas (`BottomNav`), botón atrás de Android → Home o salir |
| Detalle de atleta: Profile + resumen de actividad + racha + puntos (sombra) | **Implementado y validado** (slice D-COACH) — `GET /me/coach/athletes/{id}`; 404 si la relación no está `active` |
| Notas de feedback sobre un atleta (crear / listar / borrar) | **Implementado y validado** (slice D-COACH) — privadas del coach; el atleta no las recibe |
| Rutinas del coach para el atleta (crear / listar / editar-reemplazar / borrar) | **Implementado** (Fase 5, `RoutineBuilder.jsx` + card "RUTINAS" en `AthleteDetail`) — gym de referencia opcional + aviso/bloqueo si el equipo no está disponible allí. El atleta las ve en su app y las copia a sus rutinas locales |

### Pendiente de validación

- **E2E visual en navegador / dispositivo**: no ejecutado (la extensión de
  Chrome no estaba conectada en la sesión de QA). Responsive/mobile y
  comportamiento en Capacitor quedan cubiertos solo por revisión de código
  + `build` correcto, no por prueba real en pantalla ni en emulador/APK.
  `npx cap add android` todavía no se ha corrido (no hay carpeta `android/`).

## Endpoints del backend que usa hoy

Todos bajo `VITE_API_BASE_URL` (`.env`), prefijo `/api/v1`. Definidos en
`backend/routes/api.php` — **no hay ningún endpoint inventado**:

| Método | Ruta | Uso |
|---|---|---|
| POST | `/auth/register` | Registro |
| POST | `/auth/login` | Login |
| POST | `/auth/logout` | Logout (auth) |
| GET | `/auth/me` | Revalidación de sesión al arrancar (auth) |
| GET | `/me/coach-relationships` | Listar relaciones del usuario (auth) |
| POST | `/me/coach-relationships` | Solicitar un atleta — body `{athlete_user_id}` (auth) |
| POST | `/me/coach-relationships/{id}/accept` | Aceptar solicitud recibida (auth) |
| DELETE | `/me/coach-relationships/{id}` | Rechazar / cancelar / terminar (auth) |
| GET | `/me/coach/athletes` | Atletas con relación `active` del coach (auth) |
| GET | `/me/coach/athletes/{id}` | Info sombra del atleta: Profile + `activity_summary` + `streak` + `points` (auth; 404 si la relación no está `active`) |
| GET | `/me/coach/athletes/{id}/notes` | Notas que este coach escribió sobre ese atleta (auth) |
| POST | `/me/coach/athletes/{id}/notes` | Crear nota — body `{ body }` (auth) |
| DELETE | `/me/coach/notes/{id}` | Borrar una nota propia (auth) |
| GET·POST·PUT·DELETE | `/me/coach/athletes/{id}/programs[/{program}]` | **Fase 5** — rutinas que el coach crea PARA el atleta (`RoutineBuilder.jsx`). Gate = relación `active`; GymAssignment no participa. `reference_gym_id` opcional = un gym del coach; con él, el backend valida el equipamiento contra `gym_equipment` (422 por-ejercicio). `PUT` reemplaza el árbol completo |
| GET | `/exercises` · `/me/gym-assignments` · `/gyms/{id}/equipment` | **Fase 5** — catálogo global + gyms del coach + inventario del gym de referencia (para el editor de rutinas) |

El cliente vive en `src/utils/api.js` (versión recortada del de
`frontend-usuario`: `fetch` nativo + Sanctum Bearer, sin dependencias
nuevas).

## Limitaciones actuales del rol Couch (bloqueos de backend)

Estas son **decisiones pendientes de producto/arquitectura**, no bugs.
El backend hoy solo expone la relación de consentimiento coach↔atleta
(`CoachAthleteRelationshipController`: `pending → active → revoked`).

1. **El rol `coach` debe asignarse manualmente en la BD para las pruebas.**
   No existe endpoint para auto-asignarse el rol `coach` (el self-assign de
   `GymAssignment` es solo `member`; la administración de roles por
   terceros está fuera de alcance sin decisión explícita — ver
   `PROJECT_STATE.md`). Sin un `GymAssignment(role=coach, status=active)`,
   `POST /me/coach-relationships` responde 422. Para probar:

   ```
   php artisan tinker
   >>> $gym = App\Models\Gym::first() ?? App\Models\Gym::create(['name'=>'QA Gym']);
   >>> App\Models\GymAssignment::create(['user_id'=>USER_ID,'gym_id'=>$gym->id,'branch_id'=>null,'role'=>'coach','status'=>'active']);
   ```

2. **Acceso coach-scoped a datos del atleta: PARCIALMENTE RESUELTO
   (slice D-COACH).** Un coach con relación `active` YA lee, vía
   `CoachAthleteController` (`GET /me/coach/athletes`, `GET
   /me/coach/athletes/{id}`), el `Profile` + resumen de actividad + racha +
   saldo de puntos del atleta — datos de calidad **sombra/best-effort**
   (pueden faltar sesiones que la app del atleta no sincronizó). Lo cubre la
   pantalla `AthleteDetail.jsx`. Sigue **sin existir** acceso del coach a
   **programas / workouts / check-ins crudos / progreso detallado** del
   atleta (esos `me/*` siguen auto-scopeados). No inventar ni mockear esos
   datos: su diseño es Fase 5.

3. **No existe búsqueda de usuarios** (D-COACH-5 lo mantiene). Para
   solicitar un atleta hay que introducir su **ID numérico exacto**
   (`athlete_user_id`, entero). La UI pide ese número directamente; no hay
   autocompletado por nombre/correo. Endpoint de lookup → Fase 5.

## Arquitectura / estado

`src/state/CoachContext.jsx` — versión mínima del `AppContext` de la app de
usuario: solo `auth` (persistida en LocalStorage bajo `STORAGE_KEY`,
derivada del `appId` de Couch → clave distinta de la app de usuario) +
`relationships` (no se persiste, se recarga del backend). Sin snapshots por
identidad, sin onboarding, sin biometría, sin App Lock.

`src/utils/relationships.js` — lógica pura (`groupRelationships`) que
agrupa la respuesta de `GET /me/coach-relationships` por `viewer_role` +
`status` e ignora las `revoked`. Con test (`relationships.test.js`).

`src/utils/athlete.js` — lógica pura sobre `GET /me/coach/athletes/{id}`:
`profileRows(profile)` (filas `{label,value}` de los campos con valor) y
`formatDuration(segundos)`. Con test (`athlete.test.js`).

El slice D-COACH añade a `CoachContext` 4 acciones finas
(`getAthleteDetail`/`getAthleteNotes`/`createAthleteNote`/`deleteAthleteNote`,
envueltas en `runAuthed` para el guard de 401). El detalle del atleta NO se
persiste en el contexto: es estado por-pantalla en `AthleteDetail.jsx`
(mismo criterio que el `busyId`/`error` local de `Athletes.jsx`).

Pantallas: `Auth`, `Home` (panel), `Athletes` (gestión), `AthleteDetail`
(info sombra + notas), `Profile`. Shell y ruteo en `src/App.jsx` (mismo
patrón que `frontend-usuario`: `screen` en `useState`, sin router;
`athleteDetail` no está en `TABS` → sin bottom-nav, y el botón atrás de
Android vuelve a `athletes`).

## Comandos

```bash
npm install      # usa --legacy-peer-deps si npm falla resolviendo peers de vitest
npm run dev      # requiere frontend-couch/.env con VITE_API_BASE_URL
npm run build
npm run lint
npm run test
```

## Archivos copiados textualmente de `frontend-usuario`

`src/index.css`, `src/App.css`, `src/theme/colors.js`,
`src/config/appConfig.js`, `src/components/{UI,Brand,AppBackground}.jsx`,
`src/utils/format.js`, `src/main.jsx`, `vite.config.js`,
`eslint.config.js`, `index.html`, `.gitignore`, `.env.example`,
`public/*`, `src/assets/{BIAFYT-logo.webp,david.png}`.

`src/utils/auth.js` se copió pero recortado a `validateEmail` /
`passwordIssues` (Couch no usa biometría).

Si cambia el sistema visual en `frontend-usuario`, estos archivos hay que
volver a sincronizarlos a mano (las 3 apps son proyectos independientes,
sin monorepo — no introducir uno sin decisión explícita).

## Convenciones

Las mismas que `frontend-usuario/CLAUDE.md`: colores solo vía
`theme/colors.js`, identidad de app solo vía `config/appConfig.js`, textos
y comentarios en español, mobile-first, reutilizar `components/UI.jsx`
antes de crear componentes nuevos.
