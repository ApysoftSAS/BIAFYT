<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\MorphMany;

/**
 * A record that a user redeemed a prize for points. At most one per (user,
 * reward_uid) — reward_uid is the client's local redemption id, used only to
 * make a retried write-through POST idempotent, never to prevent redeeming
 * the same prize again later. Recording it debits the prize's cost (from
 * App\Support\RewardRules) from the points ledger.
 *
 * This is a write-through shadow record, same class as Activity/CheckIn/
 * ChallengeClaim: LocalStorage stays the visible source of truth for the
 * user's rewards inventory; this only persists the backend-side audit +
 * ledger debit. It does NOT verify the prize's unlock condition (rank,
 * duels won, etc.) — those stay frontend-only, same accepted gap as
 * ChallengeClaim not verifying completion.
 */
class RewardClaim extends Model
{
    /**
     * The attributes that are mass assignable.
     *
     * @var list<string>
     */
    protected $fillable = [
        'user_id',
        'prize_id',
        'reward_uid',
        'cost',
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
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'cost' => 'integer',
        ];
    }

    /**
     * Get the user this claim belongs to.
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /**
     * Get the point transactions this claim originated (this phase: exactly
     * one `reward_claimed` debit).
     */
    public function pointTransactions(): MorphMany
    {
        return $this->morphMany(PointTransaction::class, 'source');
    }
}
