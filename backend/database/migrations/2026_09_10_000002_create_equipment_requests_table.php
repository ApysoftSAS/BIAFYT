<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * A gym_admin's request for BIAFYT to add a machine to the GLOBAL
     * equipment catalog (the gym cannot touch the catalog itself). Same
     * shape family as `gym_registration_requests`: the requester never
     * decides the outcome; a BIAFYT Admin reviews it.
     *
     * State machine:
     *   pending        -> in_review              (admin starts the review)
     *   in_review      -> changes_requested      (admin asks for corrections)
     *   changes_requested -> pending             (gym edits and resubmits)
     *   in_review      -> approved               (associate to an existing
     *                                             equipment, OR create a new
     *                                             one — `resulting_equipment_id`)
     *   in_review      -> rejected
     *
     * Approving does NOT add the equipment to the requesting gym's inventory
     * (or any gym's) — the gym adds it afterwards via the existing
     * PUT /me/gym/{gym}/equipment/{equipment}.
     */
    public function up(): void
    {
        Schema::create('equipment_requests', function (Blueprint $table) {
            $table->id();
            $table->foreignId('gym_id')->constrained()->cascadeOnDelete();
            $table->foreignId('requested_by_user_id')->constrained('users')->cascadeOnDelete();
            $table->string('status'); // pending | in_review | changes_requested | approved | rejected

            // The proposed machine. Editable by the gym while
            // pending/changes_requested, and by the admin while in_review
            // ("corregir la información enviada").
            $table->string('name');
            $table->string('brand')->nullable();
            $table->string('model')->nullable();
            $table->text('description')->nullable();
            $table->string('category')->nullable();
            $table->json('photo_urls')->nullable();

            // Review outcome (latest). The full who-did-what history lives in
            // `equipment_request_events`.
            $table->text('review_note')->nullable();
            $table->foreignId('reviewed_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('reviewed_at')->nullable();

            // On approval: the catalog item this request resolved to (an
            // existing one, or a newly created one).
            $table->foreignId('resulting_equipment_id')->nullable()->constrained('equipment')->nullOnDelete();

            $table->timestamps();

            $table->index(['gym_id', 'status']);
            $table->index('status');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('equipment_requests');
    }
};
