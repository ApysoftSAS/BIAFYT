<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * One redemption of a Promotion by one user, created automatically at
     * registration (Promotion V0). Carries a SNAPSHOT of the benefit at
     * redemption time, so a later edit to the promotion never changes what
     * an already-registered user was granted.
     *
     * `UNIQUE(promotion_id, user_id)` enforces "a promotion can be used once
     * per user" at the database level (defense in depth — in practice a
     * user only ever redeems during their own single registration).
     */
    public function up(): void
    {
        Schema::create('promotion_redemptions', function (Blueprint $table) {
            $table->id();

            // nullOnDelete: the redemption is the user's historical record,
            // it survives even if the promotion row is later removed.
            $table->foreignId('promotion_id')->nullable()->constrained('promotions')->nullOnDelete();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();

            $table->string('benefit_type');
            $table->unsignedInteger('benefit_value')->nullable();
            $table->text('benefit_description');

            $table->timestamps();

            $table->unique(['promotion_id', 'user_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('promotion_redemptions');
    }
};
