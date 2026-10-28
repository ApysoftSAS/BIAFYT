<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreProgramRequest;
use App\Models\CoachAthleteRelationship;
use App\Models\CoachNote;
use App\Models\GymAssignment;
use App\Models\Program;
use App\Models\User;
use App\Support\AthleteSnapshot;
use App\Support\GymInventory;
use App\Support\ProgramTree;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Coach-scoped, read-mostly access to an athlete's information, plus the
 * coach's feedback notes about that athlete.
 *
 * Every athlete-data endpoint is gated by a currently `active`
 * coach<->athlete relationship where the authenticated user is the coach
 * (`CoachAthleteRelationship::activeBetween`). A missing / pending / revoked
 * relationship always 404s (never 403), the same anti-IDOR posture as the
 * rest of the API — the coach never learns whether the athlete or the
 * relationship exists.
 *
 * The athlete data returned here is shadow/best-effort quality: Profile is
 * authoritative, but activities / points / streak are populated by the user
 * app's best-effort write-through and may have offline gaps (accepted —
 * D-COACH-2). This controller adds NO new points authority and does not
 * touch any `me/*` endpoint the athlete uses.
 */
class CoachAthleteController extends Controller
{
    /**
     * List the authenticated coach's athletes with a currently `active`
     * relationship. Pending requests and revoked relationships are excluded.
     */
    public function index(Request $request): JsonResponse
    {
        $athletes = $request->user()->coachRelationshipsAsCoach()
            ->where('status', CoachAthleteRelationship::STATUS_ACTIVE)
            ->with('athlete')
            ->get()
            ->map(fn (CoachAthleteRelationship $relationship) => [
                'athlete' => [
                    'id' => $relationship->athlete->id,
                    'name' => $relationship->athlete->name,
                ],
                'since' => $relationship->activated_at,
            ])
            ->values();

        return response()->json([
            'athletes' => $athletes,
        ]);
    }

    /**
     * Return one athlete's information for the authenticated coach: profile,
     * an activity summary, the authoritative check-in streak, and the points
     * balance. Read-only.
     */
    public function show(Request $request, int $athleteUserId): JsonResponse
    {
        $athlete = $this->authorizedAthlete($request, $athleteUserId);

        return response()->json(AthleteSnapshot::for($athlete));
    }

    /**
     * List the notes the authenticated coach has written about this athlete,
     * newest first. Requires an active relationship (reading athlete-scoped
     * data).
     */
    public function notesIndex(Request $request, int $athleteUserId): JsonResponse
    {
        $this->authorizedAthlete($request, $athleteUserId);

        $notes = $request->user()->coachNotesWritten()
            ->where('athlete_user_id', $athleteUserId)
            ->orderByDesc('id')
            ->get()
            ->map(fn (CoachNote $note) => $this->mapNote($note))
            ->values();

        return response()->json([
            'notes' => $notes,
        ]);
    }

    /**
     * Create a feedback note about this athlete. Requires an active
     * relationship. `coach_user_id` comes from the token, `athlete_user_id`
     * from the route — neither is ever read from the request body.
     */
    public function notesStore(Request $request, int $athleteUserId): JsonResponse
    {
        $this->authorizedAthlete($request, $athleteUserId);

        $validated = $request->validate([
            'body' => ['required', 'string', 'max:2000'],
        ]);

        $note = $request->user()->coachNotesWritten()->create([
            'athlete_user_id' => $athleteUserId,
            'body' => $validated['body'],
        ]);

        return response()->json([
            'note' => $this->mapNote($note),
        ], 201);
    }

    /**
     * Delete one of the authenticated coach's own notes. Scoped to
     * `coachNotesWritten()`, so another coach's note (or a nonexistent id)
     * is a 404. Deleting your own note touches only your data, so it does
     * not require the relationship to still be active.
     */
    public function notesDestroy(Request $request, int $note): JsonResponse
    {
        $request->user()->coachNotesWritten()->findOrFail($note)->delete();

        return response()->json(null, 204);
    }

    // -----------------------------------------------------------------
    // COACH-AUTHORED PROGRAMS (slice D-COACH-PROGRAMS)
    //
    // A coach with an active relationship creates and maintains training
    // programs FOR the athlete. The rows live in the same `programs` table
    // the athlete's own routines could use: `user_id` = the athlete (they
    // own it), `created_by_user_id` = the coach (authorship / the athlete's
    // app shows "from your coach"). The coach only ever touches programs
    // they authored — never the athlete's own routines. GymAssignment plays
    // no part in this authorization; the coach<->athlete relationship is the
    // only gate. An optional `reference_gym_id` must be a gym the COACH is
    // assigned to; the athlete does NOT need to belong to it.
    // -----------------------------------------------------------------

    /**
     * List the programs the authenticated coach has authored for this
     * athlete.
     */
    public function programsIndex(Request $request, int $athleteUserId): JsonResponse
    {
        $this->authorizedAthlete($request, $athleteUserId);

        $programs = Program::query()
            ->where('user_id', $athleteUserId)
            ->where('created_by_user_id', $request->user()->id)
            ->with(['days.exercises.exercise', 'referenceGym', 'createdBy'])
            ->get()
            ->map(fn (Program $program) => ProgramTree::map($program))
            ->values();

        return response()->json(['programs' => $programs]);
    }

