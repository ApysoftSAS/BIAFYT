<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\ProgramDay;
use App\Models\ProgramExercise;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

class ProgramExerciseController extends Controller
{
    /**
     * Add an exercise to a program day owned by the authenticated user. The
     * same exercise_id may appear more than once within the same day. If
     * `position` is omitted, it is assigned as MAX(position) + 1 within the
     * day (1 if the day has no exercises yet).
     */
    public function store(Request $request, int $programDay): JsonResponse
    {
        $day = ProgramDay::whereHas('program', fn ($query) => $query->where('user_id', $request->user()->id))
            ->findOrFail($programDay);

        $validated = $request->validate([
            'exercise_id' => ['required', 'integer', 'exists:exercises,id'],
            'position' => ['sometimes', 'integer', 'min:1'],
        ]);

        $position = $validated['position']
            ?? ((int) (ProgramExercise::where('program_day_id', $day->id)->max('position') ?? 0) + 1);

        $conflict = ProgramExercise::where('program_day_id', $day->id)
            ->where('position', $position)
            ->exists();

        if ($conflict) {
            throw ValidationException::withMessages([
                'position' => ['This position is already used by another exercise in this day.'],
            ]);
        }

        $exercise = $day->exercises()->create([
            'exercise_id' => $validated['exercise_id'],
            'position' => $position,
        ]);

        return response()->json([
            'program_exercise' => $this->mapExercise($exercise->load('exercise')),
        ], 201);
    }

    /**
     * Update an exercise belonging to a program day owned by the
     * authenticated user. Always 404 (never 403) when the exercise does not
     * exist or belongs to another user's program.
     */
    public function update(Request $request, int $programExercise): JsonResponse
    {
        $exercise = ProgramExercise::whereHas(
            'programDay.program',
            fn ($query) => $query->where('user_id', $request->user()->id)
        )->findOrFail($programExercise);

        $validated = $request->validate([
            'exercise_id' => ['sometimes', 'integer', 'exists:exercises,id'],
            'position' => ['sometimes', 'integer', 'min:1'],
        ]);

        if (array_key_exists('position', $validated)) {
            $conflict = ProgramExercise::where('program_day_id', $exercise->program_day_id)
                ->where('position', $validated['position'])
                ->where('id', '!=', $exercise->id)
                ->exists();

            if ($conflict) {
                throw ValidationException::withMessages([
                    'position' => ['This position is already used by another exercise in this day.'],
                ]);
            }
        }

        $exercise->fill($validated)->save();

        return response()->json([
            'program_exercise' => $this->mapExercise($exercise->load('exercise')),
        ]);
    }

    /**
     * Delete an exercise belonging to a program day owned by the
     * authenticated user.
     */
    public function destroy(Request $request, int $programExercise): JsonResponse
    {
        $exercise = ProgramExercise::whereHas(
            'programDay.program',
            fn ($query) => $query->where('user_id', $request->user()->id)
        )->findOrFail($programExercise);

        $exercise->delete();

        return response()->json(null, 204);
    }

    /**
     * @return array<string, mixed>
     */
    private function mapExercise(ProgramExercise $exercise): array
    {
        return [
            'id' => $exercise->id,
            'position' => $exercise->position,
            'exercise' => [
                'id' => $exercise->exercise->id,
                'slug' => $exercise->exercise->slug,
                'name' => $exercise->exercise->name,
                'type' => $exercise->exercise->type,
                'machine_id' => $exercise->exercise->machine_id,
            ],
        ];
    }
}
