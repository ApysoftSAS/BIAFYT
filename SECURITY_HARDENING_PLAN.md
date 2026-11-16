# BIAFYT — Plan de hardening de seguridad (SOC 2 · ISO 27001 · ISO 27701)

Fecha: 2026-11-16 · Estado: **Fase 1 implementada (2026-11-16)**; Fases 2–3 pendientes · Fuente de verdad del estado real: código y tests.

> **Alcance honesto.** Ningún cambio de código "certifica" a nadie. SOC 2 (Tipo I/II),
> ISO 27001 e ISO 27701 se auditan sobre un **sistema de gestión** (políticas, roles,
> evidencia, revisiones periódicas) además de los controles técnicos. Este plan separa
> lo que **se hace en el código** (yo) de lo que **requiere decisión u operación humana**
> (tú / la empresa). Los nombres de control citados son de referencia; el mapeo definitivo
> lo confirma el auditor.

## 1. Estado actual (auditado en el código, 2026-11-16)

| Área | Hoy | Evidencia |
|---|---|---|
| Autenticación | Sanctum Bearer; hash bcrypt (12); token vence a 30 días; login/registro con throttle 6/min por IP | `AuthController`, `config/auth.php` |
| Contraseñas | ✅ F1: servidor exige 8+ con letras y números (misma política que el cliente). Pendiente: subir a 12 y bloquear filtradas (decisión §4.6) | `AuthController::register` |
| Fuerza bruta | ✅ F1: por IP (6/min) **y por cuenta** (5 fallos/15 min → 429, desde cualquier IP) | `AuthController::login` |
| Autorización | Roles por gimnasio, anti-IDOR (404), `is_platform_admin`, patrones numéricos globales | `GymAdminController`, `AppServiceProvider` |
| Cabeceras HTTP | ✅ F1: nosniff, DENY, no-referrer, CSP `none`, no-store, HSTS en producción | `Middleware/SecurityHeaders` |
| CORS | Lista blanca por entorno | `config/cors.php` |
| Registro de auditoría | ✅ F1: `audit_logs` solo-agregar (login, fallos, bloqueo, logout, registro, export/borrado, roles de gym, aprobaciones admin); sin PII; poda `audit:prune` (365 d) | `Support/Audit`, migración 43 |
| Logs | `single`, nivel `debug` por defecto; sin política de retención ni de PII | `.env.example` |
| Privacidad (27701) | ✅ F1: `GET /me/data-export` y `DELETE /me/account` (con contraseña; bloquea al único admin de un gym y al admin de plataforma). Pendiente F2: consentimiento/versión de términos | `AccountController` |
| Datos sensibles | Perfil (edad, peso, estatura) en claro; sin cifrado a nivel de campo | `Profile` |
| Verificación de correo | No (`MustVerifyEmail` comentado) | `User` |
| Dependencias | ✅ F1: CI semanal y por push (tests, Pint, `composer audit`, `npm audit --omit=dev`). Deuda: `@capacitor/assets` (dev) arrastra `sharp` vulnerable en usuario/coach | `.github/workflows/ci.yml` |
| Secretos / entorno | `.env.example` con `APP_DEBUG=true`, `APP_ENV=local` (correcto para dev; falta guardia de producción) | `.env.example` |
| Copias de seguridad / DR | No documentado | `DEPLOY.md` |
| Front-end | Token en localStorage; sin CSP | 5 apps |

## 2. Mapeo de controles → trabajo

Leyenda: **C** = código (lo hago yo) · **P** = proceso/decisión humana · **O** = operación/infra.

