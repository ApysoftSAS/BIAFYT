<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One discount line within a Promotion (Promotion V1): a specific
 * (audience, duration_months) combination and its benefit. The discount
 * always lives here, never on the `Promotion` header, because a single
 * Promotion can offer different values per audience and per duration (e.g.
 * ANIVERSARIO2026: 15% for Athlete/12mo, 25% for Coach/12mo).
 *
 * No "applies to all audiences" wildcard in V1 — every rule names one
 * explicit audience.
 */
class PromotionRule extends Model
{
    public const AUDIENCE_ATHLETE = 'athlete';

    public const AUDIENCE_COACH = 'coach';

    public const AUDIENCE_GYM = 'gym';

    public const AUDIENCES = [self::AUDIENCE_ATHLETE, self::AUDIENCE_COACH, self::AUDIENCE_GYM];

    public const DURATIONS = [3, 6, 12];

    public const BENEFIT_PERCENT = 'percent';

    public const BENEFIT_FIXED = 'fixed';

    public const BENEFIT_TYPES = [self::BENEFIT_PERCENT, self::BENEFIT_FIXED];

    protected $fillable = [
        'promotion_id',
        'audience',
        'duration_months',
        'benefit_type',
        'benefit_value',
    ];

    protected function casts(): array
    {
        return [
            'duration_months' => 'integer',
            'benefit_value' => 'integer',
        ];
    }

    public function promotion(): BelongsTo
    {
        return $this->belongsTo(Promotion::class);
    }
}
