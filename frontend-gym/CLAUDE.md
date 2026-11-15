# CLAUDE.md — frontend-gym

App **Gym** (móvil) de BIAFYT. Una de las tres superficies front del
producto (ver `../CLAUDE.md`); el backend es `../backend/` (Laravel).

## ESTADO: gestión del gym_admin portada desde Gym Web (2026-11-14)

Por decisión explícita del usuario (reemplaza D-GYM-6 para esta app) la
app móvil ya NO es solo shell: tiene las MISMAS funciones que
`../frontend-gym-web/` — Resumen, Espacio (miembros/coaches + detalle de
miembro), Sedes, Inventario (+ solicitudes de equipo), Vouchers y Cuenta —
con el mismo gate (solo un `gym_admin` activo entra; si no, "Sin acceso de
Gym").

**Cómo está hecho:** `src/utils/{api,gym}.js`, `src/state/SessionContext.jsx`
y `src/screens/{Overview,Workspace,MemberDetail,Branches,Inventory,Vouchers,
NoGymAccess}.jsx` son **copias textuales de `frontend-gym-web`** (sin
monorepo: si cambian allá, re-copiar a mano). Lo propio de esta app es el
shell móvil: `App.jsx` (envuelve cada pantalla en `.screen > .screen-body`,
botón atrás de Android), `components/BottomTabs.jsx` (6 pestañas),
`components/UI.jsx` (+ `Panel`) y el bloque "GESTIÓN GYM" al final de
`App.css` (clases `.gym-*` en una columna; las tablas se desplazan en
horizontal). Endpoints, authz y shapes: ver `../frontend-gym-web/CLAUDE.md`.

Pendiente: rol `staff` (capacidades sin definir), afinar las tablas para
pantallas pequeñas, `npx cap add android` y prueba en dispositivo real.

Nota de identidad (D-GYM-9): `frontend-gym/` es la app **móvil/Capacitor**
(`appId com.apysoft.gymprofit.gym`, bottom-tabs); `frontend-gym-web/` es la
app **web** (sin Capacitor).

`lint`, `test` (18) y `build` en verde.

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

## Reportes y Staff (2026-11-15)

Portados de `frontend-gym-web` (copias textuales): `Reports.jsx`, `Workspace.jsx` (gestión de staff), `Vouchers.jsx`, `utils/{api,gym,report}.js`, `Charts.jsx`, `SessionContext.jsx`. Lo propio de esta app: pestaña "Reportes" (7 pestañas para gym_admin; un `staff` solo ve las que `canOpen` permite) y los estilos de gráficos al final de `App.css` (indicadores en 2 columnas). Sin exportar CSV/PDF en la app nativa. Sin verificar en pantalla en esta ronda (solo lint/test/build).

Vouchers (2026-11-15): `Vouchers.jsx`, `VoucherIssuePanel.jsx` y `utils/voucher.js` son copias de `frontend-gym-web` (emisión masiva, códigos compartidos, vigencia).
