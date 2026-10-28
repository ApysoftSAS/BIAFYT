<?php

namespace App\Http\Requests;

use App\Models\ProgramDay;
use App\Models\ProgramExercise;
use Carbon\Carbon;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

class StoreWorkoutRequest extends FormRequest
{
    /**
     * The workout always belongs to the authenticated user, so there is no
     * ownership check to perform here; the `auth:sanctum` route middleware
     * already guarantees a user is authenticated.
     */
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, array<int, mixed>>
     */
    public function rules(): array
    {
        return [
            'program_day_id' => ['nullable', 'integer'],
            'started_at' => ['required', 'date'],
            'finished_at' => ['sometimes', 'nullable', 'date'],
            'exercises' => ['sometimes', 'array'],
            'exercises.*.exercise_id' => ['required', 'integer', 'exists:exercises,id'],
            'exercises.*.program_exercise_id' => ['nullable', 'integer'],
            'exercises.*.position' => ['sometimes', 'integer', 'min:1'],
            'exercises.*.performances' => ['sometimes', 'array'],
            'exercises.*.performances.*.set_number' => ['sometimes', 'integer', 'min:1'],
            'exercises.*.performances.*.reps' => ['nullable', 'integer', 'min:0'],
            'exercises.*.performances.*.load' => ['nullable', 'numeric', 'min:0'],
            'exercises.*.performances.*.duration_seconds' => ['nullable', 'integer', 'min:0'],
            'exercises.*.performances.*.rpe' => ['nullable', 'numeric', 'between:0,10'],
        ];
    }

    /**
     * Cross-field checks that are not expressible declaratively with the
     * rules above:
     * - `program_day_id` must belong to the authenticated user (generic 422,
     *   never 404 — this is a body field, not the route resource).
     * - Duplicate explicit `position`/`set_number` values within the same
     *   nested array.
     * - The standalone-workout consistency rule: if `program_day_id` is
     *   null, no exercise may carry a `program_exercise_id`.
     * - If `program_day_id` is set, every `program_exercise_id` must belong
     *   to the authenticated user, belong to that exact program day, and its
     *   catalog `exercise_id` must match the one sent in the payload.
     */
    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $validator) {
            $startedAt = $this->input('started_at');
            $finishedAt = $this->input('finished_at');

            if (is_string($startedAt) && is_string($finishedAt)) {
                try {
                    if (Carbon::parse($finishedAt)->lt(Carbon::parse($startedAt))) {
                        $validator->errors()->add('finished_at', 'finished_at must not be earlier than started_at.');
                    }
                } catch (\Exception) {
                    // Malformed dates are already reported by the `date` rule above.
                }
            }

            $programDayId = $this->input('program_day_id');

            if ($programDayId !== null) {
                $ownsDay = ProgramDay::whereHas('program', fn ($query) => $query->where('user_id', $this->user()->id))
                    ->whereKey($programDayId)
                    ->exists();

                if (! $ownsDay) {
                    $validator->errors()->add('program_day_id', 'This program day does not exist or does not belong to you.');
                }
            }

            $exercises = $this->input('exercises');

            if (is_array($exercises)) {
                $positions = [];

                foreach ($exercises as $exerciseIndex => $exerciseData) {
                    if (! is_array($exerciseData)) {
                        continue;
                    }

                    if (array_key_exists('position', $exerciseData)) {
                        $positions[] = $exerciseData['position'];
                    }

                    $performances = $exerciseData['performances'] ?? null;

                    if (is_array($performances)) {
                        $setNumbers = [];

                        foreach ($performances as $performance) {
                            if (is_array($performance) && array_key_exists('set_number', $performance)) {
                                $setNumbers[] = $performance['set_number'];
                            }
                        }

                        if (count($setNumbers) !== count(array_unique($setNumbers))) {
                            $validator->errors()->add(
                                "exercises.{$exerciseIndex}.performances",
                                'Duplicate set_number values are not allowed within the same exercise.'
                            );
                        }
                    }

                    $this->validateProgramExerciseConsistency($validator, $exerciseIndex, $exerciseData, $programDayId);
                }

                if (count($positions) !== count(array_unique($positions))) {
                    $validator->errors()->add('exercises', 'Duplicate position values are not allowed within the same workout.');
                }
            }
        });
    }

    /**
     * Validate a single `exercises.*` entry's `program_exercise_id` against
     * the standalone-workout rule and, when a program day is set, ownership
     * + day-membership + exercise_id match.
     *
     * @param  array<string, mixed>  $exerciseData
     */
    private function validateProgramExerciseConsistency(
        Validator $validator,
        int|string $exerciseIndex,
        array $exerciseData,
        mixed $programDayId
    ): void {
        $programExerciseId = $exerciseData['program_exercise_id'] ?? null;

        if ($programExerciseId === null) {
            return;
        }

        if ($programDayId === null) {
            $validator->errors()->add(
                "exercises.{$exerciseIndex}.program_exercise_id",
                'A standalone workout (without program_day_id) cannot reference a program_exercise_id.'
            );

            return;
        }

        $programExercise = ProgramExercise::whereHas(
            'programDay.program',
            fn ($query) => $query->where('user_id', $this->user()->id)
        )->find($programExerciseId);

        if (! $programExercise) {
            $validator->errors()->add(
                "exercises.{$exerciseIndex}.program_exercise_id",
                'This program exercise does not exist or does not belong to you.'
            );

            return;
        }

        if ((int) $programExercise->program_day_id !== (int) $programDayId) {
            $validator->errors()->add(
                "exercises.{$exerciseIndex}.program_exercise_id",
                'This program exercise does not belong to the indicated program day.'
            );

            return;
        }

        $exerciseId = $exerciseData['exercise_id'] ?? null;

        if ($exerciseId !== null && (int) $programExercise->exercise_id !== (int) $exerciseId) {
            $validator->errors()->add(
                "exercises.{$exerciseIndex}.exercise_id",
                'exercise_id does not match the referenced program_exercise.'
            );
        }
    }
}
