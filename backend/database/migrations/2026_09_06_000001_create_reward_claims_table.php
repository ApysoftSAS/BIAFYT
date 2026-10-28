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
        Schema::create('reward_claims', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            // The frontend prize id, e.g. "pz-clase-gratis". Not a FK — the
            // prize catalog lives in code (App\Support\RewardRules), mirroring
            // the frontend's `data/prizes.js#prizeCatalog`.
            $table->string('prize_id');
            // Client-generated correlation id (the frontend's local
            // `reward.uid`, e.g. "r-1735689600000"). Not trusted for anything
            // but idempotency: it lets a retried write-through POST for the
            // same local redemption be rejected instead of double-debited.
            $table->string('reward_uid');
            // Cost at the moment of claim, resolved server-side from
            // App\Support\RewardRules — never accepted from the client.
            // Kept here (not just on the ledger) so the claim is self-describing.
            $table->integer('cost');
            $table->timestamps();

            // One claim per (user, reward_uid) — the last line of defense
            // behind the controller's pre-check and the ledger idempotency_key.
            $table->unique(['user_id', 'reward_uid']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('reward_claims');
    }
};
