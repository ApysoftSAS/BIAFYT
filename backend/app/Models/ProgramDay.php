<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ProgramDay extends Model
{
    /**
     * The attributes that are mass assignable.
     *
     * @var list<string>
     */
    protected $fillable = [
        'program_id',
        'name',
        'position',
    ];

    /**
     * Get the program this day belongs to.
     */
    public function program(): BelongsTo
    {
        return $this->belongsTo(Program::class);
    }

    /**
     * Get the exercises prescribed for this day, ordered by position.
     */
    public function exercises(): HasMany
    {
        return $this->hasMany(ProgramExercise::class)->orderBy('position');
    }
}
