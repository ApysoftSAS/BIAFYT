<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Registro de auditoría (SOC 2 CC7.2 / ISO 27001 A.8.15 / ISO 27701 7.2.8).
     * Solo se agrega: la app nunca actualiza ni borra filas (salvo la poda por
     * retención). `user_id` pasa a NULL si la cuenta se suprime (el evento se
     * conserva sin identificar a la persona). Nunca guarda contraseñas, tokens
     * ni correos en claro.
     */
    public function up(): void
    {
        Schema::create('audit_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('event', 64)->index();
            $table->string('ip', 45)->nullable();
            $table->json('meta')->nullable();
            $table->timestamp('created_at')->useCurrent()->index();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('audit_logs');
    }
};
