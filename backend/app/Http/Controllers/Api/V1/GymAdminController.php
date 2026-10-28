<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Branch;
use App\Models\Equipment;
use App\Models\EquipmentRequest;
use App\Models\EquipmentRequestEvent;
use App\Models\GymAssignment;
use App\Models\GymEquipment;
use App\Models\User;
use App\Support\AthleteSnapshot;
use Illuminate\Database\QueryException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Validation\ValidationException;

/**
 * Gym MVP (slice D-GYM): a `gym_admin` manages the `member` and `coach`
 * roles of their own gym, and reads a shadow-quality snapshot of a member's
 * training.
 *
 * Every endpoint is gated by an active `GymAssignment(role=gym_admin)` for
 * the authenticated user in the gym named by the `{gym}` route segment
 * (`assertGymAdmin`). The gym id is ONLY ever taken from the route, never
 * from the request body. A caller who is not an active gym_admin of that
 * gym — or a gym that does not exist — always 404s (never 403), the same
 * anti-IDOR posture as the rest of the API.
 *
 * Out of scope for this slice (D-GYM): granting/revoking `gym_admin` or
 * `staff` (gym_admin stays a manual DB bootstrap), creating gyms/branches,
 * programs/workouts, and any write to the athlete's own `me/*` data. The
 * snapshot adds NO new points authority (see App\Support\AthleteSnapshot).
 */
class GymAdminController extends Controller
{
    /**
     * List the active `member` assignments of the gym.
     */
    public function members(Request $request, int $gym): JsonResponse
    {
        $this->assertGymAdmin($request, $gym);

        return response()->json([
            'members' => $this->assignmentsOf($gym, GymAssignment::ROLE_MEMBER),
        ]);
    }

    /**
     * List the active `coach` assignments of the gym.
     */
    public function coaches(Request $request, int $gym): JsonResponse
    {
        $this->assertGymAdmin($request, $gym);

        return response()->json([
            'coaches' => $this->assignmentsOf($gym, GymAssignment::ROLE_COACH),
        ]);
    }

    /**
     * Resolve a user by exact email so the gym_admin can assign them a role.
     * Returns the minimal shape only ({id, name}); the email itself is never
     * echoed back, and a miss is a 404 — nothing here is a general
     * `GET /users/{id}` lookup.
     */
    public function userLookup(Request $request, int $gym): JsonResponse
    {
        $this->assertGymAdmin($request, $gym);

        $validated = $request->validate([
            'email' => ['required', 'string', 'email'],
        ]);

        $user = User::where('email', $validated['email'])->first();

        abort_if($user === null, 404);

        return response()->json([
            'user' => [
                'id' => $user->id,
                'name' => $user->name,
            ],
        ]);
    }

    /**
     * Assign another user a `member` or `coach` role in this gym.
     *
     * `gym_id` comes only from the route. `role` is restricted to
     * `member`/`coach` — `gym_admin` and `staff` are rejected (422). A
     * `branch_id`, if given, must belong to this gym; a `member` requires
     * one (the GymAssignment domain rule). A previously revoked assignment
     * with the same key is reactivated in place (200); an already-active one
     * is a duplicate (422).
     */
    public function storeAssignment(Request $request, int $gym): JsonResponse
    {
        $this->assertGymAdmin($request, $gym);

        $validated = $request->validate([
            'user_id' => ['required', 'integer', 'exists:users,id'],
            'role' => ['required', 'string', 'in:member,coach'],
            'branch_id' => ['nullable', 'integer', 'exists:branches,id'],
        ]);

        $userId = (int) $validated['user_id'];
        $role = $validated['role'];
        $branchId = $validated['branch_id'] ?? null;

        if ($branchId !== null) {
            $branch = Branch::find($branchId);

            if ((int) $branch->gym_id !== $gym) {
                throw ValidationException::withMessages([
                    'branch_id' => ['This branch does not belong to the indicated gym.'],
                ]);
            }
        }

        if ($role === GymAssignment::ROLE_MEMBER && $branchId === null) {
            throw ValidationException::withMessages([
                'branch_id' => ['A member assignment requires a branch.'],
            ]);
        }

        $existingQuery = GymAssignment::where('user_id', $userId)
            ->where('gym_id', $gym)
            ->where('role', $role);

        $branchId === null
            ? $existingQuery->whereNull('branch_id')
            : $existingQuery->where('branch_id', $branchId);

        $existing = $existingQuery->first();

        if ($existing) {
            if ($existing->status === GymAssignment::STATUS_ACTIVE) {
                throw ValidationException::withMessages([
                    'user_id' => ['This user already has that role in this gym/branch.'],
                ]);
            }

            $existing->update(['status' => GymAssignment::STATUS_ACTIVE]);

            return response()->json([
                'assignment' => $this->mapAssignment($existing->load(['user', 'branch'])),
            ]);
        }

        try {
            $assignment = GymAssignment::create([
                'user_id' => $userId,
                'gym_id' => $gym,
                'branch_id' => $branchId,
                'role' => $role,
                'status' => GymAssignment::STATUS_ACTIVE,
            ]);
        } catch (QueryException) {
            // Raced past the pre-check and hit the (user, gym, branch, role)
            // unique key: 422, never 500 — same last line of defense as
            // GymAssignmentController::store.
            throw ValidationException::withMessages([
                'user_id' => ['This user already has that role in this gym/branch.'],
            ]);
        }

        return response()->json([
            'assignment' => $this->mapAssignment($assignment->load(['user', 'branch'])),
        ], 201);
    }

