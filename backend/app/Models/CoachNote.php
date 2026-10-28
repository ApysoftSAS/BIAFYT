<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A piece of free-text feedback a coach writes about one of their athletes.
 *
 * This is the single "coach action" of the Coach MVP slice: the coach reads
 * the athlete's (shadow-quality) information and leaves a note. It is NOT a
 * program, an assignment, or anything the athlete's app consumes today — the
 * athlete-facing bridge stays deferred (D3 / D-COACH-4).
 *
 * Reading notes requires a currently `active` coach<->athlete relationship
 * (same gate as reading any athlete data — D-COACH-3). A coach may delete
 * their own note regardless, since that touches only the coach's own data.
 */
class CoachNote extends Model
{
    /**
     * The attributes that are mass assignable.
     *
     * @var list<string>
     */
    protected $fillable = [
        'coach_user_id',
        'athlete_user_id',
        'body',
    ];

    /**
     * The attributes that should be hidden for serialization. The two user
     * ids are implied by the request scope (coach = token, athlete = route)
     * and never part of the API contract.
     *
     * @var list<string>
     */
    protected $hidden = [
        'coach_user_id',
        'athlete_user_id',
    ];

    /**
     * The user acting as coach (author) of this note.
     */
    public function coach(): BelongsTo
    {
        return $this->belongsTo(User::class, 'coach_user_id');
    }

    /**
     * The user acting as athlete (subject) of this note.
     */
    public function athlete(): BelongsTo
    {
        return $this->belongsTo(User::class, 'athlete_user_id');
    }
}
