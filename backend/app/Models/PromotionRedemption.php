<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One user's redemption of a Promotion, created automatically at
 * registration. Carries a SNAPSHOT of the benefit at redemption time
 * (benefit_type/value/description are copied from the Promotion, not read
 * live from it) so a later edit to the promotion never changes what an
 * already-registered user was granted.
 */
class PromotionRedemption extends Model
{
    protected $fillable = [
        'promotion_id',
        'user_id',
        'benefit_type',
        'benefit_value',
        'benefit_description',
    ];

    protected function casts(): array
    {
        return [
            'benefit_value' => 'integer',
        ];
    }

    public function promotion(): BelongsTo
    {
        return $this->belongsTo(Promotion::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
