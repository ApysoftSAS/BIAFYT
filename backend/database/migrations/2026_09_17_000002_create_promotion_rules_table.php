<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * One discount line per (audience, duration_months) within a Promotion
     * (Promotion V1). `audience` lives here, never on `promotions` — a
     * single promotion (e.g. ANIVERSARIO2026) can offer different values to
     * Athlete/Coach/Gym and different values per duration.
     *
     * UNIQUE(promotion_id, audience, duration_months) enforces "no duplicate
     * rule for the same combination" at the DB level — defense in depth,
     * the admin controller also rejects it before insert.
     */
    public function up(): void
    {
        Schema::create('promotion_rules', function (Blueprint $table) {
            $table->id();
            $table->foreignId('promotion_id')->constrained('promotions')->cascadeOnDelete();

            $table->string('audience'); // athlete | coach | gym
            $table->unsignedSmallInteger('duration_months'); // 3 | 6 | 12

            $table->string('benefit_type'); // percent | fixed
            $table->unsignedInteger('benefit_value');

            $table->timestamps();

            $table->unique(['promotion_id', 'audience', 'duration_months']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('promotion_rules');
    }
};
