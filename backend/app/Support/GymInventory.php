<?php

namespace App\Support;

use App\Models\Equipment;
use App\Models\Exercise;
use App\Models\GymEquipment;
use Illuminate\Validation\ValidationException;

/**
 * Validates that the exercises used by a program are compatible with the
 * program's optional reference gym.
 *
 * Rule (only applies when `reference_gym_id` is set):
 *   - An exercise whose catalog entry has a `machine_id` requires that
 *     equipment to be present AND available in the reference gym's
 *     inventory (`gym_equipment.available = true`).
 *   - An exercise with `machine_id = null` (bodyweight / free weight) is
 *     always allowed — no equipment dependency.
 *
 * Without a reference gym there is no restriction at all: the global
 * catalog is fully open (an independent athlete is never limited).
 */
class GymInventory
{
    /**
     * @param  array<int, array<string, mixed>>  $days  the validated `days`
     *                                                  payload (each with an `exercises` list of `{exercise_id, ...}`)
     *
     * @throws ValidationException keyed per offending exercise
     *                             (`days.{d}.exercises.{e}.exercise_id`)
     */
    public static function assertProgramExercisesAvailable(array $days, int $referenceGymId): void
    {
        $exerciseIds = [];

        foreach ($days as $day) {
            foreach ($day['exercises'] ?? [] as $exercise) {
                if (isset($exercise['exercise_id'])) {
                    $exerciseIds[] = (int) $exercise['exercise_id'];
                }
            }
        }

        if ($exerciseIds === []) {
            return;
        }

        $exercises = Exercise::whereIn('id', array_unique($exerciseIds))->get()->keyBy('id');

        $availableSlugs = Equipment::query()
            ->where('is_active', true)
            ->whereIn('id', GymEquipment::query()
                ->where('gym_id', $referenceGymId)
                ->where('available', true)
                ->select('equipment_id'))
            ->pluck('slug')
            ->flip();

        $errors = [];

        foreach ($days as $dayIndex => $day) {
            foreach ($day['exercises'] ?? [] as $exerciseIndex => $exercisePayload) {
                $exercise = $exercises->get((int) ($exercisePayload['exercise_id'] ?? 0));

                if ($exercise === null || $exercise->machine_id === null) {
                    continue;
                }

                if (! $availableSlugs->has($exercise->machine_id)) {
                    $machineName = Equipment::where('slug', $exercise->machine_id)->value('name') ?? $exercise->machine_id;
                    $errors["days.{$dayIndex}.exercises.{$exerciseIndex}.exercise_id"] =
                        ["«{$machineName}» no está disponible en el gimnasio de referencia."];
                }
            }
        }

        if ($errors !== []) {
            throw ValidationException::withMessages($errors);
        }
    }
}
