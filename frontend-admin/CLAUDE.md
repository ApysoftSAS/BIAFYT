# CLAUDE.md — frontend-admin

Dashboard **BIAFYT Admin** (navegador/desktop). Administración interna de
plataforma — **no es una superficie de cliente**. Backend: `../backend/`
(Laravel/Sanctum). Ver `../BIAFYT_BUSINESS_CORE.md` §46 D-GYM-ONBOARDING y
`../PROJECT_STATE.md` → `FASE: Gym Onboarding + BIAFYT Admin`.

## ESTADO: MVP de onboarding CERRADO

Alcance MVP y **nada más** sin una decisión explícita nueva:

- Login / registro / logout Sanctum (mismo contrato `/auth/*`).
- Lista de solicitudes de registro de gimnasio (filtro por estado) + detalle.
- Aprobar / rechazar una solicitud.
- Lista básica de gimnasios (solo lectura).

`lint`, `test` y `build` en verde.

## Autoridad de plataforma

- El acceso lo decide `user.is_platform_admin` (booleano en `users`, **fuera
  de `GymAssignment`**). Se resuelve SIEMPRE del backend (`GET /auth/me`);
  nunca se confía en un flag de LocalStorage — solo se persiste el token y la
  identidad, y al arrancar se revalida.
- `isPlatformAdmin` en el frontend solo decide qué UI mostrar. **No es una
  barrera de seguridad**: el backend gatea cada `/admin/*` por su cuenta
  (404 si no eres platform admin — la superficie no es descubrible).
- El rol se concede solo por operaciones:
  `php artisan BIAFYT:grant-platform-admin <email> [--revoke]`. No hay
  endpoint ni UI para concederlo.

## Endpoints que usa

Bajo `VITE_API_BASE_URL` (`.env`), prefijo `/api/v1`. Definidos en
`../backend/routes/api.php` — ninguno inventado. Cliente en `src/utils/api.js`;
el token lo inyecta `src/state/SessionContext.jsx` (`adminActions`), nunca las
pantallas.

| Método | Ruta | Uso |
|---|---|---|
| POST `/auth/{register,login}` · POST `/auth/logout` · GET `/auth/me` | Sesión + flag `is_platform_admin` |
| GET | `/admin/gym-registration-requests?status=` | Lista (filtro opcional pending/approved/rejected) |
| GET | `/admin/gym-registration-requests/{id}` | Detalle (incluye `applicant {id,name,email}` para due diligence) |
| POST | `/admin/gym-registration-requests/{id}/approve` | Idempotente. Crea `Gym` + `Branch` principal + `GymAssignment(gym_admin, active)` en una transacción |
| POST | `/admin/gym-registration-requests/{id}/reject` | Idempotente. `approved` → 422 |
| GET | `/admin/gyms` | Lista de gimnasios con sedes + recuentos de roles activos. Sin datos personales |
| GET · POST · PATCH | `/admin/equipment[/{id}]` | Catálogo global de equipamiento — **único lugar donde se escribe `equipment`**. `slug` derivado del nombre, no editable. `gym_count` = nº de gyms que lo tienen |
| GET | `/admin/equipment-requests?status=&gym_id=` · `/{id}` | Solicitudes de los gyms para añadir una máquina al catálogo |
| POST | `/admin/equipment-requests/{id}/{start-review,request-changes,reject,approve}` · PATCH `/{id}` | Flujo de revisión. `approve` exige `equipment_id` (asociar existente, anti-duplicados) **o** `create_equipment:true`; nunca añade a `gym_equipment` |

Slice **D-GYM-EQUIPMENT-REQUEST** (Fase 5). Estados de la solicitud:
`pending → in_review → changes_requested → pending` · `in_review → approved`
· `in_review → rejected`. Auditoría en `equipment_request_events`
(append-only; el proyecto no tiene paquete de auditoría).

## Arquitectura / estado

`src/state/SessionContext.jsx` — sesión Sanctum + `auth.isPlatformAdmin`
(del backend). Acciones envueltas en `runAuthed` (401 → cierra sesión).
Pantallas: `Auth`, `NoAccess` (autenticado sin `is_platform_admin`),
`Requests` + `RequestDetail` (Modal), `Gyms`, `EquipmentCatalog` +
`EquipmentRequests` (con detalle en Modal — slice D-GYM-EQUIPMENT-REQUEST),
`Account`. Navegación por
estado en `App.jsx` (sin router): `authChecking` → `signedIn` →
`isPlatformAdmin` → shell (`Sidebar`/`Topbar`/`main`).
`src/utils/admin.js` — lógica pura con test (`statusLabel`, `countByStatus`,
`formatDate`).

Scaffold copiado a mano de `../frontend-gym-web/` (sistema visual: `theme/`,
`App.css`, `index.css`, `components/UI.jsx`, `components/Brand.jsx`,
`utils/{format,auth}.js`). Sin monorepo: re-sincronizar a mano si cambia el
sistema visual.

## Fuera de alcance (sin decisión nueva)

Editar gimnasios/sedes, suspender/eliminar gimnasios, gestión de `staff`,
endpoint para conceder `platform_admin`/`gym_admin`, notificaciones al
solicitante, billing/pagos, métricas de plataforma, cualquier cambio en las
apps de Cliente/Coach/Gym.

## Comandos

```bash
npm install --legacy-peer-deps
npm run dev      # requiere .env con VITE_API_BASE_URL
npm run build
npm run lint
npm run test
```

## Convenciones

Colores solo vía `theme/colors.js`; identidad de app solo vía
`config/appConfig.js` (inyectada desde `package.json` + `app.config.json`);
textos y comentarios en español; reutilizar `components/UI.jsx` y las clases
del shell web (`.gym-shell`, `.gym-table`, `.gym-main-head`, …) antes de crear
nada nuevo.
