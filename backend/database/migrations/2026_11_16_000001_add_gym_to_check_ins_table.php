<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Dónde se hizo el check-in. Nullable: los anteriores no lo tienen (los
     * reportes los siguen atribuyendo por membresía) y el atleta puede no
     * pertenecer a ningún gimnasio.
     */
    public function up(): void
    {
        Schema::table('check_ins', function (Blueprint $table) {
            $table->foreignId('gym_id')->nullable()->after('user_id')->constrained()->nullOnDelete();
            $table->foreignId('branch_id')->nullable()->after('gym_id')->constrained()->nullOnDelete();
            $table->index(['gym_id', 'checked_in_at']);
        });
    }

    public function down(): void
    {
        Schema::table('check_ins', function (Blueprint $table) {
            $table->dropConstrainedForeignId('branch_id');
            $table->dropConstrainedForeignId('gym_id');
        });
    }
};
