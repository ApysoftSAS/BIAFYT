<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Branch;
use App\Models\GymAssignment;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

class GymAssignmentController extends Controller
{
    /**
     * Return the authenticated user's active gym assignments.
     *
     * Always scoped to the authenticated user via `$request->user()->id`;
     * `user_id` is never accepted from any client input.
     */
    public function index(Request $request): JsonResponse
    {
        $assignments = GymAssignment::query()
            ->where('user_id', $request->user()->id)
            ->where('status', GymAssignment::STATUS_ACTIVE)
            ->with(['gym', 'branch'])
            ->get()
            // Sort by gym name, then branch name, with gym-wide assignments
            // (branch: null) ordered before a named branch of the same gym.
            ->sortBy(fn (GymAssignment $assignment) => [
                $assignment->gym->name,
                $assignment->branch->name ?? '',
            ])
            ->map(fn (GymAssignment $assignment) => [
                'id' => $assignment->id,
                'role' => $assignment->role,
                'gym' => [
                    'id' => $assignment->gym->id,
                    'name' => $assignment->gym->name,
                ],
                'branch' => $assignment->branch instanceof Branch
                    ? [
                        'id' => $assignment->branch->id,
                        'name' => $assignment->branch->name,
                    ]
                    : null,
            ])
            ->values();

        return response()->json([
            'gym_assignments' => $assignments,
        ]);
    }

    /**
     * Self-assign the authenticated user to a gym/branch as `member`.
     *
     * `role` and `user_id` are never accepted from client input: `role` is
     * always forced to `member` and `user_id` always comes from
     * `$request->user()->id`. `branch_id` is required (never nullable):
     * the GymAssignment model forbids a `member` assignment with a NULL
     * `branch_id` (see GymAssignment::booted()).
     *
     * The (user_id, gym_id, branch_id, role) key is unique at the database
     * level but does not account for `status`, so a previously revoked
     * (`inactive`) assignment with the same key is reactivated in place
     * (200) instead of creating a duplicate row. An existing `active`
     * assignment with the same key is rejected as a duplicate (422).
     */
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'gym_id' => ['required', 'integer', 'exists:gyms,id'],
            'branch_id' => ['required', 'integer', 'exists:branches,id'],
        ]);

        $branch = Branch::find($validated['branch_id']);

        if ($branch->gym_id !== (int) $validated['gym_id']) {
            throw ValidationException::withMessages([
                'branch_id' => ['This branch does not belong to the indicated gym.'],
            ]);
        }

        $existing = GymAssignment::where('user_id', $request->user()->id)
            ->where('gym_id', $validated['gym_id'])
            ->where('branch_id', $validated['branch_id'])
            ->where('role', GymAssignment::ROLE_MEMBER)
            ->first();

        if ($existing) {
            if ($existing->status === GymAssignment::STATUS_ACTIVE) {
                throw ValidationException::withMessages([
                    'gym_id' => ['You are already assigned to this gym/branch.'],
                ]);
            }

            $existing->update(['status' => GymAssignment::STATUS_ACTIVE]);

            return response()->json([
                'gym_assignment' => $this->mapAssignment($existing->load(['gym', 'branch'])),
            ]);
        }

        $assignment = GymAssignment::create([
            'user_id' => $request->user()->id,
            'gym_id' => $validated['gym_id'],
            'branch_id' => $validated['branch_id'],
            'role' => GymAssignment::ROLE_MEMBER,
            'status' => GymAssignment::STATUS_ACTIVE,
        ]);

        return response()->json([
            'gym_assignment' => $this->mapAssignment($assignment->load(['gym', 'branch'])),
        ], 201);
    }

    /**
     * Revoke a `member` gym assignment owned by the authenticated user. The
     * row is never deleted, only marked `inactive`. Always 404 (never 403)
     * when the assignment does not exist, belongs to another user, or has a
     * role other than `member` (coach/staff/gym_admin assignments — even the
     * user's own — are out of scope for this endpoint).
     */
    public function destroy(Request $request, int $id): JsonResponse
    {
        $assignment = $request->user()->gymAssignments()
            ->where('role', GymAssignment::ROLE_MEMBER)
            ->findOrFail($id);

        $assignment->update(['status' => GymAssignment::STATUS_INACTIVE]);

        return response()->json(null, 204);
    }

    /**
     * @return array<string, mixed>
     */
    private function mapAssignment(GymAssignment $assignment): array
    {
        return [
            'id' => $assignment->id,
            'role' => $assignment->role,
            'gym' => [
                'id' => $assignment->gym->id,
                'name' => $assignment->gym->name,
            ],
            'branch' => $assignment->branch instanceof Branch
                ? [
                    'id' => $assignment->branch->id,
                    'name' => $assignment->branch->name,
                ]
                : null,
        ];
    }
}
