<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\MorphMany;

/**
 * A record that a user claimed a daily challenge on a given day. At most
 * one per (user, day, challenge). Recording it credits the challenge's
 * reward (from App\Support\ChallengeRules) to the points ledger.
 *
 * This is a shadow-mode audit record: it does NOT assert the challenge was
 * actually completed — completion is still computed frontend-side.
 */
class ChallengeClaim extends Model
{
    /**
     * The attributes that are mass assignable.
     *
     * @var list<string>
     */
    protected $fillable = [
        'user_id',
        'challenge_id',
        'challenge_date',
    ];

    /**
     * The attributes that should be hidden for serialization.
     *
     * @var list<string>
     */
    protected $hidden = [
        'user_id',
    ];

    /**
     * Get the user this claim belongs to.
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /**
     * Get the point transactions this claim originated (this phase: exactly
     * one `challenge_claimed` credit).
     */
    public function pointTransactions(): MorphMany
    {
        return $this->morphMany(PointTransaction::class, 'source');
    }
}
