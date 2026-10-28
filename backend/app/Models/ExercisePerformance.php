<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ExercisePerformance extends Model
{
    /**
     * The attributes that are mass assignable.
     *
     * @var list<string>
     */
    protected $fillable = [
        'workout_exercise_id',
        'set_number',
        'reps',
        'load',
        'duration_seconds',
        'rpe',
    ];

    /**
     * Get the workout exercise this performed set belongs to.
     */
    public function workoutExercise(): BelongsTo
    {
        return $this->belongsTo(WorkoutExercise::class);
    }
}
