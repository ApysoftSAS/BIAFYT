<?php

namespace App\Models;

use DomainException;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * An ecosystem voucher: a commercial benefit a Gym or a Coach issues to one
 * specific athlete, redeemed with the issuer off the platform. Single-use.
 *
 * Isolated domain — no relationship with reward_claims / point_transactions
 * / promotions / billing. GymAssignment and CoachAthleteRelationship are
 * used only as authorization gates by the controllers, never here.
 */
class Voucher extends Model
{
    public const STATUS_ISSUED = 'issued';

    public const STATUS_REDEEMED = 'redeemed';

    public const STATUS_REVOKED = 'revoked';

    /** Derived-only status — never stored (see effectiveStatus()). */
    public const STATUS_EXPIRED = 'expired';

    /** Stored statuses a client may filter a listing by. */
    public const FILTERABLE_STATUSES = [self::STATUS_ISSUED, self::STATUS_REDEEMED, self::STATUS_REVOKED];

    public const BENEFIT_PERCENT = 'percent';

    public const BENEFIT_FIXED = 'fixed';

    public const BENEFIT_TEXT = 'text';

    public const BENEFIT_TYPES = [self::BENEFIT_PERCENT, self::BENEFIT_FIXED, self::BENEFIT_TEXT];

    protected $fillable = [
        'code',
        'gym_id',
        'coach_user_id',
        'issued_by_user_id',
        'athlete_user_id',
        'title',
        'benefit_type',
        'benefit_value',
        'benefit_description',
        'applies_to',
        'status',
        'expires_at',
        'redeemed_at',
        'redeemed_by_user_id',
        'redemption_note',
        'revoked_at',
        'revoked_by_user_id',
        'revoke_reason',
    ];

    protected $hidden = [
        // Internal audit fields — never part of the API contract.
        'issued_by_user_id',
        'redeemed_by_user_id',
        'revoked_by_user_id',
        'gym_id',
        'coach_user_id',
        'athlete_user_id',
    ];

    protected function casts(): array
    {
        return [
            'benefit_value' => 'integer',
            'expires_at' => 'datetime',
            'redeemed_at' => 'datetime',
            'revoked_at' => 'datetime',
        ];
    }

    /**
     * A voucher has exactly one issuer side at creation: a gym OR a coach.
     * Same defense-in-depth style as GymAssignment's member/branch invariant.
     * Mass updates (redeem/revoke go through the query builder) do not fire
     * this — it guards issuance only, which is the point.
     */
    protected static function booted(): void
    {
        static::saving(function (Voucher $voucher) {
            $hasGym = $voucher->gym_id !== null;
            $hasCoach = $voucher->coach_user_id !== null;

            if ($hasGym === $hasCoach) {
                throw new DomainException('A voucher must have exactly one issuer: a gym OR a coach.');
            }
        });
    }

    public function gym(): BelongsTo
    {
        return $this->belongsTo(Gym::class);
    }

    public function coach(): BelongsTo
    {
        return $this->belongsTo(User::class, 'coach_user_id');
    }

    public function athlete(): BelongsTo
    {
        return $this->belongsTo(User::class, 'athlete_user_id');
    }

    public function issuedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'issued_by_user_id');
    }

    public function issuerType(): string
    {
        return $this->gym_id !== null ? 'gym' : 'coach';
    }

    public function isExpired(): bool
    {
        return $this->expires_at !== null && $this->expires_at->isPast();
    }

    /**
     * The status a client should see: `expired` when the voucher is still
     * `issued` but past its `expires_at`; the stored status otherwise.
     */
    public function effectiveStatus(): string
    {
        return $this->status === self::STATUS_ISSUED && $this->isExpired()
            ? self::STATUS_EXPIRED
            : $this->status;
    }

    public function isRedeemable(): bool
    {
        return $this->status === self::STATUS_ISSUED && ! $this->isExpired();
    }
}
