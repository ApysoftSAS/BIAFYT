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
        Schema::create('workout_exercises', function (Blueprint $table) {
            $table->id();
            $table->foreignId('workout_id')->constrained()->cascadeOnDelete();
            // RESTRICT, not CASCADE: Exercise is a shared global catalog and
            // must never be removed as a side effect of deleting Workout
            // structure (same criterion as program_exercises.exercise_id).
            $table->foreignId('exercise_id')->constrained()->restrictOnDelete();
            // nullOnDelete, not cascade: exercise_id/position here are a
            // historical snapshot taken at creation time. If the referenced
            // ProgramExercise is later deleted, the executed data must
            // survive intact — only the link to it is cleared.
            $table->foreignId('program_exercise_id')->nullable()->constrained('program_exercises')->nullOnDelete();
            $table->unsignedInteger('position');
            $table->timestamps();

            $table->unique(['workout_id', 'position']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('workout_exercises');
    }
};