    /**
     * Revoke a `member`/`coach` assignment of this gym (status -> inactive,
     * never a hard delete). The assignment must belong to the `{gym}` in the
     * route and be currently active; anything else — another gym's row, a
     * `gym_admin`/`staff` row, an already-revoked row — is a 404.
     */
    public function destroyAssignment(Request $request, int $gym, int $id): JsonResponse
    {
        $this->assertGymAdmin($request, $gym);

        $assignment = GymAssignment::query()
            ->where('gym_id', $gym)
            ->whereIn('role', [GymAssignment::ROLE_MEMBER, GymAssignment::ROLE_COACH])
            ->where('status', GymAssignment::STATUS_ACTIVE)
            ->findOrFail($id);

        $assignment->update(['status' => GymAssignment::STATUS_INACTIVE]);

        return response()->json(null, 204);
    }

    /**
     * Return the shadow-quality training snapshot of one active `member` of
     * this gym. Double gate: the caller must be a gym_admin of `{gym}` AND
     * `{userId}` must be an active `member` of `{gym}` — either failing is a
     * 404. The `{userId}` in the URL can never bypass the member gate.
     */
    public function memberDetail(Request $request, int $gym, int $userId): JsonResponse
    {
        $this->assertGymAdmin($request, $gym);

        $isActiveMember = GymAssignment::query()
            ->where('gym_id', $gym)
            ->where('user_id', $userId)
            ->where('role', GymAssignment::ROLE_MEMBER)
            ->where('status', GymAssignment::STATUS_ACTIVE)
            ->exists();

        abort_unless($isActiveMember, 404);

        return response()->json(AthleteSnapshot::for(User::findOrFail($userId)));
    }

    /**
     * The full global equipment catalog, annotated with this gym's inventory
     * state for each item (`in_inventory`, `available`). The gym_admin needs
     * to see items NOT yet in the inventory in order to add them, so this
     * returns the whole catalog — unlike the public
     * `GET /gyms/{gym}/equipment`, which lists only inventoried items.
     */
    public function equipment(Request $request, int $gym): JsonResponse
    {
        $this->assertGymAdmin($request, $gym);

        $inventory = GymEquipment::where('gym_id', $gym)->get()->keyBy('equipment_id');

        $catalog = Equipment::orderBy('name')->get()
            ->map(function (Equipment $item) use ($inventory) {
                $row = $inventory->get($item->id);

                return [
                    'id' => $item->id,
                    'slug' => $item->slug,
                    'name' => $item->name,
                    'in_inventory' => $row !== null,
                    'available' => $row !== null && (bool) $row->available,
                ];
            })
            ->values();

        return response()->json([
            'equipment' => $catalog,
        ]);
    }

