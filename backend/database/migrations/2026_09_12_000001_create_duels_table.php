<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * A duel between two real users over the SAME routine. The challenger
     * creates it, the opponent accepts, both submit a run, and the backend
     * resolves the winner head-to-head (App\Support\DuelRules).
     *
     * `stake` mirrors the frontend's LocalStorage points bet — it is not an
     * authoritative balance movement in this phase (roadmap 3b): the visible
     * points balance stays LocalStorage. On finish the backend does write a
     * best-effort PointTransaction per participant (duel_won / duel_lost) as
     * the ledger's 5th source, but nothing reads that balance as authority
     * yet (roadmap 3c).
     */
    public function up(): void
    {
        Schema::create('duels', function (Blueprint $table) {
            $table->id();
            // Both sides cascade: a duel only means something with both users
            // present (same rationale as coach_athlete_relationships).
            $table->foreignId('challenger_user_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('opponent_user_id')->constrained('users')->cascadeOnDelete();
            // The shared gym context, captured from the challenger's active
            // membership at creation time. Nullable + nullOnDelete: the duel
            // survives the gym record going away.
            $table->foreignId('gym_id')->nullable()->constrained('gyms')->nullOnDelete();
            $table->string('modality');
            $table->unsignedInteger('stake')->default(0);
            // pending | accepted | in_progress | finished | rejected | cancelled | unvalidated
            $table->string('status')->default('pending');
            $table->foreignId('winner_user_id')->nullable()->constrained('users')->nullOnDelete();
            // challenger | opponent | draw
            $table->string('outcome')->nullable();
            // Score breakdown for display (per-participant totals + weighted
            // metric breakdown + modality weights). Derived, not a source of
            // truth beyond the finished duel itself.
            $table->json('result')->nullable();
            $table->timestamp('accepted_at')->nullable();
            $table->timestamp('finished_at')->nullable();
            $table->timestamps();

            $table->index(['challenger_user_id', 'opponent_user_id']);
            $table->index(['opponent_user_id', 'status']);
        });

        Schema::create('duel_runs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('duel_id')->constrained('duels')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->unsignedInteger('duration_seconds');
            $table->unsignedInteger('exercises_completed');
            $table->unsignedInteger('sets_completed');
            $table->unsignedInteger('valid_reps');
            $table->unsignedTinyInteger('consistency');
            $table->unsignedInteger('penalties');
            // Whether the submitting client reported the run as GPS/anti-fraud
            // eligible (same trust model as Activity: a client-reported fact,
            // not verified here). If either participant's run is not eligible
            // the duel resolves to `unvalidated` with no winner and no ledger
            // movement.
            $table->boolean('competitive_eligible')->default(false);
            $table->timestamp('submitted_at');
            $table->timestamps();

            // One run per participant per duel.
            $table->unique(['duel_id', 'user_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('duel_runs');
        Schema::dropIfExists('duels');
    }
};
