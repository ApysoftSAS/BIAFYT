<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\MorphMany;

/**
 * A daily gym check-in for a user. At most one per calendar day
 * (`UNIQUE(user_id, check_in_date)`). Recording it credits a flat
 * `checkin` amount to the points ledger. This model does NOT compute a
 * streak — the streak counter and any streak-break rule remain
 * frontend-local until a dedicated attendance/streak phase.
 */
class CheckIn extends Model
{
    /**
     * The attributes that are mass assignable.
     *
     * @var list<string>
     */
    protected $fillable = [
        'user_id',
        'check_in_date',
        'checked_in_at',
        'checked_out_at',
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
     * `check_in_date` is deliberately NOT cast: it is a plain `Y-m-d`
     * calendar-day bucket (the uniqueness key), stored and compared as a
     * string so it never picks up a spurious time component.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'checked_in_at' => 'datetime',
            'checked_out_at' => 'datetime',
        ];
    }

    /**
     * Get the user this check-in belongs to.
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /**
     * Get the point transactions this check-in originated (this phase:
     * exactly one `checkin` credit).
     */
    public function pointTransactions(): MorphMany
    {
        return $this->morphMany(PointTransaction::class, 'source');
    }
}
