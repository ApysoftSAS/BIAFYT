<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * The "BIAFYT Admin" flag. This is platform-level authorization, kept
     * deliberately SEPARATE from the per-gym `GymAssignment` roles: it is an
     * attribute of the User, never mass-assignable, and only granted by the
     * `BIAFYT:grant-platform-admin` ops command. A normal user can never
     * flip it (it is not in `User::$fillable` and no endpoint writes it).
     */
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->boolean('is_platform_admin')->default(false)->after('password');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('is_platform_admin');
        });
    }
};
