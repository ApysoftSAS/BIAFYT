<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Per-gym inventory: which catalog `equipment` items a gym has, and
     * whether each is currently available. The global catalog is never
     * duplicated — this is a pivot between `gyms` and `equipment`.
     *
     * Absence of a row means "not in this gym's inventory" (treated as not
     * available). A row with `available = false` means "inventoried but out
     * of service". Both are equivalent for routine validation; the flag lets
     * a gym_admin toggle without losing the row.
     *
     * Inventory is gym-wide (not branch-scoped) in this slice — same initial
     * scope decision as the coach<->athlete relationship. Branch-level
     * inventory would be a later migration if the product needs it.
     */
    public function up(): void
    {
        Schema::create('gym_equipment', function (Blueprint $table) {
            $table->id();
            $table->foreignId('gym_id')->constrained()->cascadeOnDelete();
            $table->foreignId('equipment_id')->constrained('equipment')->cascadeOnDelete();
            $table->boolean('available')->default(true);
            $table->timestamps();

            $table->unique(['gym_id', 'equipment_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('gym_equipment');
    }
};
