<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Concerns\PaginatesWithCursor;
use App\Http\Concerns\PresentsVouchers;
use App\Http\Controllers\Controller;
use App\Models\CoachAthleteRelationship;
use App\Models\Voucher;
use App\Support\Vouchers;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * A coach issues, lists, redeems and revokes ecosystem vouchers for an
 * athlete they have a currently `active` coach<->athlete relationship with.
 * The athlete redeems the benefit WITH the coach, off the platform.
 *
 * Authorization mirrors CoachAthleteController: every endpoint is gated by
 * `CoachAthleteRelationship::activeBetween($coach, $athlete)` — a missing /
 * pending / revoked relationship is a 404, never a 403. GymAssignment plays
 * no part. `athlete_user_id` is the route param, never the body; the coach
 * is the authenticated user, never the body.
 */
class CoachVoucherController extends Controller
{
    use PaginatesWithCursor;
    use PresentsVouchers;

    public function index(Request $request, int $athleteUserId): JsonResponse
    {
        $this->authorizeAthlete($request, $athleteUserId);

        $status = $this->voucherStatusFilter($request);
        ['limit' => $limit, 'cursor' => $cursor] = $this->cursorPageParams($request, ['created_at', 'id']);

        $page = Voucher::query()
            ->where('coach_user_id', $request->user()->id)
            ->where('athlete_user_id', $athleteUserId)
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

    public function store(Request $request, int $athleteUserId): JsonResponse
    {
        $this->authorizeAthlete($request, $athleteUserId);

        $voucher = Vouchers::issue(array_merge($this->validateVoucherPayload($request), [
            'gym_id' => null,
            'coach_user_id' => $request->user()->id,
            'issued_by_user_id' => $request->user()->id,
            'athlete_user_id' => $athleteUserId,
        ]));

        return response()->json([
            'voucher' => $this->mapVoucher($voucher->load(['coach:id,name', 'athlete:id,name'])),
        ], 201);
    }

    public function show(Request $request, int $athleteUserId, int $voucher): JsonResponse
    {
        $this->authorizeAthlete($request, $athleteUserId);

        return response()->json([
            'voucher' => $this->mapVoucher($this->resolve($request, $athleteUserId, $voucher)),
        ]);
    }

    public function redeem(Request $request, int $athleteUserId, int $voucher): JsonResponse
    {
        $this->authorizeAthlete($request, $athleteUserId);

        $note = $request->validate(['note' => ['nullable', 'string', 'max:2000']])['note'] ?? null;
        $updated = Vouchers::redeem($this->resolve($request, $athleteUserId, $voucher), $request->user(), $note);

        return response()->json([
            'voucher' => $this->mapVoucher($updated->load(['gym:id,name', 'coach:id,name', 'athlete:id,name'])),
        ]);
    }

    public function revoke(Request $request, int $athleteUserId, int $voucher): JsonResponse
    {
        $this->authorizeAthlete($request, $athleteUserId);

        $reason = $request->validate(['reason' => ['nullable', 'string', 'max:2000']])['reason'] ?? null;
        $updated = Vouchers::revoke($this->resolve($request, $athleteUserId, $voucher), $request->user(), $reason);

        return response()->json([
            'voucher' => $this->mapVoucher($updated->load(['gym:id,name', 'coach:id,name', 'athlete:id,name'])),
        ]);
    }

    /**
     * A voucher (a) for this athlete and (b) issued by this coach, or 404.
     * Anything else — another coach's voucher, another athlete's voucher —
     * is indistinguishable from a missing row.
     */
    private function resolve(Request $request, int $athleteUserId, int $voucher): Voucher
    {
        return Voucher::query()
            ->where('coach_user_id', $request->user()->id)
            ->where('athlete_user_id', $athleteUserId)
            ->with(['gym:id,name', 'coach:id,name', 'athlete:id,name'])
            ->findOrFail($voucher);
    }

    /**
     * Abort with 404 unless there is a currently `active` coach<->athlete
     * relationship with the authenticated user as coach (same gate as
     * CoachAthleteController::authorizedAthlete).
     */
    private function authorizeAthlete(Request $request, int $athleteUserId): void
    {
        abort_unless(
            CoachAthleteRelationship::activeBetween($request->user()->id, $athleteUserId),
            404,
        );
    }
}
