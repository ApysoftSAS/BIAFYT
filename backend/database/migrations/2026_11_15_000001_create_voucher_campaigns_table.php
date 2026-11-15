<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * A shared-code voucher ("campaign"): one code a gym hands out, with an
     * optional cap ("the first 50"). A member CLAIMS it and receives their own
     * personal voucher (the usual single-use `vouchers` row, linked here), so
     * redemption, revocation and the athlete's wallet work exactly as before.
     * The cap counts claims; each member can claim a campaign once.
     */
    public function up(): void
    {
        Schema::create('voucher_campaigns', function (Blueprint $table) {
            $table->id();
            $table->foreignId('gym_id')->constrained('gyms')->cascadeOnDelete();
            $table->foreignId('created_by_user_id')->nullable()->constrained('users')->nullOnDelete();

            // What members type in the app. Stored UPPERCASE; the claim lookup
            // normalizes the same way.
            $table->string('code', 24)->unique();

            $table->string('title');
            $table->string('benefit_type'); // percent | fixed | text
            $table->unsignedInteger('benefit_value')->nullable();
            $table->text('benefit_description');
            $table->string('applies_to')->nullable();

            // Claiming stops after this moment, and the vouchers it creates
            // expire then too.
            $table->timestamp('expires_at')->nullable();
            // null = unlimited claims.
            $table->unsignedInteger('max_claims')->nullable();
            $table->string('status')->default('active'); // active | closed

            $table->timestamps();

            $table->index(['gym_id', 'status']);
        });

        Schema::table('vouchers', function (Blueprint $table) {
            // nullOnDelete: a claimed voucher outlives its campaign row.
            $table->foreignId('campaign_id')->nullable()->after('id')->constrained('voucher_campaigns')->nullOnDelete();
            // One claim per member and campaign (NULLs are distinct, so
            // ordinary vouchers are unaffected).
            $table->unique(['campaign_id', 'athlete_user_id']);
        });
    }

    public function down(): void
    {
        Schema::table('vouchers', function (Blueprint $table) {
            $table->dropUnique(['campaign_id', 'athlete_user_id']);
            $table->dropConstrainedForeignId('campaign_id');
        });

        Schema::dropIfExists('voucher_campaigns');
    }
};