    /**
     * Create a program for this athlete, optionally with a full day/exercise
     * tree, atomically. `user_id` is the athlete (route), `created_by_user_id`
     * is the coach (token) — neither comes from the body.
     */
    public function programsStore(StoreProgramRequest $request, int $athleteUserId): JsonResponse
    {
        $athlete = $this->authorizedAthlete($request, $athleteUserId);

        $validated = $request->validated();
        $referenceGymId = $this->resolveReferenceGym($request, $validated);

        $program = ProgramTree::create($athlete, [
            'name' => $validated['name'],
            'reference_gym_id' => $referenceGymId,
            'created_by_user_id' => $request->user()->id,
        ], $validated['days'] ?? []);

        return response()->json(['program' => ProgramTree::map($program)], 201);
    }

    /**
     * Return one coach-authored program for this athlete. 404 for a program
     * that does not exist, belongs to another athlete, or was authored by
     * someone else.
     */
    public function programsShow(Request $request, int $athleteUserId, int $program): JsonResponse
    {
        $this->authorizedAthlete($request, $athleteUserId);

        $model = $this->coachAuthoredProgram($request, $athleteUserId, $program);
        $model->load(['days.exercises.exercise', 'referenceGym', 'createdBy']);

        return response()->json(['program' => ProgramTree::map($model)]);
    }

    /**
     * Replace a coach-authored program's contents (name, reference gym, and
     * the whole day/exercise tree). "Improving" a routine is resubmitting
     * the improved version — the previous days/exercises are dropped and
     * rebuilt atomically.
     */
    public function programsUpdate(StoreProgramRequest $request, int $athleteUserId, int $program): JsonResponse
    {
        $this->authorizedAthlete($request, $athleteUserId);

        $model = $this->coachAuthoredProgram($request, $athleteUserId, $program);

        $validated = $request->validated();
        $referenceGymId = $this->resolveReferenceGym($request, $validated);

        DB::transaction(function () use ($model, $validated, $referenceGymId) {
            $model->update([
                'name' => $validated['name'],
                'reference_gym_id' => $referenceGymId,
            ]);
            $model->days()->delete();

            // Rebuild the tree with the shared writer by re-running create on
            // a throwaway then moving its days over would be wasteful; instead
            // recreate the days/exercises directly against this program.
            ProgramTree::attachDays($model, $validated['days'] ?? []);
        });

        $model->load(['days.exercises.exercise', 'referenceGym', 'createdBy']);

        return response()->json(['program' => ProgramTree::map($model)]);
    }

    /**
     * Delete a coach-authored program.
     */
    public function programsDestroy(Request $request, int $athleteUserId, int $program): JsonResponse
    {
        $this->authorizedAthlete($request, $athleteUserId);

        $this->coachAuthoredProgram($request, $athleteUserId, $program)->delete();

        return response()->json(null, 204);
    }

    /**
     * Resolve a program that (a) belongs to this athlete and (b) was
     * authored by the authenticated coach. Anything else is a 404.
     */
    private function coachAuthoredProgram(Request $request, int $athleteUserId, int $program): Program
    {
        return Program::query()
            ->where('user_id', $athleteUserId)
            ->where('created_by_user_id', $request->user()->id)
            ->findOrFail($program);
    }

    /**
     * Validate the optional `reference_gym_id`: it must be a gym the
     * authenticated coach has an active GymAssignment in. `null` / absent is
     * fine (no gym context). The athlete's own gym membership is irrelevant.
     *
     * When a reference gym is set, the program's exercises are checked
     * against that gym's inventory.
     *
     * @param  array<string, mixed>  $validated
     */
    private function resolveReferenceGym(Request $request, array $validated): ?int
    {
        $referenceGymId = $validated['reference_gym_id'] ?? null;

        if ($referenceGymId === null) {
            return null;
        }

        $referenceGymId = (int) $referenceGymId;

        $coachAssigned = GymAssignment::where('user_id', $request->user()->id)
            ->where('gym_id', $referenceGymId)
            ->where('status', GymAssignment::STATUS_ACTIVE)
            ->exists();

        if (! $coachAssigned) {
            throw ValidationException::withMessages([
                'reference_gym_id' => ['You can only reference a gym you are currently assigned to.'],
            ]);
        }

        GymInventory::assertProgramExercisesAvailable($validated['days'] ?? [], $referenceGymId);

        return $referenceGymId;
    }

    /**
     * Resolve the athlete the authenticated user is authorized to act on, or
     * abort with 404 when there is no currently active relationship.
     */
    private function authorizedAthlete(Request $request, int $athleteUserId): User
    {
        abort_unless(
            CoachAthleteRelationship::activeBetween($request->user()->id, $athleteUserId),
            404,
        );

        return User::findOrFail($athleteUserId);
    }

    /**
     * @return array<string, mixed>
     */
    private function mapNote(CoachNote $note): array
    {
        return [
            'id' => $note->id,
            'body' => $note->body,
            'created_at' => $note->created_at,
            'updated_at' => $note->updated_at,
        ];
    }
}
