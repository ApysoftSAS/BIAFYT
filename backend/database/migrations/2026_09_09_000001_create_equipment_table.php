<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Global BIAFYT equipment catalog.
     *
     * Same pattern as `exercises`: a 1:1 mirror of a frontend static catalog
     * (`frontend-usuario/src/data/machines.js` — `id` -> `slug`, `name`).
     * Only identity lives here; the educational metadata (purpose, muscles,
     * tips, mistakes) stays in the frontend catalog. `exercises.machine_id`
     * already stores the same slug space, so an exercise is linked to its
     * equipment by `exercises.machine_id === equipment.slug` (no FK added to
     * `exercises` — that column predates this table and stays as-is).
     */
    public function up(): void
    {
        Schema::create('equipment', function (Blueprint $table) {
            $table->id();
            $table->string('slug')->unique();
            $table->string('name');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('equipment');
    }
};
