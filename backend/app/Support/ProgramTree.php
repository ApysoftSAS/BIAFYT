<?php

namespace App\Support;

use App\Models\Program;
use App\Models\ProgramDay;
use App\Models\ProgramExercise;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Shared create + serialize logic for a Program and its day/exercise tree.
 *
 * Used by both `ProgramController` (the athlete building their own program)
 * and `CoachAthleteController` (a coach building a program for a related
 * athlete). The two entry points differ only in ownership and authorship —
 * the tree-building, the position-conflict handling and the response shape
 * are identical and live here so they cannot drift apart.
 */
class ProgramTree
{
    /**
     * Create a program for `$owner`, optionally with a full tree of days and
     * exercises, atomically. `$attributes` may carry `name` (required),
     * `reference_gym_id` and `created_by_user_id`.
     *
     * Position conflicts inside the payload raise a ValidationException with
     * the same `days.{i}.position` / `days.{i}.exercises.{j}.position` keys
     * the endpoints have always used — never a 500, nothing persisted.
     *
     * @param  array<string, mixed>  $attributes
     * @param  array<int, array<string, mixed>>  $days
     */
    public static function create(User $owner, array $attributes, array $days = []): Program
    {
        return DB::transaction(function () use ($owner, $attributes, $days) {
            $program = $owner->programs()->create([
                'name' => $attributes['name'],
                'reference_gym_id' => $attributes['reference_gym_id'] ?? null,
                'created_by_user_id' => $attributes['created_by_user_id'] ?? null,
            ]);

            self::attachDays($program, $days);

            return $program;
        });
    }

    /**
     * Create the day/exercise tree under an existing program. Assumes it
     * runs inside a transaction (the callers wrap it). Position conflicts
     * raise the same keyed ValidationException as before.
     *
     * @param  array<int, array<string, mixed>>  $days
     */
    public static function attachDays(Program $program, array $days): void
    {
        foreach ($days as $dayIndex => $dayData) {
            $dayPosition = $dayData['position'] ?? self::nextDayPosition($program->id);

            if (ProgramDay::where('program_id', $program->id)->where('position', $dayPosition)->exists()) {
                throw ValidationException::withMessages([
                    "days.{$dayIndex}.position" => ['This position is already used by another day in this program.'],
                ]);
            }

            $day = $program->days()->create([
                'name' => $dayData['name'],
                'position' => $dayPosition,
            ]);

            foreach ($dayData['exercises'] ?? [] as $exerciseIndex => $exerciseData) {
                $exercisePosition = $exerciseData['position'] ?? self::nextExercisePosition($day->id);

                if (ProgramExercise::where('program_day_id', $day->id)->where('position', $exercisePosition)->exists()) {
                    throw ValidationException::withMessages([
                        "days.{$dayIndex}.exercises.{$exerciseIndex}.position" => ['This position is already used by another exercise in this day.'],
                    ]);
                }

                $day->exercises()->create([
                    'exercise_id' => $exerciseData['exercise_id'],
                    'position' => $exercisePosition,
                ]);
            }
        }
    }

    /**
     * Serialize a program (with its days/exercises eager-loaded) to the API
     * shape. Adds `reference_gym` and `created_by` to the historical shape;
     * both are `null` for a plain self-authored program with no gym context,
     * so existing consumers are unaffected.
     *
     * @return array<string, mixed>
     */
    public static function map(Program $program): array
    {
        $program->loadMissing(['days.exercises.exercise', 'referenceGym', 'createdBy']);

        return [
            'id' => $program->id,
            'name' => $program->name,
            'reference_gym' => $program->referenceGym
                ? ['id' => $program->referenceGym->id, 'name' => $program->referenceGym->name]
                : null,
            'created_by' => $program->createdBy
                ? ['id' => $program->createdBy->id, 'name' => $program->createdBy->name]
                : null,
            // When the athlete copied a coach-authored program into their own
            // local routines (roadmap: coach-routine import). NULL = not yet;
            // the athlete's app filters `created_by && !imported_at` for the
            // "from my coach" tray.
            'imported_at' => $program->imported_at,
            'days' => $program->days->map(fn (ProgramDay $day) => [
                'id' => $day->id,
                'name' => $day->name,
                'position' => $day->position,
                'exercises' => $day->exercises->map(fn (ProgramExercise $exercise) => [
                    'id' => $exercise->id,
                    'position' => $exercise->position,
                    'exercise' => [
                        'id' => $exercise->exercise->id,
                        'slug' => $exercise->exercise->slug,
                        'name' => $exercise->exercise->name,
                        'type' => $exercise->exercise->type,
                        'machine_id' => $exercise->exercise->machine_id,
                    ],
                ])->values(),
            ])->values(),
        ];
    }

    private static function nextDayPosition(int $programId): int
    {
        return (int) (ProgramDay::where('program_id', $programId)->max('position') ?? 0) + 1;
    }

    private static function nextExercisePosition(int $programDayId): int
    {
        return (int) (ProgramExercise::where('program_day_id', $programDayId)->max('position') ?? 0) + 1;
    }
}
