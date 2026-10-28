<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Concerns\PaginatesWithCursor;
use App\Http\Controllers\Controller;
use App\Models\PointTransaction;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class PointController extends Controller
{
    use PaginatesWithCursor;

    /**
     * Return the authenticated user's authoritative points balance and a
     * page of their ledger, newest first. `balance` is always computed as
     * `SUM(point_transactions.amount)` over the WHOLE ledger for the user —
     * never over the returned page.
     *
     * Cursor pagination (roadmap 3c / A2): `?limit=` (1..100, default 50)
     * and an opaque `?cursor=`. The first call with no parameters returns
     * the same first `limit` rows as before plus `next_cursor` / `has_more`.
     * The order is `created_at DESC, id DESC` — the `id` tiebreaker keeps
     * pages from overlapping or skipping rows when timestamps collide.
     *
     * The ledger has no write endpoint: it is append-only, populated only
     * as a side effect of the events that grant points.
     */
    public function show(Request $request): JsonResponse
    {
        $user = $request->user();

        ['limit' => $limit, 'cursor' => $cursor] = $this->cursorPageParams($request, ['created_at', 'id']);

        $page = $user->pointTransactions()
            ->orderByDesc('created_at')
            ->orderByDesc('id')
            ->cursorPaginate($limit, ['*'], 'cursor', $cursor);

        $transactions = $page->getCollection()
            ->map(fn (PointTransaction $transaction) => [
                'id' => $transaction->id,
                'amount' => $transaction->amount,
                'reason' => $transaction->reason,
                // Short form, never the morph FQCN (e.g. 'activity').
                'source_type' => $transaction->source_type === null
                    ? null
                    : Str::snake(class_basename($transaction->source_type)),
                'source_id' => $transaction->source_id,
                'created_at' => $transaction->created_at,
            ])
            ->values();

        return response()->json([
            // The whole-ledger balance — independent of the requested page.
            'balance' => (int) $user->pointTransactions()->sum('amount'),
            'transactions' => $transactions,
            'next_cursor' => $page->nextCursor()?->encode(),
            'has_more' => $page->hasMorePages(),
        ]);
    }
}
