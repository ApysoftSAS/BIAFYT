<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Platform promotions (Promotion V0). A shareable code a BIAFYT Admin
     * creates for the athlete SIGNUP flow — completely separate from the
     * Voucher domain (issued by a Gym/Coach to one already-related athlete).
     *
     * V0 is deliberately platform-scope only: no gym_id/coach_user_id, no
     * status/expires_at — those are not part of the approved scope and are
     * a trivial ALTER later if ever needed. No currency: same posture as
     * Voucher, BIAFYT does not compute a real price or discount amount.
     */
    public function up(): void
    {
        Schema::create('promotions', function (Blueprint $table) {
            $table->id();

            // Admin-chosen, human-shareable (normalized upper-case + trimmed
            // by the controller before it ever reaches this column).
            $table->string('code', 50)->unique();

            // percent | fixed | text — informational, same vocabulary as
            // Voucher::BENEFIT_TYPES. No currency column.
            $table->string('benefit_type');
            $table->unsignedInteger('benefit_value')->nullable();
            $table->text('benefit_description');

            $table->foreignId('created_by_user_id')->nullable()->constrained('users')->nullOnDelete();

            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('promotions');
    }
};
