<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * A user's request to register a gym on the platform. A BIAFYT Admin
     * reviews it; approving it creates the Gym + its main Branch + a
     * `gym_admin` GymAssignment for the applicant, in one transaction.
     *
     * State machine: pending -> approved | rejected (both terminal).
     *
     * "No two pending requests for the same user" is enforced at the
     * application level (search-before-create in the controller), the same
     * pattern as CoachAthleteRelationship — a rejected request is a permanent
     * historical row and a new request after rejection inserts a NEW row, so
     * a plain UNIQUE would be wrong here.
     */
    public function up(): void
    {
        Schema::create('gym_registration_requests', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->string('status'); // pending | approved | rejected

            // What the applicant wants created.
            $table->string('gym_name');
            $table->string('branch_name');
            $table->text('applicant_message')->nullable();

            // Set by the reviewing BIAFYT Admin.
            $table->text('review_note')->nullable();
            $table->foreignId('reviewed_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('reviewed_at')->nullable();

            // Set on approval — the Gym this request produced.
            $table->foreignId('gym_id')->nullable()->constrained('gyms')->nullOnDelete();

            $table->timestamps();

            // Supports the "does this user have a pending request?" lookup and
            // the admin listing filtered by status.
            $table->index(['user_id', 'status']);
            $table->index('status');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('gym_registration_requests');
    }
};
