<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * A shared voucher code a gym hands out (see the migration). Members claim
 * it and receive a personal `Voucher`; the campaign only stores the template
 * and the cap.
 */
class VoucherCampaign extends Model
{
    public const STATUS_ACTIVE = 'active';

    public const STATUS_CLOSED = 'closed';

    /** Derived, never stored. */
    public const STATUS_EXPIRED = 'expired';

    /** Derived, never stored: the cap was reached. */
    public const STATUS_FULL = 'full';

    protected $fillable = [
        'gym_id',
        'created_by_user_id',
        'code',
        'title',
        'benefit_type',
        'benefit_value',
        'benefit_description',
        'applies_to',
        'expires_at',
        'max_claims',
        'status',
    ];

    protected function casts(): array
    {
        return [
            'benefit_value' => 'integer',
            'max_claims' => 'integer',
            'expires_at' => 'datetime',
        ];
    }

    public function gym(): BelongsTo
    {
        return $this->belongsTo(Gym::class);
    }

    public function vouchers(): HasMany
    {
        return $this->hasMany(Voucher::class, 'campaign_id');
    }

    /**
     * What a client should see: `closed` (the gym stopped it), `expired`
     * (past `expires_at`), `full` (cap reached) or `active`.
     */
    public function effectiveStatus(int $claimed): string
    {
        return match (true) {
            $this->status === self::STATUS_CLOSED => self::STATUS_CLOSED,
            $this->expires_at !== null && $this->expires_at->isPast() => self::STATUS_EXPIRED,
            $this->max_claims !== null && $claimed >= $this->max_claims => self::STATUS_FULL,
            default => self::STATUS_ACTIVE,
        };
    }
}
