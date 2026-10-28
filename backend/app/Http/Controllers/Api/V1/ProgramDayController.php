<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\ProgramDay;
use App\Models\ProgramExercise;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

class ProgramDayController extends Controller
{
    /**
     * Add a day to a program owned by the authenticated user. If `position`
     * is omitted, it is assigned as MAX(position) + 1 within the program
     * (1 if the program has no days yet).
     */
    public function store(Request $request, int $program): JsonResponse
    {
        $program = $request->user()->programs()->findOrFail($program);

        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'position' => ['sometimes', 'integer', 'min:1'],
        ]);

        $position = $validated['position']
            ?? ((int) (ProgramDay::where('program_id', $program->id)->max('position') ?? 0) + 1);

        $conflict = ProgramDay::where('program_id', $program->id)
            ->where('position', $position)
            ->exists();

        if ($conflict) {
            throw ValidationException::withMessages([
                'position' => ['This position is already used by another day in this program.'],
            ]);
        }

        $day = $program->days()->create([
            'name' => $validated['name'],
            'position' => $position,
        ]);

        return response()->json([
            'program_day' => $this->mapDay($day),
        ], 201);
    }

    /**
     * Update a day belonging to a program owned by the authenticated user.
     * Always 404 (never 403) when the day does not exist or belongs to
     * another user's program.
     */
    public function update(Request $request, int $programDay): JsonResponse
    {
        $day = ProgramDay::whereHas('program', fn ($query) => $query->where('user_id', $request->user()->id))
            ->findOrFail($programDay);

        $validated = $request->validate([
            'name' => ['sometimes', 'string', 'max:255'],
            'position' => ['sometimes', 'integer', 'min:1'],
        ]);

        if (array_key_exists('position', $validated)) {
            $conflict = ProgramDay::where('program_id', $day->program_id)
                ->where('position', $validated['position'])
                ->where('id', '!=', $day->id)
                ->exists();

            if ($conflict) {
                throw ValidationException::withMessages([
                    'position' => ['This position is already used by another day in this program.'],
                ]);
            }
        }

        $day->fill($validated)->save();

        return response()->json([
            'program_day' => $this->mapDay($day->load('exercises.exercise')),
        ]);
    }

    /**
     * Delete a day belonging to a program owned by the authenticated user.
     * Cascades to its exercises at the database level.
     */
    public function destroy(Request $request, int $programDay): JsonResponse
    {
        $day = ProgramDay::whereHas('program', fn ($query) => $query->where('user_id', $request->user()->id))
            ->findOrFail($programDay);

        $day->delete();

        return response()->json(null, 204);
    }

    /**
     * @return array<string, mixed>
     */
    private function mapDay(ProgramDay $day): array
    {
        return [
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
        ];
    }
}
