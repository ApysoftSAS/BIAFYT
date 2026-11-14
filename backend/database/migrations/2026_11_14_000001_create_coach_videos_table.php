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
        Schema::create('coach_videos', function (Blueprint $table) {
            $table->id();
            $table->foreignId('coach_user_id')->constrained('users')->cascadeOnDelete();
            // Both parsed from the TikTok URL the coach pasted
            // (https://www.tiktok.com/@{username}/video/{id}). The video is
            // never downloaded or stored — only referenced for the official
            // embed player.
            $table->string('tiktok_username', 24);
            $table->string('tiktok_video_id', 25);
            // Written by the coach: TikTok's public oEmbed returns no
            // title/author server-side, so nothing is fetched from TikTok.
            $table->string('title', 150);
            $table->timestamps();

            $table->unique(['coach_user_id', 'tiktok_video_id']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('coach_videos');
    }
};