    /**
     * Add a catalog item to this gym's inventory or set its availability.
     * Body `{ available: bool }` (defaults to true — "we have this"). A
     * `false` value keeps the row but marks it out of service; both states
     * are treated as "not usable" by routine validation. Idempotent: an
     * existing row is updated in place.
     *
     * `gym` and `equipment` come only from the route. Unknown equipment id
     * is a 404 (route-model style).
     */
    public function setEquipment(Request $request, int $gym, int $equipment): JsonResponse
    {
        $this->assertGymAdmin($request, $gym);

        $item = Equipment::findOrFail($equipment);

        $validated = $request->validate([
            'available' => ['sometimes', 'boolean'],
        ]);

        $row = GymEquipment::updateOrCreate(
            ['gym_id' => $gym, 'equipment_id' => $item->id],
            ['available' => $validated['available'] ?? true],
        );

        return response()->json([
            'equipment' => [
                'id' => $item->id,
                'slug' => $item->slug,
                'name' => $item->name,
                'in_inventory' => true,
                'available' => (bool) $row->available,
            ],
        ], $row->wasRecentlyCreated ? 201 : 200);
    }

    /**
     * Remove a catalog item from this gym's inventory entirely (hard delete
     * of the pivot row — the global catalog item is never touched). A no-op
     * when the item is not in the inventory (still 204).
     */
    public function removeEquipment(Request $request, int $gym, int $equipment): JsonResponse
    {
        $this->assertGymAdmin($request, $gym);

        GymEquipment::where('gym_id', $gym)->where('equipment_id', $equipment)->delete();

        return response()->json(null, 204);
    }

    // -----------------------------------------------------------------
    // EQUIPMENT CATALOG REQUESTS (slice D-GYM-EQUIPMENT-REQUEST)
    //
    // The gym cannot touch the global `equipment` catalog. When it needs a
    // machine that is not in the catalog, the gym_admin submits a request;
    // a BIAFYT Admin reviews it (Admin\EquipmentRequestController). The
    // gym can edit + resubmit while `pending`/`changes_requested`, and never
    // decides the outcome.
    // -----------------------------------------------------------------

    /**
     * List this gym's equipment-catalog requests, newest first, with their
     * audit trail.
     */
    public function equipmentRequests(Request $request, int $gym): JsonResponse
    {
        $this->assertGymAdmin($request, $gym);

        $requests = EquipmentRequest::query()
            ->where('gym_id', $gym)
            ->with(['events', 'resultingEquipment'])
            ->orderByDesc('id')
            ->get()
            ->map(fn (EquipmentRequest $r) => $this->mapEquipmentRequestForGym($r))
            ->values();

        return response()->json(['equipment_requests' => $requests]);
    }

    /**
     * Submit a new equipment-catalog request. `gym_id` and
     * `requested_by_user_id` come only from the route + token. Starts as
     * `pending`.
     */
    public function storeEquipmentRequest(Request $request, int $gym): JsonResponse
    {
        $this->assertGymAdmin($request, $gym);

        $validated = $this->validateEquipmentRequestPayload($request);

        $equipmentRequest = EquipmentRequest::create([
            'gym_id' => $gym,
            'requested_by_user_id' => $request->user()->id,
            'status' => EquipmentRequest::STATUS_PENDING,
            ...$validated,
        ]);
        $equipmentRequest->recordEvent('submitted', $request->user()->id);

        return response()->json([
            'equipment_request' => $this->mapEquipmentRequestForGym($equipmentRequest->load(['events', 'resultingEquipment'])),
        ], 201);
    }

    /**
     * Show one of this gym's equipment requests.
     */
    public function showEquipmentRequest(Request $request, int $gym, int $equipmentRequest): JsonResponse
    {
        $this->assertGymAdmin($request, $gym);

        $found = EquipmentRequest::where('gym_id', $gym)
            ->with(['events', 'resultingEquipment'])
            ->findOrFail($equipmentRequest);

        return response()->json(['equipment_request' => $this->mapEquipmentRequestForGym($found)]);
    }

