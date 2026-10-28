<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One participant's execution of the duel routine. Immutable once
 * submitted: there is no endpoint to update or delete a run.
 */
class DuelRun extends Model
{
    protected $fillable = [
        'duel_id',
        'user_id',
        'duration_seconds',
        'exercises_completed',
        'sets_completed',
        'valid_reps',
        'consistency',
        'penalties',
        'competitive_eligible',
        'submitted_at',
    ];

    protected function casts(): array
    {
        return [
            'duration_seconds' => 'integer',
            'exercises_completed' => 'integer',
            'sets_completed' => 'integer',
            'valid_reps' => 'integer',
            'consistency' => 'integer',
            'penalties' => 'integer',
            'competitive_eligible' => 'boolean',
            'submitted_at' => 'datetime',
        ];
    }

    public function duel(): BelongsTo
    {
        return $this->belongsTo(Duel::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /**
     * The run facts in the shape App\Support\DuelRules::resolve expects.
     *
     * @return array<string, int>
     */
    public function toRunArray(): array
    {
        return [
            'duration_seconds' => (int) $this->duration_seconds,
            'exercises_completed' => (int) $this->exercises_completed,
            'sets_completed' => (int) $this->sets_completed,
            'valid_reps' => (int) $this->valid_reps,
            'consistency' => (int) $this->consistency,
            'penalties' => (int) $this->penalties,
        ];
    }
}
