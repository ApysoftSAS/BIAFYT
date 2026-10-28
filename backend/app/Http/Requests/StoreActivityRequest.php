<?php

namespace App\Http\Requests;

use App\Models\Activity;
use Carbon\Carbon;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

class StoreActivityRequest extends FormRequest
{
    /**
     * The activity always belongs to the authenticated user, so there is no
     * ownership check to perform here; the `auth:sanctum` route middleware
     * already guarantees a user is authenticated.
     */
    public function authorize(): bool
    {
        return true;
    }

    /**
     * Only the facts of the session. Points (`amount`/`activity_points`/
     * `competitive_points`) and `user_id` are never accepted from the
     * client: they are not listed here, so `validated()` drops them and the
     * controller derives / resolves them.
     *
     * @return array<string, array<int, mixed>>
     */
    public function rules(): array
    {
        return [
            'workout_id' => ['nullable', 'integer'],
            // Stable client-generated session id for safe retries (roadmap
            // 3c). Optional: absent keeps the current behaviour. Uniqueness
            // is enforced per user at the DB level, not here.
            'client_uid' => ['nullable', 'string', 'max:64'],
            'routine_label' => ['nullable', 'string', 'max:255'],
            'started_at' => ['required', 'date'],
            'finished_at' => ['required', 'date'],
            'duration_seconds' => ['required', 'integer', 'min:0'],
            'sets_completed' => ['required', 'integer', 'min:0'],
            'exercises_completed' => ['required', 'integer', 'min:0'],
            'streak' => ['nullable', 'integer', 'min:0'],
        ];
    }

    /**
     * Cross-field checks not expressible declaratively:
     * - `finished_at` must not be earlier than `started_at`.
     * - When `workout_id` is given it must belong to the authenticated user
     *   (generic 422, never 404 — this is a body field, not the route
     *   resource), be finished, and not already have an Activity.
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

            $workoutId = $this->input('workout_id');

            if ($workoutId !== null && is_numeric($workoutId)) {
                $workout = $this->user()->workouts()->find($workoutId);

                if (! $workout) {
                    $validator->errors()->add('workout_id', 'This workout does not exist or does not belong to you.');
                } elseif ($workout->finished_at === null) {
                    $validator->errors()->add('workout_id', 'This workout is not finished yet.');
                } elseif (Activity::where('workout_id', $workout->id)->exists()) {
                    $validator->errors()->add('workout_id', 'This workout already has an activity.');
                }
            }
        });
    }
}
