<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('gym_assignments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('gym_id')->constrained()->cascadeOnDelete();
            // RESTRICT, not CASCADE: branch_id is a base column of the
            // branch_id_norm generated column below, and MySQL/InnoDB does
            // not permit ON DELETE CASCADE (or SET NULL) on a foreign key
            // over a column that a generated column depends on (verified
            // empirically against the project's real MySQL 8.0.42 — CASCADE
            // fails with "1215 Cannot add foreign key constraint", RESTRICT
            // does not). Deleting a Branch with active assignments must
            // reassign/remove them first.
            $table->foreignId('branch_id')->nullable()->constrained()->restrictOnDelete();
            $table->string('role');
            $table->string('status');

            // Technical column: normalizes NULL branch_id to 0 so the unique
            // constraint below can rely on it. MySQL (and SQLite) treat every
            // NULL as distinct for UNIQUE purposes, so a plain
            // unique(user_id, gym_id, branch_id, role) would NOT prevent two
            // identical rows with branch_id = NULL. This generated column
            // fixes that without changing the meaning of branch_id itself.
            $table->unsignedBigInteger('branch_id_norm')
                ->storedAs('COALESCE(branch_id, 0)');

            $table->timestamps();

            $table->unique(['user_id', 'gym_id', 'branch_id_norm', 'role']);
            $table->index(['gym_id', 'branch_id']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('gym_assignments');
    }
};
