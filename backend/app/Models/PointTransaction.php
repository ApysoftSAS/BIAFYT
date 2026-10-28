<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\MorphTo;

/**
 * A single, immutable movement of points for a user: a signed amount, a
 * typed reason, and a reference to the event that produced it. The table
 * is append-only — there is no endpoint that updates or deletes a row.
 * The user's balance is the sum of their transactions.
 */
class PointTransaction extends Model
{
    /**
     * Points credited for completing a training session. Amount is derived
     * by the backend from the session facts (see App\Support\PointRules);
     * never accepted from the client.
     */
    public const REASON_WORKOUT_COMPLETED = 'workout_completed';

    /**
     * Flat points credited for a daily gym check-in (once per day). Amount
     * is `App\Support\PointRules::CHECKIN`; never accepted from the client.
     */
    public const REASON_CHECKIN = 'checkin';

    /**
     * Points credited for claiming a daily challenge. Amount is the
     * challenge's reward from `App\Support\ChallengeRules`; never accepted
     * from the client. Shadow mode: the claim is recorded, not verified.
     */
    public const REASON_CHALLENGE_CLAIMED = 'challenge_claimed';

    /**
     * Points debited for redeeming a prize. Amount is negative — the cost
     * from App\Support\RewardRules; never accepted from the client. Shadow
     * mode: the redemption is recorded, its unlock condition is not verified.
     */
    public const REASON_REWARD_CLAIMED = 'reward_claimed';

    /**
     * Points credited to the winner of a finished duel (amount = +stake).
     * Best-effort 5th source (roadmap 3b): written when a duel resolves,
     * but the visible balance is still LocalStorage — nothing reads this as
     * authority yet (roadmap 3c). Stake is never accepted from the client.
     */
    public const REASON_DUEL_WON = 'duel_won';

    /**
     * Points debited from the loser of a finished duel (amount = -stake).
     * Same best-effort 5th-source semantics as REASON_DUEL_WON.
     */
    public const REASON_DUEL_LOST = 'duel_lost';

    /**
     * The attributes that are mass assignable.
     *
     * @var list<string>
     */
    protected $fillable = [
        'user_id',
        'amount',
        'reason',
        'source_type',
        'source_id',
        'idempotency_key',
    ];

    /**
     * The attributes that should be hidden for serialization.
     *
     * @var list<string>
     */
    protected $hidden = [
        'user_id',
        'idempotency_key',
    ];

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'amount' => 'integer',
        ];
    }

    /**
     * Get the user this transaction belongs to.
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /**
     * Get the originating entity (Activity, CheckIn, ChallengeClaim,
     * RewardClaim or Duel).
     */
    public function source(): MorphTo
    {
        return $this->morphTo();
    }
}
