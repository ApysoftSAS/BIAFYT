<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Promotion V1: the single flat benefit (benefit_type/value/description)
     * moves to `promotion_rules`, one row per (audience, duration_months) —
     * a V0 code always meant exactly one discount; V1 needs the same code to
     * offer different discounts per audience (Athlete/Coach/Gym) and per
     * plan duration (3/6/12 months). Adds `active`/`valid_from`/`valid_until`
     * — deliberately out of V0's scope, now needed for a real, time-boxed
     * campaign.
     */
    public function up(): void
    {
        Schema::table('promotions', function (Blueprint $table) {
            $table->dropColumn(['benefit_type', 'benefit_value', 'benefit_description']);
            $table->boolean('active')->default(true)->after('code');
            $table->timestamp('valid_from')->nullable()->after('active');
            $table->timestamp('valid_until')->nullable()->after('valid_from');
        });
    }

    public function down(): void
    {
        Schema::table('promotions', function (Blueprint $table) {
            $table->dropColumn(['active', 'valid_from', 'valid_until']);
            $table->string('benefit_type')->nullable();
            $table->unsignedInteger('benefit_value')->nullable();
            $table->text('benefit_description')->nullable();
        });
    }
};
