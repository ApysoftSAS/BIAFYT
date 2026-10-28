<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ProgramExercise extends Model
{
    /**
     * The attributes that are mass assignable.
     *
     * @var list<string>
     */
    protected $fillable = [
        'program_day_id',
        'exercise_id',
        'position',
    ];

    /**
     * Get the program day this exercise belongs to.
     */
    public function programDay(): BelongsTo
    {
        return $this->belongsTo(ProgramDay::class);
    }

    /**
     * Get the catalog exercise prescribed here.
     */
    public function exercise(): BelongsTo
    {
        return $this->belongsTo(Exercise::class);
    }
}
