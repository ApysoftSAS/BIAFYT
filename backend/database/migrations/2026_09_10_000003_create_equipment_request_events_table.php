<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Append-only audit log for an equipment request: who did what, when,
     * with an optional note. This project has no auditing package, so this
     * is the audit trail — same "append-only shadow record" pattern already
     * used by `point_transactions` / `challenge_claims`.
     *
     * `action`: submitted | resubmitted | review_started | changes_requested
     *         | info_corrected | approved | rejected
     */
    public function up(): void
    {
        Schema::create('equipment_request_events', function (Blueprint $table) {
            $table->id();
            $table->foreignId('equipment_request_id')->constrained()->cascadeOnDelete();
            $table->foreignId('actor_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('action');
            $table->text('note')->nullable();
            $table->timestamps();

            $table->index('equipment_request_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('equipment_request_events');
    }
};
