<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * `imported_at`: when the athlete copied this coach-authored program
     * into their own local routines. It lives on the athlete's own program
     * row (`programs.user_id` is the athlete), so "imported" is naturally
     * per-athlete: every athlete a coach builds for gets their own Program
     * row, and each one tracks its own import independently.
     *
     * NULL means "not imported yet" — the athlete's app still shows it in
     * the "from my coach" tray with a copy button. Once set it stays set:
     * the coach re-editing the program (name / days / exercises) never
     * touches this column, so the routine does not reappear as pending.
     *
     * Only meaningful when `created_by_user_id` is a coach; a self-authored
     * program keeps NULL forever. Backward-compatible: every existing row
     * keeps NULL.
     */
    public function up(): void
    {
        Schema::table('programs', function (Blueprint $table) {
            $table->timestamp('imported_at')->nullable()->after('created_by_user_id');
        });
    }

    public function down(): void
    {
        Schema::table('programs', function (Blueprint $table) {
            $table->dropColumn('imported_at');
        });
    }
};
