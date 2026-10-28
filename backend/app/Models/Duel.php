<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\MorphMany;

/**
 * A duel between two real users. State machine:
 *
 *   pending   --opponent accept--> accepted
 *   pending   --opponent reject--> rejected      (terminal)
 *   pending   --challenger cancel--> cancelled   (terminal)
 *   accepted  --first run--> in_progress
 *   accepted/in_progress --challenger cancel--> cancelled (terminal)
 *   in_progress --both runs, both eligible--> finished     (terminal, winner)
 *   in_progress --both runs, some ineligible--> unvalidated (terminal, no winner)
 */
class Duel extends Model
{
    public const STATUS_PENDING = 'pending';

    public const STATUS_ACCEPTED = 'accepted';

    public const STATUS_IN_PROGRESS = 'in_progress';

    public const STATUS_FINISHED = 'finished';

    public const STATUS_REJECTED = 'rejected';

    public const STATUS_CANCELLED = 'cancelled';

    public const STATUS_UNVALIDATED = 'unvalidated';

    /** Statuses in which a run may still be submitted. */
    public const RUNNABLE_STATUSES = [self::STATUS_ACCEPTED, self::STATUS_IN_PROGRESS];

    /** Statuses the challenger may cancel from. */
    public const CANCELLABLE_STATUSES = [self::STATUS_PENDING, self::STATUS_ACCEPTED, self::STATUS_IN_PROGRESS];

    /** Terminal statuses — nothing transitions out of these. */
    public const TERMINAL_STATUSES = [
        self::STATUS_FINISHED,
        self::STATUS_REJECTED,
        self::STATUS_CANCELLED,
        self::STATUS_UNVALIDATED,
    ];

    protected $fillable = [
        'challenger_user_id',
        'opponent_user_id',
        'gym_id',
        'modality',
        'stake',
        'status',
        'winner_user_id',
        'outcome',
        'result',
        'accepted_at',
        'finished_at',
    ];

    protected function casts(): array
    {
        return [
            'stake' => 'integer',
            'result' => 'array',
            'accepted_at' => 'datetime',
            'finished_at' => 'datetime',
        ];
    }

    public function challenger(): BelongsTo
    {
        return $this->belongsTo(User::class, 'challenger_user_id');
    }

    public function opponent(): BelongsTo
    {
        return $this->belongsTo(User::class, 'opponent_user_id');
    }

    public function winner(): BelongsTo
    {
        return $this->belongsTo(User::class, 'winner_user_id');
    }

    public function runs(): HasMany
    {
        return $this->hasMany(DuelRun::class);
    }

    /**
     * The best-effort points ledger entries this duel produced (5th source:
     * duel_won / duel_lost). Not authoritative in this phase.
     */
    public function pointTransactions(): MorphMany
    {
        return $this->morphMany(PointTransaction::class, 'source');
    }

    public function isParticipant(int $userId): bool
    {
        return (int) $this->challenger_user_id === $userId || (int) $this->opponent_user_id === $userId;
    }
}
