<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Concerns\PaginatesWithCursor;
use App\Http\Concerns\PresentsVouchers;
use App\Http\Controllers\Controller;
use App\Models\Branch;
use App\Models\GymAssignment;
use App\Models\Voucher;
use App\Support\Vouchers;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * A gym_admin issues, lists, redeems and revokes ecosystem vouchers for the
 * active members of their own gym. The athlete redeems the benefit WITH the
 * gym, off the platform — BIAFYT never processes the money.
 *
 * Authorization mirrors GymAdminController: the caller must be an active
 * `gym_admin` of the `{gym}` in the route (`assertGymAdmin`), the `{gym}` id
 * is only ever read from the route, and every miss — wrong gym, non-member
 * recipient, a voucher of another gym — is a 404, never a 403.
 */
class GymVoucherController extends Controller
{
    use PaginatesWithCursor;
    use PresentsVouchers;

    /**
     * The gym's vouchers, newest first. Optional `?status=` filter over the
     * stored status. Cursor pagination (A2).
     */
    public function index(Request $request, int $gym): JsonResponse
    {
        $this->assertGymStaff($request, $gym);

        $status = $this->voucherStatusFilter($request);
        ['limit' => $limit, 'cursor' => $cursor] = $this->cursorPageParams($request, ['created_at', 'id']);

        $page = Voucher::query()
            ->where('gym_id', $gym)
            ->when($status !== null, fn ($q) => $q->where('status', $status))
            ->with(['gym:id,name', 'coach:id,name', 'athlete:id,name'])
            ->orderByDesc('created_at')
            ->orderByDesc('id')
            ->cursorPaginate($limit, ['*'], 'cursor', $cursor);

        return response()->json([
            'vouchers' => $page->getCollection()->map(fn (Voucher $v) => $this->mapVoucher($v))->values(),
            'next_cursor' => $page->nextCursor()?->encode(),
            'has_more' => $page->hasMorePages(),
        ]);
    }

    /**
     * Issue a voucher to an active member of this gym. `athlete_user_id`
     * comes from the body but must be an active `member` of `{gym}` — a
     * non-member (or unknown) id is a 404, the member gate can never be
     * bypassed. `gym_id` / `issued_by_user_id` are never read from the body.
     */
    public function store(Request $request, int $gym): JsonResponse
    {
        $this->assertGymAdmin($request, $gym);

        $athleteId = (int) $request->validate([
            'athlete_user_id' => ['required', 'integer', 'exists:users,id'],
        ])['athlete_user_id'];

        $isActiveMember = GymAssignment::query()
            ->where('gym_id', $gym)
            ->where('user_id', $athleteId)
            ->where('role', GymAssignment::ROLE_MEMBER)
            ->where('status', GymAssignment::STATUS_ACTIVE)
            ->exists();

        abort_unless($isActiveMember, 404);

        $voucher = Vouchers::issue(array_merge($this->validateVoucherPayload($request), [
            'gym_id' => $gym,
            'coach_user_id' => null,
            'issued_by_user_id' => $request->user()->id,
            'athlete_user_id' => $athleteId,
        ]));

        return response()->json([
            'voucher' => $this->mapVoucher($voucher->load(['gym:id,name', 'athlete:id,name'])),
        ], 201);
    }

    /** Most recipients one bulk issue may create. */
    private const MAX_BULK = 500;

