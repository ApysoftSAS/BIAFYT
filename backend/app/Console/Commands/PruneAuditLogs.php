<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class PruneAuditLogs extends Command
{
    protected $signature = 'audit:prune {--days=365 : Conservar este número de días}';

    protected $description = 'Borra eventos de auditoría anteriores a la retención (por defecto 365 días).';

    public function handle(): int
    {
        // Query builder (no Eloquent): la poda por retención es la única excepción a "solo se agrega".
        $n = DB::table('audit_logs')->where('created_at', '<', now()->subDays((int) $this->option('days')))->delete();
        $this->info("Eliminados {$n} eventos.");

        return self::SUCCESS;
    }
}
