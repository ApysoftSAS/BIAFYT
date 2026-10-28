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
        Schema::create('coach_notes', function (Blueprint $table) {
            $table->id();
            // Both sides cascade on delete, same reasoning as
            // coach_athlete_relationships: a note only means something while
            // both users exist.
            $table->foreignId('coach_user_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('athlete_user_id')->constrained('users')->cascadeOnDelete();
            // Free-text feedback the coach writes about the athlete. This is
            // the only "coach action" surface in the Coach MVP slice.
            $table->text('body');
            $table->timestamps();

            // Supports the "notes this coach wrote for this athlete" lookup.
            $table->index(['coach_user_id', 'athlete_user_id']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('coach_notes');
    }
};