    /**
     * Edit + (re)submit an equipment request. Allowed only while `pending`
     * or `changes_requested`; anything else is a 422 (the gym cannot touch a
     * request that is in review or already resolved). Editing a
     * `changes_requested` request moves it back to `pending` and clears the
     * previous review note.
     */
    public function updateEquipmentRequest(Request $request, int $gym, int $equipmentRequest): JsonResponse
    {
        $this->assertGymAdmin($request, $gym);

        $found = EquipmentRequest::where('gym_id', $gym)->findOrFail($equipmentRequest);

        if (! in_array($found->status, EquipmentRequest::GYM_EDITABLE, true)) {
            throw ValidationException::withMessages([
                'status' => ['This request can no longer be edited by the gym.'],
            ]);
        }

        $validated = $this->validateEquipmentRequestPayload($request);
        $wasChangesRequested = $found->status === EquipmentRequest::STATUS_CHANGES_REQUESTED;

        $found->fill($validated);
        if ($wasChangesRequested) {
            $found->status = EquipmentRequest::STATUS_PENDING;
            $found->review_note = null;
        }
        $found->save();

        $found->recordEvent($wasChangesRequested ? 'resubmitted' : 'info_corrected', $request->user()->id);

        return response()->json([
            'equipment_request' => $this->mapEquipmentRequestForGym($found->load(['events', 'resultingEquipment'])),
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    private function validateEquipmentRequestPayload(Request $request): array
    {
        return $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'brand' => ['nullable', 'string', 'max:255'],
            'model' => ['nullable', 'string', 'max:255'],
            'description' => ['nullable', 'string', 'max:2000'],
            'category' => ['nullable', 'string', 'max:120'],
            'photo_urls' => ['nullable', 'array', 'max:8'],
            'photo_urls.*' => ['string', 'url', 'max:2048'],
        ]);
    }

    /**
     * Gym-facing shape: the gym sees the review notes and the audit actions,
     * but NOT the reviewing admin's identity (same posture as the gym
     * registration applicant view).
     *
     * @return array<string, mixed>
     */
    private function mapEquipmentRequestForGym(EquipmentRequest $r): array
    {
        return [
            'id' => $r->id,
            'status' => $r->status,
            'name' => $r->name,
            'brand' => $r->brand,
            'model' => $r->model,
            'description' => $r->description,
            'category' => $r->category,
            'photo_urls' => $r->photo_urls ?? [],
            'review_note' => $r->review_note,
            'reviewed_at' => $r->reviewed_at,
            'resulting_equipment' => $r->resultingEquipment
                ? ['id' => $r->resultingEquipment->id, 'name' => $r->resultingEquipment->name]
                : null,
            'events' => $r->events->map(fn (EquipmentRequestEvent $e) => [
                'action' => $e->action,
                'note' => $e->note,
                'at' => $e->created_at,
            ])->values(),
            'created_at' => $r->created_at,
        ];
    }

    /**
     * Abort with 404 unless the authenticated user is an active `gym_admin`
     * of the gym named by the route. The gym id is read only here, only from
     * the route argument.
     */
    private function assertGymAdmin(Request $request, int $gym): void
    {
        abort_unless(
            GymAssignment::query()
                ->where('user_id', $request->user()->id)
                ->where('gym_id', $gym)
                ->where('role', GymAssignment::ROLE_GYM_ADMIN)
                ->where('status', GymAssignment::STATUS_ACTIVE)
                ->exists(),
            404,
        );
    }

    /**
     * @return Collection<int, array<string, mixed>>
     */
    private function assignmentsOf(int $gym, string $role)
    {
        return GymAssignment::query()
            ->where('gym_id', $gym)
            ->where('role', $role)
            ->where('status', GymAssignment::STATUS_ACTIVE)
            ->with(['user', 'branch'])
            ->get()
            ->sortBy(fn (GymAssignment $assignment) => [
                $assignment->user->name,
                $assignment->branch->name ?? '',
            ])
            ->map(fn (GymAssignment $assignment) => $this->mapAssignment($assignment))
            ->values();
    }

    /**
     * @return array<string, mixed>
     */
    private function mapAssignment(GymAssignment $assignment): array
    {
        return [
            'id' => $assignment->id,
            'user' => [
                'id' => $assignment->user->id,
                'name' => $assignment->user->name,
            ],
            'role' => $assignment->role,
            'branch' => $assignment->branch instanceof Branch
                ? [
                    'id' => $assignment->branch->id,
                    'name' => $assignment->branch->name,
                ]
                : null,
            'since' => $assignment->created_at,
        ];
    }
}
