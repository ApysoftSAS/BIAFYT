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
        Schema::create('exercise_performances', function (Blueprint $table) {
            $table->id();
            $table->foreignId('workout_exercise_id')->constrained()->cascadeOnDelete();
            $table->unsignedInteger('set_number');
            $table->unsignedSmallInteger('reps')->nullable();
            $table->decimal('load', 6, 2)->nullable();
            $table->unsignedInteger('duration_seconds')->nullable();
            $table->decimal('rpe', 3, 1)->nullable();
            $table->timestamps();

            $table->unique(['workout_exercise_id', 'set_number']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('exercise_performances');
    }
};
