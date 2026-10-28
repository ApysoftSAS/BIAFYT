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
        Schema::create('point_transactions', function (Blueprint $table) {
            $table->id();
            // cascadeOnDelete + index: balance and history are always read
            // per authenticated user.
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            // Signed: credits positive, debits negative. This phase only
            // writes positive credits, but the column shape already fits
            // future debits (reward purchases) and reversals (voided duels)
            // with no migration.
            $table->integer('amount');
            // Machine code for the event that produced the points, e.g.
            // 'workout_completed'. Enumerated as model constants.
            $table->string('reason');
            // nullableMorphs('source'): the originating entity. This phase it
            // is always an Activity. Not a real FK (morphs), but the app
            // always sets it. Creates the (source_type, source_id) index.
            $table->nullableMorphs('source');
            // Last line of defense against double credit: for
            // 'workout_completed' the key is "activity:{activity_id}", so the
            // database guarantees a single credit per Activity even if the
            // controller pre-check regresses. NULL for future events without
            // a natural key.
            $table->string('idempotency_key')->nullable()->unique();
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('point_transactions');
    }
};
