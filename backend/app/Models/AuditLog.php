<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use LogicException;

/** Evento de auditoría, de solo escritura (ver migración `create_audit_logs_table`). */
class AuditLog extends Model
{
    public const UPDATED_AT = null;

    protected $fillable = ['user_id', 'event', 'ip', 'meta'];

    protected function casts(): array
    {
        return ['meta' => 'array'];
    }

    protected static function booted(): void
    {
        static::updating(fn () => throw new LogicException('Audit logs are append-only.'));
        static::deleting(fn () => throw new LogicException('Audit logs are append-only.'));
    }
}
