# BIAFYT

BIAFYT es una plataforma de fitness que conecta tres perspectivas del mismo
ecosistema: **Cliente/Usuario/Atleta**, **Coach** y **Gym**. El atleta entrena y
acumula puntos/racha; el coach acompaña a sus atletas sobre una relación
explícita y autorizada; el gym es el contexto organizacional (sucursales,
miembros, coaches). Conviven en un mismo sistema sin mezclarse prematuramente.

## Arquitectura del repositorio

Cinco aplicaciones front-end independientes (sin monorepo) + un backend. Todas
apuntan al mismo `backend/` y comparten los contratos de dominio. El sistema
visual compartido se copia a mano entre proyectos y se resincroniza
manualmente.

| Directorio | Qué es |
|---|---|
| `backend/` | API JSON bajo `/api/v1` (Laravel 12 + Sanctum, PHP ^8.2, MySQL). Autoritativo para Auth y Profile; también sirve el catálogo de ejercicios y la gestión Coach/Gym/onboarding. Se introduce de forma incremental. |
| `frontend-usuario/` | App del usuario final (React 19 + Vite + Capacitor). El backend es autoritativo solo para Auth/Profile; el resto es LocalStorage con copia sombra best-effort. |
| `frontend-couch/` | App del rol Coach (React 19 + Vite + Capacitor). Auth Sanctum + relación de consentimiento coach↔atleta + lectura sombra del atleta y notas. |
| `frontend-gym/` | Superficie Gym móvil (React 19 + Vite + Capacitor). Solo fundación de UI: sin lógica de dominio, permisos ni workflows de Gym. |
| `frontend-gym-web/` | Superficie Gym web (React 19 + Vite, sin Capacitor). Un `gym_admin` administra los roles `member`/`coach` de su gimnasio y consulta el estado sombra de un miembro. |
| `frontend-admin/` | Dashboard interno de administración de plataforma (BIAFYT Admin) — **no es superficie de cliente**. Revisa solicitudes de registro de gimnasio y lista gimnasios; todo `/admin/*` va gateado por `users.is_platform_admin`. |

El antiguo monolito de la raíz fue eliminado (`chore(repo): remove superseded
legacy monolith`); `frontend-usuario/` es su sucesor directo.

## Estado actual

- **MVP local:** funcional de punta a punta, con persistencia.
- **Lazo Cliente → Coach → Gym:** cerrado (Coach MVP + Gym MVP).
- **Alta comercial de gimnasio:** el usuario solicita registrar su gimnasio, un
  BIAFYT Admin aprueba/rechaza, y al aprobar se crea el gimnasio + su sede
  principal + el `gym_admin`.
- **Fase 2 (MVP Producción):** preparada a nivel de código y documentación
  (backend + 4 superficies web). El **despliegue sigue bloqueado por
  infraestructura/credenciales** (host, base de datos, dominio y subdominios,
  hosting estático, TLS, backups). No desplegado — ver `DEPLOY.md`.

## Fuentes de verdad

- [`CLAUDE.md`](CLAUDE.md) — cómo trabajar en el repositorio.
- [`PROJECT_STATE.md`](PROJECT_STATE.md) — estado real: fases, implementación,
  deuda técnica.
- [`BIAFYT_BUSINESS_CORE.md`](BIAFYT_BUSINESS_CORE.md) — reglas y
  decisiones de negocio/dominio.
- [`DEPLOY.md`](DEPLOY.md) — runbook de despliegue de producción (Fase 2).
- [`docs/PRODUCTION_HARDENING_DISCOVERY.md`](docs/PRODUCTION_HARDENING_DISCOVERY.md)
  — discovery técnico de producción/hardening.
- Cada aplicación tiene además su propio `<app>/CLAUDE.md`.

## Desarrollo

- **Backend** (`cd backend`): `composer install` → configurar `.env` (a partir
  de `.env.example`) y `php artisan migrate` → `php artisan test` y
  `./vendor/bin/pint --test`.
- **Front-ends** (`cd <app>`, Node 20+): `npm install` (algunas apps requieren
  `--legacy-peer-deps`) → `.env` con `VITE_API_BASE_URL` (a partir de
  `.env.example`) → `npm run dev` | `build` | `lint` | `test`.
