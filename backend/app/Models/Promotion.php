<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * A platform promotion (Promotion V1): a shareable code a BIAFYT Admin
 * creates as a discount on Athlete/Coach/Gym Premium memberships. Reusable
 * by many users (unlike Voucher, which is issued to exactly one recipient).
 *
 * The promotion itself carries no benefit and no audience — those live per
 * `PromotionRule` (one row per audience + plan duration), so a single code
 * can offer different discounts to Athlete/Coach/Gym and different
 * discounts per duration within the same audience.
 *
 * Isolated domain — no relationship with Voucher, reward_claims,
 * point_transactions or billing.
 */
class Promotion extends Model
{
    protected $fillable = [
        'code',
        'active',
        'valid_from',
        'valid_until',
        'created_by_user_id',
    ];

    protected $hidden = [
        // Internal audit field — never part of the API contract.
        'created_by_user_id',
    ];

    protected function casts(): array
    {
        return [
            'active' => 'boolean',
            'valid_from' => 'datetime',
            'valid_until' => 'datetime',
        ];
    }

    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by_user_id');
    }

    public function redemptions(): HasMany
    {
        return $this->hasMany(PromotionRedemption::class);
    }

    public function rules(): HasMany
    {
        return $this->hasMany(PromotionRule::class);
    }
}
