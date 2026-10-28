<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

class StoreProgramRequest extends FormRequest
{
    /**
     * The program always belongs to the authenticated user, so there is no
     * ownership check to perform here; the `auth:sanctum` route middleware
     * already guarantees a user is authenticated.
     */
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, array<int, string>>
     */
    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:255'],
            // Optional "train at this gym" context. Existence is checked
            // here; the caller (controller) enforces who may reference which
            // gym and whether the exercises fit that gym's inventory.
            'reference_gym_id' => ['sometimes', 'nullable', 'integer', 'exists:gyms,id'],
            'days' => ['sometimes', 'array'],
            'days.*.name' => ['required', 'string', 'max:255'],
            'days.*.position' => ['sometimes', 'integer', 'min:1'],
            'days.*.exercises' => ['sometimes', 'array'],
            'days.*.exercises.*.exercise_id' => ['required', 'integer', 'exists:exercises,id'],
            'days.*.exercises.*.position' => ['sometimes', 'integer', 'min:1'],
        ];
    }

    /**
     * Reject explicit duplicate `position` values within the same `days`
     * array, and within the same day's `exercises` array. This is not
     * expressible declaratively with the rules above, since it depends on
     * comparing sibling values within the same array rather than validating
     * each value in isolation.
     */
    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $validator) {
            $days = $this->input('days');

            if (! is_array($days)) {
                return;
            }

            $dayPositions = [];

            foreach ($days as $dayIndex => $day) {
                if (is_array($day) && array_key_exists('position', $day)) {
                    $dayPositions[] = $day['position'];
                }

                $exercises = is_array($day) ? ($day['exercises'] ?? null) : null;

                if (! is_array($exercises)) {
                    continue;
                }

                $exercisePositions = [];

                foreach ($exercises as $exercise) {
                    if (is_array($exercise) && array_key_exists('position', $exercise)) {
                        $exercisePositions[] = $exercise['position'];
                    }
                }

                if (count($exercisePositions) !== count(array_unique($exercisePositions))) {
                    $validator->errors()->add(
                        "days.{$dayIndex}.exercises",
                        'Duplicate position values are not allowed within the same day.'
                    );
                }
            }

            if (count($dayPositions) !== count(array_unique($dayPositions))) {
                $validator->errors()->add('days', 'Duplicate position values are not allowed within days.');
            }
        });
    }
}
