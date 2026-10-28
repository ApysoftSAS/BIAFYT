<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class WorkoutExercise extends Model
{
    /**
     * The attributes that are mass assignable.
     *
     * @var list<string>
     */
    protected $fillable = [
        'workout_id',
        'exercise_id',
        'program_exercise_id',
        'position',
    ];

    /**
     * Get the workout this exercise belongs to.
     */
    public function workout(): BelongsTo
    {
        return $this->belongsTo(Workout::class);
    }

    /**
     * Get the catalog exercise performed here.
     */
    public function exercise(): BelongsTo
    {
        return $this->belongsTo(Exercise::class);
    }

    /**
     * Get the program exercise this was generated from, if any.
     */
    public function programExercise(): BelongsTo
    {
        return $this->belongsTo(ProgramExercise::class);
    }

    /**
     * Get the sets performed for this exercise, ordered by set_number.
     */
    public function performances(): HasMany
    {
        return $this->hasMany(ExercisePerformance::class)->orderBy('set_number');
    }
}
