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
        Schema::create('challenge_claims', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            // The frontend challenge id, e.g. "dc-sets". Not a FK — the
            // challenge catalog lives in code (App\Support\ChallengeRules),
            // mirroring the frontend.
            $table->string('challenge_id');
            // The calendar day the challenge belongs to, as a plain `Y-m-d`
            // string (same treatment as check_ins.check_in_date) so the
            // uniqueness rule is a simple, portable UNIQUE index.
            $table->string('challenge_date');
            $table->timestamps();

            // One claim per (user, day, challenge) — the last line of defense
            // behind the controller's pre-check and the ledger idempotency_key.
            $table->unique(['user_id', 'challenge_date', 'challenge_id']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('challenge_claims');
    }
};
