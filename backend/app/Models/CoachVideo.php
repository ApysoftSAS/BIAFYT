<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A TikTok video a coach chose to showcase inside BIAFYT (the coach's
 * "vitrina": every signed-in user can see it). Only the TikTok username and
 * video id are stored — playback is TikTok's official embed player.
 *
 * Account ownership is NOT verified (no TikTok OAuth in this slice): the
 * username is whatever the pasted URL carries.
 */
class CoachVideo extends Model
{
    /**
     * The attributes that are mass assignable.
     *
     * @var list<string>
     */
    protected $fillable = [
        'coach_user_id',
        'tiktok_username',
        'tiktok_video_id',
        'title',
    ];

    /**
     * The coach who published this video.
     */
    public function coach(): BelongsTo
    {
        return $this->belongsTo(User::class, 'coach_user_id');
    }
}
