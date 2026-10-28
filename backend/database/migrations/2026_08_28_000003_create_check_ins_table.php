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
        Schema::create('check_ins', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            // The calendar day the check-in belongs to. Kept as its own
            // column (not derived from `checked_in_at`) so the
            // one-check-in-per-day rule can be a plain UNIQUE index — the
            // last line of defense behind the controller's pre-check, same
            // pattern as activities.workout_id / point_transactions.idempotency_key.
            $table->date('check_in_date');
            $table->timestamp('checked_in_at');
            $table->timestamp('checked_out_at')->nullable();
            $table->timestamps();

            $table->unique(['user_id', 'check_in_date']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('check_ins');
    }
};
