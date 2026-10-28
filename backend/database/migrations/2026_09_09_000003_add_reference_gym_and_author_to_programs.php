<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Two optional facets on a program:
     *
     * - `reference_gym_id`: an optional "train at this gym" context. The
     *   program's owner does NOT need a GymAssignment there (visiting
     *   athlete, temporary training, a coach preparing a routine for a
     *   specific gym). When set, the program's exercises are validated
     *   against that gym's inventory at write time.
     *
     * - `created_by_user_id`: who authored the program. NULL / equal to
     *   `user_id` means the owner made it themselves. A different user is
     *   the coach who created it for the athlete (gated by an active
     *   coach<->athlete relationship). This is how the athlete's app tells
     *   "my routine" from "a routine from my coach".
     *
     * Both nullable, both `nullOnDelete` — deleting the referenced gym or
     * the coach's account must not delete the athlete's program.
     * Backward-compatible: every existing program keeps NULL for both.
     */
    public function up(): void
    {
        Schema::table('programs', function (Blueprint $table) {
            $table->foreignId('reference_gym_id')->nullable()->after('name')
                ->constrained('gyms')->nullOnDelete();
            $table->foreignId('created_by_user_id')->nullable()->after('reference_gym_id')
                ->constrained('users')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('programs', function (Blueprint $table) {
            $table->dropConstrainedForeignId('reference_gym_id');
            $table->dropConstrainedForeignId('created_by_user_id');
        });
    }
};