    /**
     * Issue the SAME voucher to many active members at once. Each recipient
     * gets their own single-use voucher with its own code (redeemed and
     * revoked individually). `scope`: `all` active members, `branch` (members
     * of `branch_id`) or `selected` (`athlete_user_ids`, every one of which
     * must be an active member). All or nothing (one transaction).
     */
    public function storeBulk(Request $request, int $gym): JsonResponse
    {
        $this->assertGymAdmin($request, $gym);

        $scope = $request->validate([
            'scope' => ['required', Rule::in(['all', 'branch', 'selected'])],
            'branch_id' => ['nullable', 'integer'],
            'athlete_user_ids' => ['nullable', 'array', 'max:'.self::MAX_BULK],
            'athlete_user_ids.*' => ['integer', 'distinct'],
        ]);
        $payload = $this->validateVoucherPayload($request);

        $members = GymAssignment::query()
            ->where('gym_id', $gym)
            ->where('role', GymAssignment::ROLE_MEMBER)
            ->where('status', GymAssignment::STATUS_ACTIVE);

        if ($scope['scope'] === 'branch') {
            $branchId = $scope['branch_id'] ?? null;

            if ($branchId === null || ! Branch::where('gym_id', $gym)->whereKey($branchId)->exists()) {
                throw ValidationException::withMessages(['branch_id' => ['Choose a branch of this gym.']]);
            }

            $members->where('branch_id', $branchId);
        }

        $memberIds = $members->pluck('user_id')->map(fn ($id) => (int) $id)->unique()->values();

        if ($scope['scope'] === 'selected') {
            $ids = collect($scope['athlete_user_ids'] ?? [])->map(fn ($id) => (int) $id)->unique()->values();

            if ($ids->isEmpty()) {
                throw ValidationException::withMessages(['athlete_user_ids' => ['Select at least one member.']]);
            }

            $allMembers = GymAssignment::query()
                ->where('gym_id', $gym)
                ->where('role', GymAssignment::ROLE_MEMBER)
                ->where('status', GymAssignment::STATUS_ACTIVE)
                ->pluck('user_id')->map(fn ($id) => (int) $id);

            if ($ids->diff($allMembers)->isNotEmpty()) {
                throw ValidationException::withMessages([
                    'athlete_user_ids' => ['Some of the selected users are not active members of this gym.'],
                ]);
            }

            $memberIds = $ids;
        }

        if ($memberIds->isEmpty()) {
            throw ValidationException::withMessages(['scope' => ['No active members match that selection.']]);
        }

        if ($memberIds->count() > self::MAX_BULK) {
            throw ValidationException::withMessages([
                'scope' => ['Too many recipients (max '.self::MAX_BULK.'). Issue to a branch or a smaller group.'],
            ]);
        }

        DB::transaction(function () use ($memberIds, $payload, $gym, $request) {
            foreach ($memberIds as $athleteId) {
                Vouchers::issue(array_merge($payload, [
                    'gym_id' => $gym,
                    'coach_user_id' => null,
                    'issued_by_user_id' => $request->user()->id,
                    'athlete_user_id' => $athleteId,
                ]));
            }
        });

        return response()->json(['issued' => $memberIds->count()], 201);
    }

    public function show(Request $request, int $gym, int $voucher): JsonResponse
    {
        $this->assertGymStaff($request, $gym);

        return response()->json([
            'voucher' => $this->mapVoucher($this->resolve($gym, $voucher)),
        ]);
    }

    /**
     * The gym confirms the athlete used the benefit. `issued -> redeemed`,
     * atomic (see App\Support\Vouchers::redeem).
     */
    public function redeem(Request $request, int $gym, int $voucher): JsonResponse
    {
        $this->assertGymStaff($request, $gym);

        $note = $request->validate(['note' => ['nullable', 'string', 'max:2000']])['note'] ?? null;
        $updated = Vouchers::redeem($this->resolve($gym, $voucher), $request->user(), $note);

        return response()->json([
            'voucher' => $this->mapVoucher($updated->load(['gym:id,name', 'coach:id,name', 'athlete:id,name'])),
        ]);
    }

    /**
     * The gym cancels an un-redeemed voucher. `issued -> revoked`, atomic.
     */
    public function revoke(Request $request, int $gym, int $voucher): JsonResponse
    {
        $this->assertGymAdmin($request, $gym);

        $reason = $request->validate(['reason' => ['nullable', 'string', 'max:2000']])['reason'] ?? null;
        $updated = Vouchers::revoke($this->resolve($gym, $voucher), $request->user(), $reason);

        return response()->json([
            'voucher' => $this->mapVoucher($updated->load(['gym:id,name', 'coach:id,name', 'athlete:id,name'])),
        ]);
    }

    /**
     * A voucher of this gym by id, or 404. Scoping the lookup to `gym_id` is
     * what makes another gym's voucher indistinguishable from a missing one.
     */
    private function resolve(int $gym, int $voucher): Voucher
    {
        return Voucher::query()
            ->where('gym_id', $gym)
            ->with(['gym:id,name', 'coach:id,name', 'athlete:id,name'])
            ->findOrFail($voucher);
    }

    /**
     * Abort with 404 unless the authenticated user is an active `gym_admin`
     * of the gym named by the route (same helper as GymAdminController).
     */
    /**
     * Staff (reception) may LIST, SHOW and REDEEM vouchers — confirm the
     * benefit was used — but never issue or revoke them (gym_admin only).
     */
    private function assertGymStaff(Request $request, int $gym): void
    {
        abort_unless(
            GymAssignment::query()
                ->where('user_id', $request->user()->id)
                ->where('gym_id', $gym)
                ->whereIn('role', [GymAssignment::ROLE_GYM_ADMIN, GymAssignment::ROLE_STAFF])
                ->where('status', GymAssignment::STATUS_ACTIVE)
                ->exists(),
            404,
        );
    }

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
}
