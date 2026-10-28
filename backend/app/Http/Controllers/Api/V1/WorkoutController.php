<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreWorkoutRequest;
use App\Models\ExercisePerformance;
use App\Models\Workout;
use App\Models\WorkoutExercise;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class WorkoutController extends Controller
{
    /**
     * Return the authenticated user's workouts, with their exercises and
     * performances nested inside. Not paginated in this phase.
     */
    public function index(Request $request): JsonResponse
    {
        $workouts = $request->user()->workouts()
            ->with('workoutExercises.exercise', 'workoutExercises.performances')
            ->orderByDesc('started_at')
            ->get()
            ->map(fn (Workout $workout) => $this->mapWorkout($workout))
            ->values();

        return response()->json([
            'workouts' => $workouts,
        ]);
    }

    /**
     * Create a workout for the authenticated user, optionally with a full
     * tree of exercises and performances in a single request. The whole
     * tree is created atomically: if any part fails, nothing is persisted.
     */
    public function store(StoreWorkoutRequest $request): JsonResponse
    {
        $validated = $request->validated();

        $workout = DB::transaction(function () use ($request, $validated) {
            $workout = $request->user()->workouts()->create([
                'program_day_id' => $validated['program_day_id'] ?? null,
                'started_at' => $validated['started_at'],
                'finished_at' => $validated['finished_at'] ?? null,
            ]);

            foreach ($validated['exercises'] ?? [] as $exerciseIndex => $exerciseData) {
                $position = $exerciseData['position'] ?? $this->nextExercisePosition($workout->id);

                $exerciseConflict = WorkoutExercise::where('workout_id', $workout->id)
                    ->where('position', $position)
                    ->exists();

                if ($exerciseConflict) {
                    throw ValidationException::withMessages([
                        "exercises.{$exerciseIndex}.position" => ['This position is already used by another exercise in this workout.'],
                    ]);
                }

                $workoutExercise = $workout->workoutExercises()->create([
                    'exercise_id' => $exerciseData['exercise_id'],
                    'program_exercise_id' => $exerciseData['program_exercise_id'] ?? null,
                    'position' => $position,
                ]);

                // `performances.*.set_number` has no unconditional `required` rule, so
                // `$request->validated()` reorders this array (matched-rule entries
                // first). Iterate over the raw input instead, which preserves the
                // client's original order, and use it only to index into the already
                // validated/casted values below.
                $rawPerformances = $request->input("exercises.{$exerciseIndex}.performances", []);
                $validatedPerformances = $exerciseData['performances'] ?? [];

                foreach ($rawPerformances as $performanceIndex => $rawPerformanceData) {
                    $performanceData = $validatedPerformances[$performanceIndex] ?? [];
                    $setNumber = $performanceData['set_number'] ?? $this->nextSetNumber($workoutExercise->id);

                    $setConflict = ExercisePerformance::where('workout_exercise_id', $workoutExercise->id)
                        ->where('set_number', $setNumber)
                        ->exists();

                    if ($setConflict) {
                        throw ValidationException::withMessages([
                            "exercises.{$exerciseIndex}.performances.{$performanceIndex}.set_number" => ['This set_number is already used by another performance for this exercise.'],
                        ]);
                    }

                    $workoutExercise->performances()->create([
                        'set_number' => $setNumber,
                        'reps' => $performanceData['reps'] ?? null,
                        'load' => $performanceData['load'] ?? null,
                        'duration_seconds' => $performanceData['duration_seconds'] ?? null,
                        'rpe' => $performanceData['rpe'] ?? null,
                    ]);
                }
            }

            return $workout;
        });

        $workout->load('workoutExercises.exercise', 'workoutExercises.performances');

        return response()->json([
            'workout' => $this->mapWorkout($workout),
        ], 201);
    }

    /**
     * Return a single workout owned by the authenticated user. Always 404
     * (never 403) when the workout does not exist or belongs to another
     * user, so as not to reveal the distinction.
     */
    public function show(Request $request, int $workout): JsonResponse
    {
        $workout = $request->user()->workouts()
            ->with('workoutExercises.exercise', 'workoutExercises.performances')
            ->findOrFail($workout);

        return response()->json([
            'workout' => $this->mapWorkout($workout),
        ]);
    }

    /**
     * Update `started_at`/`finished_at` on the authenticated user's workout.
     * Once a workout is finished, it becomes immutable: this always 409s
     * before touching the payload, and there is no way to reopen it.
     */
    public function update(Request $request, int $workout): JsonResponse
    {
        $workout = $request->user()->workouts()->findOrFail($workout);

        if ($workout->finished_at !== null) {
            abort(409, 'This workout is already finished and can no longer be modified.');
        }

        $validated = $request->validate([
            'started_at' => ['sometimes', 'date'],
            'finished_at' => ['sometimes', 'nullable', 'date'],
        ]);

        if (array_key_exists('finished_at', $validated) && $validated['finished_at'] !== null) {
            $startedAt = Carbon::parse($validated['started_at'] ?? $workout->started_at);
            $finishedAt = Carbon::parse($validated['finished_at']);

            if ($finishedAt->lt($startedAt)) {
                throw ValidationException::withMessages([
                    'finished_at' => ['finished_at must not be earlier than started_at.'],
                ]);
            }
        }

        $workout->fill($validated)->save();
        $workout->load('workoutExercises.exercise', 'workoutExercises.performances');

        return response()->json([
            'workout' => $this->mapWorkout($workout),
        ]);
    }

    /**
     * Delete the authenticated user's workout, only while it is still open.
     * Cascades to its exercises and performances at the database level; the
     * referenced catalog Exercises are never touched.
     */
    public function destroy(Request $request, int $workout): JsonResponse
    {
        $workout = $request->user()->workouts()->findOrFail($workout);

        if ($workout->finished_at !== null) {
            abort(409, 'This workout is already finished and can no longer be modified.');
        }

        $workout->delete();

        return response()->json(null, 204);
    }

    private function nextExercisePosition(int $workoutId): int
    {
        return (int) (WorkoutExercise::where('workout_id', $workoutId)->max('position') ?? 0) + 1;
    }

    private function nextSetNumber(int $workoutExerciseId): int
    {
        return (int) (ExercisePerformance::where('workout_exercise_id', $workoutExerciseId)->max('set_number') ?? 0) + 1;
    }

    /**
     * @return array<string, mixed>
     */
    private function mapWorkout(Workout $workout): array
    {
        return [
            'id' => $workout->id,
            'program_day_id' => $workout->program_day_id,
            'started_at' => $workout->started_at,
            'finished_at' => $workout->finished_at,
            'exercises' => $workout->workoutExercises->map(fn (WorkoutExercise $exercise) => [
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
            ])->values(),
        ];
    }
}
