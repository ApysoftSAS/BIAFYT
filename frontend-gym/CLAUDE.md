# CLAUDE.md — frontend-gym

App **Gym** (móvil) de BIAFYT. Una de las tres superficies front del
producto (ver `../CLAUDE.md`); el backend es `../backend/` (Laravel).

## ESTADO: Gym UI Foundation — la app móvil NO entra en el Gym MVP

Esto es un **bootstrap visual/técnico**, NO el producto Gym. Autorizado
explícitamente por el usuario como "Gym UI Foundation", distinta de la
fase Coach/Gym del roadmap (`../BIAFYT_BUSINESS_CORE.md` §46, §47
Fase 5; `../PROJECT_STATE.md` → `FASE: Gym UI Foundation`).

**El slice Gym MVP (D-GYM) se implementó SOLO en `../frontend-gym-web/`**
(superficie web) por decisión explícita (D-GYM-6). Esta app **móvil**
sigue siendo solo shell + login + placeholders; su producto queda para una
fase posterior. NO portar aquí la gestión de miembros/coaches ni el
`GymAdminController` sin una decisión nueva.

Nota de identidad (D-GYM-9): `frontend-gym/` es la app **móvil/Capacitor**
(`appId com.apysoft.gymprofit.gym`, bottom-tabs); `frontend-gym-web/` es la
app **web** (sin Capacitor). El texto antiguo de `BIAFYT_BUSINESS_CORE.md`
que decía lo contrario está corregido.

**Diferido a la fase Coach/Gym — NO implementar aquí sin una decisión
explícita nueva:** dominio Gym (Organization, Branch, Members, Staff,
Coaches, gym_admin), permisos, autorización, policies, memberships,
ownership, dashboards con datos reales, métricas, gestión de programas/
atletas, D5, D8, endpoints/migraciones/modelos backend.

Todas las pantallas de dominio (`Overview`, `Workspace`) son **placeholders**
explícitos. Solo `Auth` y `Account` tienen comportamiento real.

`lint`, `test` y `build` en verde.

## Qué existe

| Elemento | Estado |
|---|---|
| Bootstrap React 19 + Vite 8 + Capacitor 8 (`appId com.apysoft.gymprofit.gym`) | Real |
| Shell móvil: bottom-tabs (Resumen / Espacio / Cuenta) + botón atrás Android | Real |
| Login / registro / logout (`POST /auth/{login,register,logout}`, `GET /auth/me`) | **Real** — contrato Sanctum existente, sin endpoints nuevos |
| Sesión persistida (`SessionContext`, token en LocalStorage, revalidación al arrancar) | Real |
| Pantallas `Overview` / `Workspace` | **Placeholder** — sin datos, sin acciones |
| Rol / permiso de Gym | **NO existe** — el `User` autenticado es genérico (D5 dormante) |

## Arquitectura

- `src/state/SessionContext.jsx` — versión mínima del `CoachContext` de
  `frontend-couch`: SOLO `auth` (Sanctum). Sin dominio, sin roles.
- `src/utils/api.js` — cliente `fetch` recortado a `/auth/*`. No define
  endpoints Gym.
- Navegación por estado (`useState` en `App.jsx`), sin router library —
  misma convención que `frontend-usuario` / `frontend-couch`.

## Sistema visual (heredado de `frontend-usuario`)

- `src/theme/colors.js` — **copia verbatim** (tokens: paleta profundo/
  claro/turquesa, liquid-glass, tipografía Outfit, radios).
- `src/index.css` — copia verbatim (reset + tipografía base).
- `src/App.css` — **extracción lean** (~300 líneas) de las primitivas de
  `frontend-usuario/src/App.css`: capa glass, `.card` / `.btn` / `.input` /
  `.field` / `.badge` / `.stat` / `.empty`, utilidades de texto/layout,
  `.modal`, shell móvil (`.app` / `.screen` / `.bottom-nav`) + `.hero` /
  `.auth-form` / `.placeholder-note`. NO se copiaron las ~1400 líneas
  específicas de usuario (workout, duelos, calendario, ranking…).
- `src/components/UI.jsx` — subconjunto de `frontend-usuario/src/components/UI.jsx`,
  mismos contratos de clase.
- `src/components/Brand.jsx` + `src/assets/BIAFYT-logo.webp` — copiados.
- `src/utils/auth.js` — copia de `frontend-couch/src/utils/auth.js`
  (`validateEmail` / `passwordIssues`).

Sin monorepo. Si cambia el sistema visual en `frontend-usuario`, hay que
re-sincronizar a mano (mismo patrón que `frontend-couch`).

## Comandos

```bash
npm install --legacy-peer-deps   # bug de npm 10.9.4 con peers de vitest
npm run dev                       # requiere .env con VITE_API_BASE_URL
npm run build
npm run lint
npm run test
```

## Convenciones

Las mismas que `../frontend-usuario/CLAUDE.md`: colores solo vía
`theme/colors.js`, identidad de app solo vía `config/appConfig.js`,
textos y comentarios en español, reutilizar `components/UI.jsx`.
