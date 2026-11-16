# Matriz de controles de seguridad — BIAFYT

Estado real del código al 2026-11-15, mapeado a SOC 2 (Trust Services Criteria),
ISO/IEC 27001:2022 (Anexo A) e ISO/IEC 27701. Es un inventario técnico, **no** una
certificación: SOC 2 e ISO exigen además políticas, evidencia operativa y auditoría
externa que no viven en el repositorio.

Leyenda: ✅ implementado y probado · 🟡 parcial · ❌ pendiente (decisión o trabajo nuevo)

| Control | SOC 2 | ISO 27001 | Estado | Evidencia |
|---|---|---|---|---|
| Política de contraseña en servidor (8+, letra y número) | CC6.1 | A.5.17 | ✅ | `AuthController::register`, `AuthTest` |
| Vida limitada del token (30 días, `AUTH_TOKEN_TTL_DAYS`) | CC6.1 | A.8.5 | ✅ | `config/auth.php`, `AuthTest` |
| Revocación del token al cerrar sesión | CC6.1 | A.8.5 | ✅ | `AuthController::logout` |
| Limitación de intentos de login (IP y cuenta) | CC6.1 | A.8.5 | ✅ | `routes/api.php`, `AuthController::login` |
| Login sin filtrar qué correos existen (tiempo y mensaje) | CC6.1 | A.8.5 | ✅ | `AuthController::login` |
| Registro de eventos de auth (sin datos en claro) | CC7.2 | A.8.15 | ✅ | `App\Support\Audit`, `audit_logs`, `PruneAuditLogs` |
| CORS por lista de orígenes (nunca `*`) | CC6.6 | A.8.20 | ✅ | `config/cors.php`, `AuthTest` |
| Cabeceras de seguridad en la API | CC6.6 | A.8.9 | ✅ | `Http/Middleware/SecurityHeaders.php`, `AuthTest` |
| Limitación general de la API (120/min) | CC6.6 | A.8.20 | ✅ | `AppServiceProvider`, `ProductionHardeningTest` |
| Errores siempre en JSON, sin trazas en producción | CC6.8 | A.8.9 | ✅ | `bootstrap/app.php` |
| Autorización por membresía/relación activa | CC6.3 | A.5.15 | ✅ | `CheckInController::resolveWhere`, gates de Coach/Gym/Admin |
| Admin de plataforma solo por comando, nunca por endpoint | CC6.2 | A.5.18 | ✅ | `BIAFYT:grant-platform-admin` |
| Datos pendientes borrados del dispositivo al cerrar sesión | P4.3 | 27701 7.4.x | ✅ | `outbox.js#clearUser`, `signOut` |
| Token de sesión en almacenamiento seguro del dispositivo | CC6.1 | A.8.24 | ❌ | Hoy `localStorage`; requiere decisión de arquitectura (Keychain/Keystore) |
| Exportación y borrado de cuenta (derechos del titular) | P5.1, P5.2 | 27701 7.3.x | ❌ | Sin endpoints; es una funcionalidad nueva |
| Política de retención de datos | P4.2 | 27701 7.4.7 | 🟡 | Solo `PruneAuditLogs`; falta definir plazos por tabla |
| Pruebas de restauración de backups | A1.2, A1.3 | A.8.13 | 🟡 | Descrito en `DEPLOY.md`; sin evidencia de ejecución |
| Escaneo de dependencias en CI (`composer audit`, `npm audit`) | CC7.1 | A.8.8 | ❌ | Sin pipeline |
| Gestión de secretos / rotación de `APP_KEY` | CC6.1 | A.8.24 | 🟡 | `.env` fuera del repo; sin rotación documentada |
| Revisión periódica de accesos | CC6.2, CC6.3 | A.5.18 | ❌ | Proceso, no código |
| Cifrado en tránsito (HTTPS + HSTS) | CC6.7 | A.8.24 | 🟡 | HSTS en producción; el TLS lo da la infraestructura (bloqueada) |

## Siguientes pasos sugeridos (en orden)
1. Pipeline de CI con `composer audit` y `npm audit` (bajo riesgo, alto valor).
2. Decidir el almacenamiento seguro del token en móvil.
3. Endpoints de exportación y borrado de cuenta (requiere definir qué se anonimiza vs. borra).
4. Definir retención por tabla y ejecutar una restauración de backup con evidencia.
