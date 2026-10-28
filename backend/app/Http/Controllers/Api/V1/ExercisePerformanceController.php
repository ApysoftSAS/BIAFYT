<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\ExercisePerformance;
use App\Models\WorkoutExercise;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

class ExercisePerformanceController extends Controller
{
    /**
     * Add a performed set to a workout exercise owned by the authenticated
     * user, only while the parent workout is still open. If `set_number` is
     * omitted, it is assigned as MAX(set_number) + 1 within the exercise.
     */
    public function store(Request $request, int $workoutExercise): JsonResponse
    {
        $exercise = WorkoutExercise::whereHas('workout', fn ($query) => $query->where('user_id', $request->user()->id))
            ->findOrFail($workoutExercise);

        if ($exercise->workout->finished_at !== null) {
            abort(409, 'This workout is already finished and can no longer be modified.');
        }

        $validated = $request->validate([
            'set_number' => ['sometimes', 'integer', 'min:1'],
            'reps' => ['nullable', 'integer', 'min:0'],
            'load' => ['nullable', 'numeric', 'min:0'],
            'duration_seconds' => ['nullable', 'integer', 'min:0'],
            'rpe' => ['nullable', 'numeric', 'between:0,10'],
        ]);

        $setNumber = $validated['set_number']
            ?? ((int) (ExercisePerformance::where('workout_exercise_id', $exercise->id)->max('set_number') ?? 0) + 1);

        $conflict = ExercisePerformance::where('workout_exercise_id', $exercise->id)
            ->where('set_number', $setNumber)
            ->exists();

        if ($conflict) {
            throw ValidationException::withMessages([
                'set_number' => ['This set_number is already used by another performance for this exercise.'],
            ]);
        }

        $performance = $exercise->performances()->create([
            'set_number' => $setNumber,
            'reps' => $validated['reps'] ?? null,
            'load' => $validated['load'] ?? null,
            'duration_seconds' => $validated['duration_seconds'] ?? null,
            'rpe' => $validated['rpe'] ?? null,
        ]);

        return response()->json([
            'exercise_performance' => $this->mapPerformance($performance),
        ], 201);
    }

    /**
     * Update a performed set belonging to a workout exercise owned by the
     * authenticated user, only while the parent workout is still open.
     * Always 404 (never 403) when the performance does not exist or belongs
     * to another user's workout.
     */
    public function update(Request $request, int $exercisePerformance): JsonResponse
    {
        $performance = ExercisePerformance::whereHas(
            'workoutExercise.workout',
            fn ($query) => $query->where('user_id', $request->user()->id)
        )->findOrFail($exercisePerformance);

        if ($performance->workoutExercise->workout->finished_at !== null) {
            abort(409, 'This workout is already finished and can no longer be modified.');
        }

        $validated = $request->validate([
            'set_number' => ['sometimes', 'integer', 'min:1'],
            'reps' => ['sometimes', 'nullable', 'integer', 'min:0'],
            'load' => ['sometimes', 'nullable', 'numeric', 'min:0'],
            'duration_seconds' => ['sometimes', 'nullable', 'integer', 'min:0'],
            'rpe' => ['sometimes', 'nullable', 'numeric', 'between:0,10'],
        ]);

        if (array_key_exists('set_number', $validated)) {
            $conflict = ExercisePerformance::where('workout_exercise_id', $performance->workout_exercise_id)
                ->where('set_number', $validated['set_number'])
                ->where('id', '!=', $performance->id)
                ->exists();

            if ($conflict) {
                throw ValidationException::withMessages([
                    'set_number' => ['This set_number is already used by another performance for this exercise.'],
                ]);
            }
        }

        $performance->fill($validated)->save();

        return response()->json([
            'exercise_performance' => $this->mapPerformance($performance),
        ]);
    }

    /**
     * Delete a performed set belonging to a workout exercise owned by the
     * authenticated user, only while the parent workout is still open.
     */
    public function destroy(Request $request, int $exercisePerformance): JsonResponse
    {
        $performance = ExercisePerformance::whereHas(
            'workoutExercise.workout',
            fn ($query) => $query->where('user_id', $request->user()->id)
        )->findOrFail($exercisePerformance);

        if ($performance->workoutExercise->workout->finished_at !== null) {
            abort(409, 'This workout is already finished and can no longer be modified.');
        }

        $performance->delete();

        return response()->json(null, 204);
    }

    /**
     * @return array<string, mixed>
     */
    private function mapPerformance(ExercisePerformance $performance): array
    {
        return [
            'id' => $performance->id,
            'set_number' => $performance->set_number,
            'reps' => $performance->reps,
            'load' => $performance->load !== null ? (float) $performance->load : null,
            'duration_seconds' => $performance->duration_seconds,
            'rpe' => $performance->rpe !== null ? (float) $performance->rpe : null,
        ];
    }
}