| Tema | ISO 27001:2022 (Anexo A) | SOC 2 (TSC) | ISO 27701 | Acción | Tipo | Fase |
|---|---|---|---|---|---|---|
| Política de contraseñas | 5.17, 8.5 | CC6.1 | — | Mínimo 12, mayúscula/minúscula/número, bloqueo de filtradas en producción | C | 1 |
| Anti fuerza bruta | 8.5, 8.16 | CC6.1, CC7.2 | — | Límite por cuenta+IP además de IP; respuesta uniforme | C | 1 |
| Cabeceras de seguridad | 8.9, 8.26 | CC6.6 | — | Middleware API: HSTS, nosniff, frame-deny, referrer, permissions, CSP `none` | C | 1 |
| Registro de auditoría | 8.15, 8.16 | CC7.2, CC7.3 | 7.2.8 | Tabla `audit_logs` inmutable por la app + eventos de auth, roles, vouchers, admin, privacidad | C | 1 |
| Derechos del titular (acceso/portabilidad) | 5.34 | P-series | 7.3.6, 7.3.9 | `GET /me/data-export` (JSON) | C | 1 |
| Supresión de cuenta | 5.34, 8.10 | P4.3 | 7.3.6, 7.4.5 | `DELETE /me/account` con contraseña; cascada + auditoría anonimizada | C | 1 |
| Consentimiento y versión de términos | 5.34 | P2.1 | 7.2.3, 7.2.4 | Campos `terms_version`/`privacy_version`/`consented_at` en registro | C | 2 |
| CI con auditoría de dependencias | 8.8, 8.28 | CC7.1, CC8.1 | — | Workflow: tests + Pint + `composer audit` + `npm audit` en las 5 apps | C | 1 |
| Guardia de producción | 8.9, 8.31 | CC8.1 | — | Falla el arranque si `APP_DEBUG=true` o `APP_ENV=local` en producción | C | 2 |
| Logs sin PII + retención | 8.15, 8.12 | CC7.2 | 7.4.7 | Canal `daily` con 90 días; nivel `warning` en prod; no registrar correos/tokens | C | 2 |
| Cifrado de campos sensibles | 8.24 | C1.1 | 7.4.4 | `encrypted` cast en medidas corporales de `Profile` (+ migración de datos) | C | 2 |
| Verificación de correo | 5.16 | CC6.1 | — | `MustVerifyEmail` + envío; requiere servicio de correo | C+O | 2 |
| Revocación de sesiones | 8.5 | CC6.1 | — | "Cerrar todas las sesiones" y al cambiar contraseña | C | 2 |
| Cambio/recuperación de contraseña | 5.17 | CC6.1 | — | Endpoints + correo | C+O | 2 |
| CSP y almacenamiento de token en front | 8.26 | CC6.6 | — | CSP en hosting; evaluar cookies httpOnly (cambio de arquitectura, requiere aprobación) | C+O | 3 |
| Copias de seguridad y recuperación | 8.13, 5.30 | A1.2, A1.3 | — | Backups cifrados diarios, prueba de restauración trimestral, RPO/RTO definidos | O | 3 |
| TLS y cabeceras en hosting | 8.20, 8.24 | CC6.7 | — | HTTPS forzado, TLS 1.2+, HSTS preload | O | 3 |
| Gestión de secretos | 5.17, 8.4 | CC6.1 | — | Gestor de secretos, rotación de `APP_KEY`/DB, sin secretos en repo | O | 3 |
| Monitoreo y alertas | 8.16 | CC7.2, CC7.3 | — | Sentry/Logs centralizados, alertas de picos de 401/429/5xx | O | 3 |
| Gestión de incidentes | 5.24–5.27 | CC7.3–7.5 | 6.13 | Procedimiento, contactos, plantilla de notificación (72 h) | P | 2 |
| Políticas (seguridad, acceso, retención, uso aceptable) | 5.1, 5.15, 5.10 | CC1, CC2 | 6.2 | Redactar y aprobar; revisión anual | P | 2 |
| Inventario de activos y proveedores / DPA | 5.9, 5.19–5.22 | CC9.2 | 7.2.6, 8.5 | Lista de subencargados (hosting, correo, mapas/TikTok) y contratos | P | 2 |
| Registro de actividades de tratamiento (RoPA) | 5.34 | P1 | 7.2.8, 8.2 | Documento: datos, finalidad, base legal, retención, destinatarios | P | 2 |
| Evaluación de impacto (datos de salud/biométricos) | 5.34 | — | 7.2.5 | DPIA de peso/estatura/actividad física | P | 2 |
| Revisión de accesos y bajas | 5.18 | CC6.2, CC6.3 | — | Revisión trimestral de `is_platform_admin` y `gym_admin` | P | 3 |
| Pruebas de penetración | 8.8, 8.29 | CC4.1 | — | Pentest externo antes de producción y anual | P+O | 3 |
| Formación y concienciación | 6.3 | CC1.4 | 6.3 | Plan anual | P | 3 |

## 3. Fases

**Fase 1 — Controles técnicos de mayor retorno (HECHA).** Contraseñas, bloqueo por
cuenta, cabeceras, registro de auditoría, exportación y borrado de cuenta, CI. Todo con
tests; sin cambios de arquitectura.

**Fase 2 — Cierre técnico y de gobierno.** Consentimiento versionado, guardia de producción,
logs sin PII, cifrado de campos, verificación de correo, recuperación de contraseña, revocación
de sesiones; en paralelo las políticas, RoPA, DPIA, incidentes y proveedores (requieren tu decisión).

**Fase 3 — Operación y evidencia.** Backups y restauración probada, secretos, monitoreo,
TLS/HSTS en hosting, CSP, pentest, revisión de accesos. Para SOC 2 Tipo II hace falta además
operar los controles durante una ventana (típicamente 3–12 meses) con evidencia.

**Notas de implementación F1.** (a) La tabla `audit_logs` guarda IP (dato personal): retención 365 días, a confirmar (§4.2). (b) El export omite las notas privadas del coach sobre el atleta (regla de negocio: privadas); si el marco legal las considera datos del titular, decidirlo. (c) El bloqueo por cuenta permite a un tercero bloquear temporalmente a otra persona conociendo su correo (trade-off conocido, 15 min). (d) Los logs de la aplicación (`Log::warning`) siguen en archivo; centralizarlos es F3.

## 4. Decisiones que necesito de ti (no las invento)

1. **Marco legal y jurisdicción:** ¿Colombia (Ley 1581/2012, SIC), GDPR, ambos? Define bases legales, plazos y retención.
2. **Retención:** ¿cuánto se conservan check-ins, actividad y logs tras la baja? (propuesta: logs 90 días; auditoría 1 año; datos de usuario se borran al instante al pedir supresión).
3. **Datos de salud:** peso/estatura/actividad son datos sensibles en Colombia: requieren consentimiento expreso. ¿Se pide en el registro?
4. **Proveedor de correo** (para verificación y recuperación) y **hosting/región**.
5. **Responsable de privacidad / seguridad** (rol nombrado) y quién aprueba políticas.
6. **Contraseña mínima:** propongo 12 caracteres con complejidad (NIST sugiere longitud sobre complejidad; la complejidad es opcional).

## 5. Qué se entrega en cada fase y cómo se verifica

- Código con test por control (suite backend) + `composer audit`/`npm audit` en CI.
- Este documento actualizado con el estado de cada fila.
- Evidencia exportable: `audit_logs`, workflow de CI, `DEPLOY.md`.
