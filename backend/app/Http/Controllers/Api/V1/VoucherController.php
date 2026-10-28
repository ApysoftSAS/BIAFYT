<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Concerns\PaginatesWithCursor;
use App\Http\Concerns\PresentsVouchers;
use App\Http\Controllers\Controller;
use App\Models\Voucher;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * The athlete's read-only view of the ecosystem vouchers issued to them by
 * a gym or a coach. The athlete cannot issue, redeem or revoke — those are
 * the issuer's actions (the money moves off the platform, so the issuer
 * confirms the redemption). Everything is self-scoped
 * (`where athlete_user_id = auth id`); another athlete's voucher is a 404.
 */
class VoucherController extends Controller
{
    use PaginatesWithCursor;
    use PresentsVouchers;

    /**
     * The authenticated athlete's vouchers, newest first. Optional
     * `?status=` filter over the stored status; a voucher past its
     * `expires_at` reads as `expired`. Cursor pagination (A2).
     */
    public function index(Request $request): JsonResponse
    {
        $status = $this->voucherStatusFilter($request);
        ['limit' => $limit, 'cursor' => $cursor] = $this->cursorPageParams($request, ['created_at', 'id']);

        $page = Voucher::query()
            ->where('athlete_user_id', $request->user()->id)
            ->when($status !== null, fn ($q) => $q->where('status', $status))
            ->with(['gym:id,name', 'coach:id,name'])
            ->orderByDesc('created_at')
            ->orderByDesc('id')
            ->cursorPaginate($limit, ['*'], 'cursor', $cursor);

        return response()->json([
            'vouchers' => $page->getCollection()->map(fn (Voucher $v) => $this->mapVoucher($v))->values(),
            'next_cursor' => $page->nextCursor()?->encode(),
            'has_more' => $page->hasMorePages(),
        ]);
    }

    public function show(Request $request, int $voucher): JsonResponse
    {
        $model = Voucher::query()
            ->where('athlete_user_id', $request->user()->id)
            ->with(['gym:id,name', 'coach:id,name'])
            ->findOrFail($voucher);

        return response()->json([
            'voucher' => $this->mapVoucher($model),
        ]);
    }
}
