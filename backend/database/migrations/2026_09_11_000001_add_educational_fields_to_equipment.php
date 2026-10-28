<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Move the educational catalog that used to live in
     * `frontend-usuario/src/data/machines.js` into the `equipment` table, so
     * the DB is the single source of truth for the machine library
     * (`Machines.jsx`) and the muscle-group mapping (`analytics.js`).
     *
     * All nullable, additive — existing rows keep NULL until the seeder
     * (or the BIAFYT Admin) fills them. `art` names the illustration key
     * that `components/MachineArt.jsx` resolves; the SVGs themselves stay in
     * the frontend (presentation only).
     */
    public function up(): void
    {
        Schema::table('equipment', function (Blueprint $table) {
            $table->text('purpose')->nullable()->after('name');
            $table->string('primary_muscle')->nullable()->after('purpose');
            $table->json('secondary_muscles')->nullable()->after('primary_muscle');
            $table->string('movement')->nullable()->after('secondary_muscles');
            $table->string('level')->nullable()->after('movement');
            $table->json('tips')->nullable()->after('level');
            $table->json('mistakes')->nullable()->after('tips');
            $table->json('related')->nullable()->after('mistakes');
            $table->string('art')->nullable()->after('related');
        });
    }

    public function down(): void
    {
        Schema::table('equipment', function (Blueprint $table) {
            $table->dropColumn([
                'purpose', 'primary_muscle', 'secondary_muscles', 'movement',
                'level', 'tips', 'mistakes', 'related', 'art',
            ]);
        });
    }
};
