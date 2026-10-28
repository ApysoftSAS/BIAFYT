<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\MorphMany;

/**
 * The historical fact that a training session was performed and finished,
 * plus its aggregate summary. It does NOT replace Workout (the detailed
 * execution log): it is a separate concept with a distinct responsibility.
 * An Activity has no open/closed lifecycle — it only exists once the
 * session is complete — and is never updated or deleted through the API.
 */
class Activity extends Model
{
    /**
     * The attributes that are mass assignable.
     *
     * @var list<string>
     */
    protected $fillable = [
        'user_id',
        'workout_id',
        'client_uid',
        'routine_label',
        'started_at',
        'finished_at',
        'duration_seconds',
        'sets_completed',
        'exercises_completed',
    ];

    /**
     * The attributes that should be hidden for serialization. `client_uid`
     * is an internal dedup key, not part of the API response shape.
     *
     * @var list<string>
     */
    protected $hidden = [
        'user_id',
        'client_uid',
    ];

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'started_at' => 'datetime',
            'finished_at' => 'datetime',
            'duration_seconds' => 'integer',
            'sets_completed' => 'integer',
            'exercises_completed' => 'integer',
        ];
    }

    /**
     * Get the user this activity belongs to.
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /**
     * Get the detailed workout this activity summarizes, if any.
     */
    public function workout(): BelongsTo
    {
        return $this->belongsTo(Workout::class);
    }

    /**
     * Get the point transactions this activity originated. In this phase
     * that is exactly one `workout_completed` credit.
     */
    public function pointTransactions(): MorphMany
    {
        return $this->morphMany(PointTransaction::class, 'source');
    }
}
