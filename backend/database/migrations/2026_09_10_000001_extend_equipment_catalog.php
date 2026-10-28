<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Extend the global equipment catalog with the descriptive fields a
     * BIAFYT Admin curates (brand/model/description/category/photos) and
     * an `is_active` flag to retire an item without deleting it.
     *
     * Additive only. Every existing row keeps `is_active = true` (the
     * default) and NULL for the new descriptive fields, so the current
     * `GET /equipment`, gym inventory, and routine-validation behaviour is
     * unchanged.
     */
    public function up(): void
    {
        Schema::table('equipment', function (Blueprint $table) {
            $table->text('description')->nullable()->after('name');
            $table->string('brand')->nullable()->after('description');
            $table->string('model')->nullable()->after('brand');
            $table->string('category')->nullable()->after('model');
            // Photo URLs the admin curates (this project has no upload/media
            // infrastructure — these are links, not stored files).
            $table->json('photo_urls')->nullable()->after('category');
            $table->boolean('is_active')->default(true)->after('photo_urls');
            $table->index('is_active');
        });
    }

    public function down(): void
    {
        Schema::table('equipment', function (Blueprint $table) {
            $table->dropIndex(['is_active']);
            $table->dropColumn(['description', 'brand', 'model', 'category', 'photo_urls', 'is_active']);
        });
    }
};
