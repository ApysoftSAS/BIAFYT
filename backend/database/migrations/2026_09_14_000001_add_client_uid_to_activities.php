<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * `client_uid`: a stable identifier the client generates for a training
     * session, so a retried `POST /me/activities` (roadmap 3c — future
     * outbox) is safe: the same user + client_uid always resolves to the
     * same Activity and the same `workout_completed` credit.
     *
     * NULL means "legacy / no client id" — those posts keep the current
     * behaviour exactly (no dedup beyond the existing UNIQUE(workout_id)).
     *
     * The uniqueness is scoped per user, NOT global: a client_uid is only
     * meaningful within one user's device, and two different users must be
     * able to send the same value. MySQL and SQLite both allow multiple
     * NULLs in a composite unique index, so every existing row (client_uid
     * NULL) is unaffected. This DB constraint is the final guarantee against
     * two concurrent requests with the same user_id + client_uid — the
     * controller pre-check is only an optimisation.
     */
    public function up(): void
    {
        Schema::table('activities', function (Blueprint $table) {
            $table->string('client_uid', 64)->nullable()->after('workout_id');
            $table->unique(['user_id', 'client_uid']);
        });
    }

    public function down(): void
    {
        // MySQL lets the composite unique above back the `user_id` foreign
        // key (its leftmost column), dropping the FK's own redundant index
        // when this migration runs. So before removing the unique, restore a
        // standalone index on `user_id` or the FK would be left unindexed.
        Schema::table('activities', function (Blueprint $table) {
            $table->index('user_id');
        });

        Schema::table('activities', function (Blueprint $table) {
            $table->dropUnique(['user_id', 'client_uid']);
            $table->dropColumn('client_uid');
        });
    }
};
