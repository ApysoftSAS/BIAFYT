<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\CoachAthleteRelationship;
use App\Models\GymAssignment;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

class CoachAthleteRelationshipController extends Controller
{
    /**
     * Return every coach<->athlete relationship the authenticated user
     * participates in, on either side (as coach or as athlete).
     */
    public function index(Request $request): JsonResponse
    {
        $userId = $request->user()->id;

        $relationships = CoachAthleteRelationship::query()
            ->where('coach_user_id', $userId)
            ->orWhere('athlete_user_id', $userId)
            ->with(['coach', 'athlete'])
            ->get()
            ->map(fn (CoachAthleteRelationship $relationship) => $this->mapRelationship($relationship, $userId))
            ->values();

        return response()->json([
            'coach_relationships' => $relationships,
        ]);
    }

    /**
     * Request a coach<->athlete relationship with another user. The
     * authenticated user is always the coach side (`coach_user_id`); never
     * accepted from client input. Requires the authenticated user to
     * currently hold an active `GymAssignment(role=coach)` in any
     * gym/branch (relationship is not gym-scoped). Rejects self-requests
     * and duplicate pending/active requests for the same pair without
     * creating a second row.
     */
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'athlete_user_id' => ['required', 'integer', 'exists:users,id'],
        ]);

        $coachUserId = $request->user()->id;
        $athleteUserId = (int) $validated['athlete_user_id'];

        if ($athleteUserId === $coachUserId) {
            throw ValidationException::withMessages([
                'athlete_user_id' => ['You cannot request a coach relationship with yourself.'],
            ]);
        }

        $hasActiveCoachAssignment = GymAssignment::where('user_id', $coachUserId)
            ->where('role', GymAssignment::ROLE_COACH)
            ->where('status', GymAssignment::STATUS_ACTIVE)
            ->exists();

        if (! $hasActiveCoachAssignment) {
            throw ValidationException::withMessages([
                'athlete_user_id' => ['You must have an active coach gym assignment to request an athlete relationship.'],
            ]);
        }

        $hasStandingRelationship = CoachAthleteRelationship::where('coach_user_id', $coachUserId)
            ->where('athlete_user_id', $athleteUserId)
            ->whereIn('status', [CoachAthleteRelationship::STATUS_PENDING, CoachAthleteRelationship::STATUS_ACTIVE])
            ->exists();

        if ($hasStandingRelationship) {
            throw ValidationException::withMessages([
                'athlete_user_id' => ['A pending or active relationship with this athlete already exists.'],
            ]);
        }

        $relationship = CoachAthleteRelationship::create([
            'coach_user_id' => $coachUserId,
            'athlete_user_id' => $athleteUserId,
            'status' => CoachAthleteRelationship::STATUS_PENDING,
            'requested_at' => now(),
        ]);

        return response()->json([
            'coach_relationship' => $this->mapRelationship($relationship->load(['coach', 'athlete']), $coachUserId),
        ], 201);
    }

    /**
     * Accept a pending relationship. Only the target athlete may accept it
     * (`athlete_user_id = $request->user()->id`); scoping the lookup this
     * way also uniformly 404s a coach trying to accept their own request,
     * without a separate check. `pending -> active` only; any other status
     * is a 422, never a 500.
     */
    public function accept(Request $request, int $id): JsonResponse
    {
        $relationship = $request->user()->coachRelationshipsAsAthlete()->findOrFail($id);

        if ($relationship->status !== CoachAthleteRelationship::STATUS_PENDING) {
            throw ValidationException::withMessages([
                'status' => ['Only a pending relationship can be accepted.'],
            ]);
        }

        $relationship->update([
            'status' => CoachAthleteRelationship::STATUS_ACTIVE,
            'activated_at' => now(),
        ]);

        return response()->json([
            'coach_relationship' => $this->mapRelationship($relationship->load(['coach', 'athlete']), $request->user()->id),
        ]);
    }

    /**
     * End a relationship the authenticated user participates in. Always 404
     * (never 403) when the relationship does not exist or the user is
     * neither its coach nor its athlete. Valid transitions, by actor and
     * current status:
     *   - pending -> revoked: the requesting coach (cancel) or the target
     *     athlete (reject).
     *   - active  -> revoked: the athlete only.
     *   - anything else (coach revoking an active relationship, or acting
     *     on an already-revoked row): 422, not a 500.
     * A revoked row is never reused; a future new request starts a fresh
     * row with its own requested_at/activated_at.
     */
    public function destroy(Request $request, int $id): JsonResponse
    {
        $userId = $request->user()->id;

        $relationship = CoachAthleteRelationship::query()
            ->where(function ($query) use ($userId) {
                $query->where('coach_user_id', $userId)
                    ->orWhere('athlete_user_id', $userId);
            })
            ->findOrFail($id);

        $isCoach = (int) $relationship->coach_user_id === $userId;
        $isAthlete = (int) $relationship->athlete_user_id === $userId;

        $canRevoke = match ($relationship->status) {
            CoachAthleteRelationship::STATUS_PENDING => $isCoach || $isAthlete,
            CoachAthleteRelationship::STATUS_ACTIVE => $isAthlete,
            default => false,
        };

        if (! $canRevoke) {
            throw ValidationException::withMessages([
                'status' => ['This relationship cannot be revoked by you in its current state.'],
            ]);
        }

        $relationship->update([
            'status' => CoachAthleteRelationship::STATUS_REVOKED,
            'revoked_at' => now(),
        ]);

        return response()->json(null, 204);
    }

    /**
     * @return array<string, mixed>
     */
    private function mapRelationship(CoachAthleteRelationship $relationship, int $viewerUserId): array
    {
        return [
            'id' => $relationship->id,
            'status' => $relationship->status,
            // The viewer's own side of this relationship, so the frontend
            // never has to compare raw ids to know whether "you" are the
            // coach or the athlete here.
            'viewer_role' => (int) $relationship->coach_user_id === $viewerUserId ? 'coach' : 'athlete',
            'coach' => [
                'id' => $relationship->coach->id,
                'name' => $relationship->coach->name,
            ],
            'athlete' => [
                'id' => $relationship->athlete->id,
                'name' => $relationship->athlete->name,
            ],
            'requested_at' => $relationship->requested_at,
            'activated_at' => $relationship->activated_at,
            'revoked_at' => $relationship->revoked_at,
        ];
    }
}
