<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\ExercisePerformance;
use App\Models\ProgramExercise;
use App\Models\Workout;
use App\Models\WorkoutExercise;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

class WorkoutExerciseController extends Controller
{
    /**
     * Add an exercise to a workout owned by the authenticated user, only
     * while the workout is still open. If `position` is omitted, it is
     * assigned as MAX(position) + 1 within the workout.
     */
    public function store(Request $request, int $workout): JsonResponse
    {
        $workout = $request->user()->workouts()->findOrFail($workout);

        if ($workout->finished_at !== null) {
            abort(409, 'This workout is already finished and can no longer be modified.');
        }

        $validated = $request->validate([
            'exercise_id' => ['required', 'integer', 'exists:exercises,id'],
            'program_exercise_id' => ['nullable', 'integer'],
            'position' => ['sometimes', 'integer', 'min:1'],
        ]);

        $this->validateProgramExerciseConsistency(
            $request,
            $workout,
            $validated['program_exercise_id'] ?? null,
            $validated['exercise_id']
        );

        $position = $validated['position']
            ?? ((int) (WorkoutExercise::where('workout_id', $workout->id)->max('position') ?? 0) + 1);

        $conflict = WorkoutExercise::where('workout_id', $workout->id)
            ->where('position', $position)
            ->exists();

        if ($conflict) {
            throw ValidationException::withMessages([
                'position' => ['This position is already used by another exercise in this workout.'],
            ]);
        }

        $workoutExercise = $workout->workoutExercises()->create([
            'exercise_id' => $validated['exercise_id'],
            'program_exercise_id' => $validated['program_exercise_id'] ?? null,
            'position' => $position,
        ]);

        return response()->json([
            'workout_exercise' => $this->mapWorkoutExercise($workoutExercise->load('exercise', 'performances')),
        ], 201);
    }

    /**
     * Update an exercise belonging to a workout owned by the authenticated
     * user, only while the workout is still open. Always 404 (never 403)
     * when the exercise does not exist or belongs to another user's
     * workout.
     */
    public function update(Request $request, int $workoutExercise): JsonResponse
    {
        $exercise = WorkoutExercise::whereHas('workout', fn ($query) => $query->where('user_id', $request->user()->id))
            ->findOrFail($workoutExercise);

        $workout = $exercise->workout;

        if ($workout->finished_at !== null) {
            abort(409, 'This workout is already finished and can no longer be modified.');
        }

        $validated = $request->validate([
            'exercise_id' => ['sometimes', 'integer', 'exists:exercises,id'],
            'program_exercise_id' => ['sometimes', 'nullable', 'integer'],
            'position' => ['sometimes', 'integer', 'min:1'],
        ]);

        $effectiveProgramExerciseId = array_key_exists('program_exercise_id', $validated)
            ? $validated['program_exercise_id']
            : $exercise->program_exercise_id;
        $effectiveExerciseId = $validated['exercise_id'] ?? $exercise->exercise_id;

        $this->validateProgramExerciseConsistency($request, $workout, $effectiveProgramExerciseId, $effectiveExerciseId);

        if (array_key_exists('position', $validated)) {
            $conflict = WorkoutExercise::where('workout_id', $exercise->workout_id)
                ->where('position', $validated['position'])
                ->where('id', '!=', $exercise->id)
                ->exists();

            if ($conflict) {
                throw ValidationException::withMessages([
                    'position' => ['This position is already used by another exercise in this workout.'],
                ]);
            }
        }

        $exercise->fill($validated)->save();

        return response()->json([
            'workout_exercise' => $this->mapWorkoutExercise($exercise->load('exercise', 'performances')),
        ]);
    }

    /**
     * Delete an exercise belonging to a workout owned by the authenticated
     * user, only while the workout is still open. Cascades to its
     * performances at the database level.
     */
    public function destroy(Request $request, int $workoutExercise): JsonResponse
    {
        $exercise = WorkoutExercise::whereHas('workout', fn ($query) => $query->where('user_id', $request->user()->id))
            ->findOrFail($workoutExercise);

        if ($exercise->workout->finished_at !== null) {
            abort(409, 'This workout is already finished and can no longer be modified.');
        }

        $exercise->delete();

        return response()->json(null, 204);
    }

    /**
     * Validate the standalone-workout consistency rule and, when the
     * workout is tied to a program day, that `program_exercise_id` belongs
     * to the authenticated user, belongs to that exact program day, and
     * that its catalog `exercise_id` matches the one sent by the client.
     * `program_exercise_id` here is a body field, not the route resource,
     * so any violation is a generic 422, never a 404.
     */
    private function validateProgramExerciseConsistency(
        Request $request,
        Workout $workout,
        ?int $programExerciseId,
        int $exerciseId
    ): void {
        if ($programExerciseId === null) {
            return;
        }

        if ($workout->program_day_id === null) {
            throw ValidationException::withMessages([
                'program_exercise_id' => ['A standalone workout (without program_day_id) cannot reference a program_exercise_id.'],
            ]);
        }

        $programExercise = ProgramExercise::whereHas(
            'programDay.program',
            fn ($query) => $query->where('user_id', $request->user()->id)
        )->find($programExerciseId);

        if (! $programExercise) {
            throw ValidationException::withMessages([
                'program_exercise_id' => ['This program exercise does not exist or does not belong to you.'],
            ]);
        }

        if ((int) $programExercise->program_day_id !== (int) $workout->program_day_id) {
            throw ValidationException::withMessages([
                'program_exercise_id' => ['This program exercise does not belong to the indicated program day.'],
            ]);
        }

        if ((int) $programExercise->exercise_id !== $exerciseId) {
            throw ValidationException::withMessages([
                'exercise_id' => ['exercise_id does not match the referenced program_exercise.'],
            ]);
        }
    }

    /**
     * @return array<string, mixed>
     */
    private function mapWorkoutExercise(WorkoutExercise $exercise): array
    {
        return [
            'id' => $exercise->id,
            'exercise_id' => $exercise->exercise_id,
            'program_exercise_id' => $exercise->program_exercise_id,
            'position' => $exercise->position,
            'exercise' => [
                'id' => $exercise->exercise->id,
                'slug' => $exercise->exercise->slug,
                'name' => $exercise->exercise->name,
                'type' => $exercise->exercise->type,
                'machine_id' => $exercise->exercise->machine_id,
            ],
            'performances' => $exercise->performances->map(fn (ExercisePerformance $performance) => [
                'id' => $performance->id,
                'set_number' => $performance->set_number,
                'reps' => $performance->reps,
                'load' => $performance->load !== null ? (float) $performance->load : null,
                'duration_seconds' => $performance->duration_seconds,
                'rpe' => $performance->rpe !== null ? (float) $performance->rpe : null,
            ])->values(),
        ];
    }
}
