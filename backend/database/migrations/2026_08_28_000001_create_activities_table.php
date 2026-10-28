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
        Schema::create('activities', function (Blueprint $table) {
            $table->id();
            // cascadeOnDelete: an activity has no meaning without its user
            // (same criterion as workouts.user_id).
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            // nullOnDelete, not cascade: an Activity is a historical fact
            // ("a training session happened and finished") that must survive
            // the linked Workout being deleted while still open — only the
            // link is cleared. Same philosophy as workouts.program_day_id.
            $table->foreignId('workout_id')->nullable()->constrained()->nullOnDelete();
            // Snapshot of the routine name shown in history. There is no
            // backend "routine" entity, so it is frozen as free text.
            $table->string('routine_label')->nullable();
            $table->timestamp('started_at');
            // An Activity always represents a *completed* session: finished_at
            // is required. Its mandatory presence is the structural
            // difference from Workout (which has an open -> finished cycle).
            $table->timestamp('finished_at');
            $table->unsignedInteger('duration_seconds');
            $table->unsignedInteger('sets_completed');
            $table->unsignedInteger('exercises_completed');
            $table->timestamps();

            // Last line of defense against double-award: at most one Activity
            // per Workout. Multiple NULLs are allowed (standalone activities),
            // so this never constrains sessions with no linked Workout.
            $table->unique('workout_id');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('activities');
    }
};
