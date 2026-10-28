<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CoachAthleteRelationship extends Model
{
    public const STATUS_PENDING = 'pending';

    public const STATUS_ACTIVE = 'active';

    public const STATUS_REVOKED = 'revoked';

    /**
     * The attributes that are mass assignable.
     *
     * @var list<string>
     */
    protected $fillable = [
        'coach_user_id',
        'athlete_user_id',
        'status',
        'requested_at',
        'activated_at',
        'revoked_at',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'requested_at' => 'datetime',
            'activated_at' => 'datetime',
            'revoked_at' => 'datetime',
        ];
    }

    /**
     * Whether a currently `active` relationship exists with the given user as
     * coach and the given user as athlete. This is the authorization gate
     * for a coach reading an athlete's data: a pending or revoked row does
     * not grant access. A `coach` GymAssignment being revoked afterwards
     * does NOT invalidate an already-active relationship (historical
     * snapshot — same decision as the relationship lifecycle itself).
     */
    public static function activeBetween(int $coachUserId, int $athleteUserId): bool
    {
        return static::query()
            ->where('coach_user_id', $coachUserId)
            ->where('athlete_user_id', $athleteUserId)
            ->where('status', self::STATUS_ACTIVE)
            ->exists();
    }

    /**
     * The user acting as coach in this relationship.
     */
    public function coach(): BelongsTo
    {
        return $this->belongsTo(User::class, 'coach_user_id');
    }

    /**
     * The user acting as athlete in this relationship.
     */
    public function athlete(): BelongsTo
    {
        return $this->belongsTo(User::class, 'athlete_user_id');
    }
}
