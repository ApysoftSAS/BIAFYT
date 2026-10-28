<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('program_exercises', function (Blueprint $table) {
            $table->id();
            $table->foreignId('program_day_id')->constrained()->cascadeOnDelete();
            // RESTRICT, not CASCADE: Exercise is a shared global catalog and
            // must never be removed as a side effect of deleting Program
            // structure (see Exercise catalog compatibility in backend/CLAUDE.md).
            $table->foreignId('exercise_id')->constrained()->restrictOnDelete();
            $table->unsignedInteger('position');
            $table->timestamps();

            $table->unique(['program_day_id', 'position']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('program_exercises');
    }
};
