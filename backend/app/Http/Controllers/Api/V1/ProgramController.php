<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreProgramRequest;
use App\Models\GymAssignment;
use App\Models\Program;
use App\Support\GymInventory;
use App\Support\ProgramTree;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

class ProgramController extends Controller
{
    /**
     * Return the authenticated user's programs, with their days and
     * exercises nested inside. This includes programs a coach created for
     * this user (`created_by` is non-null on those); the client tells them
     * apart by that field.
     */
    public function index(Request $request): JsonResponse
    {
        $programs = $request->user()->programs()
            ->with(['days.exercises.exercise', 'referenceGym', 'createdBy'])
            ->get()
            ->map(fn (Program $program) => ProgramTree::map($program))
            ->values();

        return response()->json([
            'programs' => $programs,
        ]);
    }

    /**
     * Create a program for the authenticated user, optionally with a full
     * tree of days and exercises in a single request. The whole tree is
     * created atomically: if any part fails, nothing is persisted.
     *
     * An optional `reference_gym_id` sets a "train at this gym" context. The
     * user must have an active GymAssignment there (an athlete cannot pin a
     * routine to a gym they have no connection to; a coach building for an
     * athlete uses the coach endpoint, which allows the coach's own gyms).
     * When set, every exercise that needs a machine must have that machine
     * available in the gym's inventory.
     */
    public function store(StoreProgramRequest $request): JsonResponse
    {
        $validated = $request->validated();
        $referenceGymId = $validated['reference_gym_id'] ?? null;

        if ($referenceGymId !== null) {
            $this->assertActiveAssignment($request, (int) $referenceGymId);
            GymInventory::assertProgramExercisesAvailable($validated['days'] ?? [], (int) $referenceGymId);
        }

        $program = ProgramTree::create($request->user(), $validated, $validated['days'] ?? []);

        return response()->json([
            'program' => ProgramTree::map($program),
        ], 201);
    }

    /**
     * Return a single program owned by the authenticated user. Always 404
     * (never 403) when the program does not exist or belongs to another
     * user, so as not to reveal the distinction.
     */
    public function show(Request $request, int $program): JsonResponse
    {
        $program = $request->user()->programs()
            ->with(['days.exercises.exercise', 'referenceGym', 'createdBy'])
            ->findOrFail($program);

        return response()->json([
            'program' => ProgramTree::map($program),
        ]);
    }

    /**
     * Update the authenticated user's program. Only `name` can be changed
     * here; any `days`/`exercises` present in the payload are ignored.
     *
     * A program authored by the user's coach is read-only for the athlete
     * (403): the coach maintains it through the coach endpoint. The athlete
     * "uses" it by copying it into their own local routines instead.
     */
    public function update(Request $request, int $program): JsonResponse
    {
        $program = $request->user()->programs()->findOrFail($program);

        abort_if(
            $program->created_by_user_id !== null && $program->created_by_user_id !== $request->user()->id,
            403,
            'This program is managed by your coach and cannot be edited here.',
        );

        $validated = $request->validate([
            'name' => ['sometimes', 'string', 'max:255'],
        ]);

        $program->fill($validated)->save();

        return response()->json([
            'program' => ProgramTree::map($program->fresh()),
        ]);
    }

    /**
     * Mark a coach-authored program as imported: the athlete has copied it
     * into their own local routines. Persistent and per-athlete (it sets
     * `imported_at` on the athlete's own program row), so the routine stops
     * appearing in the athlete's "from my coach" tray and does not come back
     * on reload — while the coach's original program and every other
     * athlete's copy are untouched.
     *
     * Idempotent: a second call returns the program unchanged (the first
     * import timestamp is kept). Only a coach-authored program can be
     * imported — importing your own program is a 422.
     */
    public function import(Request $request, int $program): JsonResponse
    {
        $program = $request->user()->programs()->findOrFail($program);

        $isCoachAuthored = $program->created_by_user_id !== null
            && $program->created_by_user_id !== $request->user()->id;

        if (! $isCoachAuthored) {
            throw ValidationException::withMessages([
                'program' => ['Only a routine created by your coach can be imported.'],
            ]);
        }

        if ($program->imported_at === null) {
            $program->update(['imported_at' => now()]);
        }

        return response()->json([
            'program' => ProgramTree::map($program->fresh()),
        ]);
    }

    /**
     * Delete the authenticated user's program. Cascades to its days and
     * exercises at the database level; the referenced catalog Exercises are
     * never touched. The athlete may delete a coach-authored program too —
     * that is how they decline it.
     */
    public function destroy(Request $request, int $program): JsonResponse
    {
        $program = $request->user()->programs()->findOrFail($program);
        $program->delete();

        return response()->json(null, 204);
    }

    /**
     * Abort with 422 unless the authenticated user has an active
     * GymAssignment (any role) in the given gym.
     */
    private function assertActiveAssignment(Request $request, int $gymId): void
    {
        $hasAssignment = GymAssignment::where('user_id', $request->user()->id)
            ->where('gym_id', $gymId)
            ->where('status', GymAssignment::STATUS_ACTIVE)
            ->exists();

        if (! $hasAssignment) {
            throw ValidationException::withMessages([
                'reference_gym_id' => ['You can only reference a gym you are currently assigned to.'],
            ]);
        }
    }
}
