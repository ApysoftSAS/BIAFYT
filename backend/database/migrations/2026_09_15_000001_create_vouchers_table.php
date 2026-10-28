<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Ecosystem vouchers (Fase Vouchers V1).
     *
     * A commercial benefit a Gym (via its gym_admin) or a Coach issues to
     * ONE specific athlete. The athlete redeems it WITH the issuer, off the
     * platform — BIAFYT never processes the money and never computes the
     * price the gym/coach charges. Single-use.
     *
     * This domain is deliberately isolated: no FK to and no shared logic
     * with reward_claims / point_transactions / promotions / billing.
     * GymAssignment and CoachAthleteRelationship are reused ONLY as
     * authorization gates, never referenced here.
     *
     * State machine (stored `status`):
     *   issued --issuer confirms--> redeemed   (terminal)
     *   issued --issuer cancels---> revoked    (terminal)
     * `expired` is NOT stored: it is derived from `expires_at` on read
     * (`Voucher::effectiveStatus()`), same "no cron" posture as the rest of
     * the project.
     */
    public function up(): void
    {
        Schema::create('vouchers', function (Blueprint $table) {
            $table->id();

            // Opaque, backend-generated, unguessable identifier the athlete
            // presents to the issuer. `VCH-` + 12 Crockford-base32 chars
            // (~60 bits from random_int). Never sequential or derived.
            $table->string('code', 20)->unique();

            // Exactly one issuer side is set at creation (invariant enforced
            // in Voucher::booted). Both nullOnDelete: the voucher is a
            // historical record the athlete still holds if the gym/coach
            // account is later removed.
            $table->foreignId('gym_id')->nullable()->constrained('gyms')->nullOnDelete();
            $table->foreignId('coach_user_id')->nullable()->constrained('users')->nullOnDelete();

            // The real user who created it (a gym_admin, or the coach). Audit
            // only — never part of the API contract.
            $table->foreignId('issued_by_user_id')->nullable()->constrained('users')->nullOnDelete();

            // The recipient — fixed at issue time, never taken from the body
            // (it comes from the route / the validated relationship).
            $table->foreignId('athlete_user_id')->constrained('users')->cascadeOnDelete();

            $table->string('title');
            // percent | fixed | text — informational. There is NO currency
            // column: BIAFYT does not know or compute the money amount.
            $table->string('benefit_type');
            $table->unsignedInteger('benefit_value')->nullable();
            $table->text('benefit_description');
            $table->string('applies_to')->nullable();

            $table->string('status')->default('issued'); // issued | redeemed | revoked
            $table->timestamp('expires_at')->nullable();

            $table->timestamp('redeemed_at')->nullable();
            $table->foreignId('redeemed_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->text('redemption_note')->nullable();

            $table->timestamp('revoked_at')->nullable();
            $table->foreignId('revoked_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->text('revoke_reason')->nullable();

            $table->timestamps();

            $table->index(['athlete_user_id', 'status']);
            $table->index(['gym_id', 'status']);
            $table->index(['coach_user_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('vouchers');
    }
};
