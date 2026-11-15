<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\MorphMany;
use Illuminate\Support\Carbon;

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

    /** Nobody answered/finished in time. No winner, no ledger movement. */
    public const STATUS_EXPIRED = 'expired';

    /** A challenge nobody answers lapses this many days after it was sent. */
    public const PENDING_TTL_DAYS = 3;

    /** An accepted duel lapses this many days after acceptance if it is not resolved. */
    public const ACTIVE_TTL_DAYS = 7;

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
        self::STATUS_EXPIRED,
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

    /**
     * Lapse every standing duel past its deadline. Called lazily from the
     * API (no scheduler needed): both participants then see `expired`, and
     * the app refunds the locked stake exactly like a cancellation.
     * ponytail: global sweep on read; move to a scheduled command if the
     * duels table grows large.
     */
    public static function expireStale(): void
    {
        $lapse = ['status' => self::STATUS_EXPIRED, 'finished_at' => now()];

        static::where('status', self::STATUS_PENDING)
            ->where('created_at', '<', now()->subDays(self::PENDING_TTL_DAYS))
            ->update($lapse);

        static::whereIn('status', self::RUNNABLE_STATUSES)
            ->where('accepted_at', '<', now()->subDays(self::ACTIVE_TTL_DAYS))
            ->update($lapse);
    }

    /**
     * When this duel lapses, or null once it is terminal.
     */
    public function expiresAt(): ?Carbon
    {
        return match (true) {
            $this->status === self::STATUS_PENDING => $this->created_at?->copy()->addDays(self::PENDING_TTL_DAYS),
            in_array($this->status, self::RUNNABLE_STATUSES, true) => ($this->accepted_at ?? $this->created_at)?->copy()->addDays(self::ACTIVE_TTL_DAYS),
            default => null,
        };
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
