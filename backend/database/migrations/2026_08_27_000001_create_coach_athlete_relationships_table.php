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
        Schema::create('coach_athlete_relationships', function (Blueprint $table) {
            $table->id();
            // Both sides cascade on delete: this row only means something in
            // the context of both users existing. Unlike Workout (a
            // historical record that must survive its ProgramDay being
            // edited), a coach<->athlete consent relationship has no
            // independent meaning once either participant is gone.
            $table->foreignId('coach_user_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('athlete_user_id')->constrained('users')->cascadeOnDelete();
            $table->string('status');
            $table->timestamp('requested_at');
            $table->timestamp('activated_at')->nullable();
            $table->timestamp('revoked_at')->nullable();
            $table->timestamps();

            // No DB-level UNIQUE on (coach_user_id, athlete_user_id): a
            // revoked relationship is a permanent historical row, and a new
            // request after revocation must be able to insert a NEW row for
            // the same pair (its own activated_at window, per product
            // decision). A plain unique pair constraint would block that.
            // "No duplicate pending/active row for the same pair" is instead
            // enforced at the application level (search-before-create in
            // the controller), the same way GymAssignment::store() enforces
            // "no duplicate active assignment" beyond what its own UNIQUE
            // key covers. This composite index only supports that lookup
            // and the index() listing query; it does not constrain writes.
            $table->index(['coach_user_id', 'athlete_user_id']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('coach_athlete_relationships');
    }
};
