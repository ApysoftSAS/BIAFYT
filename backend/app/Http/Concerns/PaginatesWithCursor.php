<?php

namespace App\Http\Concerns;

use Illuminate\Http\Request;
use Illuminate\Pagination\Cursor;
use Illuminate\Validation\ValidationException;

/**
 * Shared query-string handling for the project's cursor-paginated list
 * endpoints (roadmap 3c / A2): an optional `?limit=` (1..MAX_PAGE_SIZE,
 * DEFAULT_PAGE_SIZE when absent) and an optional opaque `?cursor=` string.
 *
 * The endpoint keeps its own deterministic `ORDER BY` — always a real
 * column plus `id` as a tiebreaker, so pages never overlap, skip a row, or
 * repeat one when timestamps collide — passes the resolved `limit` /
 * `cursor` to Eloquent's `cursorPaginate()`, and shapes the response
 * itself as `{ <items>, next_cursor, has_more }`.
 *
 * A malformed cursor, a cursor built for a different ordering, or an
 * out-of-range `limit` is a 422 — never a silent fall back to page one.
 * The cursor only ever carries the boundary row's column values; the query
 * stays scoped to the authenticated user, so a cursor can never reach
 * another user's rows.
 */
trait PaginatesWithCursor
{
    /** Page size used when `?limit=` is not supplied. */
    public const DEFAULT_PAGE_SIZE = 50;

    /** Hard cap on `?limit=`; a larger value is rejected with 422. */
    public const MAX_PAGE_SIZE = 100;

    /**
     * Validate `limit` / `cursor` for a query ordered by `$orderColumns`
     * (in the same order they appear in the `ORDER BY`).
     *
     * @param  list<string>  $orderColumns
     * @return array{limit: int, cursor: string|null}
     */
    protected function cursorPageParams(Request $request, array $orderColumns): array
    {
        $validated = $request->validate([
            'limit' => ['sometimes', 'integer', 'min:1', 'max:'.self::MAX_PAGE_SIZE],
            'cursor' => ['sometimes', 'string'],
        ]);

        $rawCursor = $validated['cursor'] ?? null;

        if ($rawCursor !== null && ! $this->cursorMatchesOrdering($rawCursor, $orderColumns)) {
            throw ValidationException::withMessages([
                'cursor' => ['The cursor is invalid.'],
            ]);
        }

        return [
            'limit' => (int) ($validated['limit'] ?? self::DEFAULT_PAGE_SIZE),
            'cursor' => $rawCursor,
        ];
    }

    /**
     * True when the encoded cursor decodes and carries exactly the columns
     * this endpoint orders by.
     *
     * @param  list<string>  $orderColumns
     */
    private function cursorMatchesOrdering(string $encoded, array $orderColumns): bool
    {
        $decoded = Cursor::fromEncoded($encoded);

        if ($decoded === null) {
            return false;
        }

        foreach ($orderColumns as $column) {
            try {
                $decoded->parameter($column);
            } catch (\UnexpectedValueException) {
                return false;
            }
        }

        return true;
    }
}
