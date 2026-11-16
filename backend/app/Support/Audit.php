<?php

namespace App\Support;

use App\Models\AuditLog;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Punto único para registrar eventos de seguridad/privacidad. Nunca rompe la
 * petición si la auditoría falla (se deja constancia en el log de la app).
 * `meta` NO debe llevar contraseñas, tokens ni correos: ids y hashes.
 */
class Audit
{
    /** @param array<string, mixed> $meta */
    public static function record(string $event, ?int $userId = null, array $meta = []): void
    {
        try {
            AuditLog::create([
                'user_id' => $userId,
                'event' => $event,
                'ip' => request()?->ip(),
                'meta' => $meta ?: null,
            ]);
        } catch (Throwable $e) {
            Log::error('audit.write_failed', ['event' => $event, 'error' => $e->getMessage()]);
        }
    }
}
