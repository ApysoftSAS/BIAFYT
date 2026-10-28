<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Concerns\PaginatesWithCursor;
use App\Http\Controllers\Controller;
use App\Http\Requests\StoreActivityRequest;
use App\Models\Activity;
use App\Models\PointTransaction;
use App\Support\PointRules;
use App\Support\StreakRules;
use Illuminate\Database\QueryException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class ActivityController extends Controller
{
    use PaginatesWithCursor;

    /**
     * Return a page of the authenticated user's activities, newest first.
     *
     * Cursor pagination (roadmap 3c / A2): `?limit=` (1..100, default 50)
     * and an opaque `?cursor=`. The first call with no parameters returns
     * the same first `limit` rows as before plus `next_cursor` / `has_more`.
     * The order is `finished_at DESC, id DESC` — the `id` tiebreaker keeps
     * pages from overlapping or skipping rows when timestamps collide.
     */
    public function index(Request $request): JsonResponse
    {
        ['limit' => $limit, 'cursor' => $cursor] = $this->cursorPageParams($request, ['finished_at', 'id']);

        $page = $request->user()->activities()
            ->with('pointTransactions')
            ->orderByDesc('finished_at')
            ->orderByDesc('id')
            ->cursorPaginate($limit, ['*'], 'cursor', $cursor);

        $activities = $page->getCollection()
            ->map(fn (Activity $activity) => $this->mapActivity($activity))
            ->values();

        return response()->json([
            'activities' => $activities,
            'next_cursor' => $page->nextCursor()?->encode(),
            'has_more' => $page->hasMorePages(),
        ]);
    }

    /**
     * Record a completed training session for the authenticated user and
     * award its points, atomically. The client submits only the facts of
     * the session; the point amount is derived by the backend
     * (App\Support\PointRules) and never accepted from the request.
     *
     * When `workout_id` is present it has already been checked in
     * StoreActivityRequest (owned by the user, finished, no existing
     * Activity). The `UNIQUE(activities.workout_id)` /
     * `UNIQUE(point_transactions.idempotency_key)` constraints remain the
     * last line of defense if a concurrent create slips past that check.
     *
     * Client idempotency (roadmap 3c / A1): when the client sends a
     * `client_uid`, a repeat POST for the same user + client_uid returns the
     * ALREADY created Activity with HTTP 200 — no second Activity, no second
     * `workout_completed` credit. The `UNIQUE(activities.user_id,
     * client_uid)` index is the final guarantee for two concurrent requests;
     * the loser catches the QueryException and returns the winner's
     * Activity. Posts without a `client_uid` keep the exact previous
     * behaviour (dedup only via UNIQUE(workout_id)).
     *
     * Streak bonus (roadmap 3c / A3): the bonus is derived from the
     * AUTHORITATIVE check-in streak (App\Support\StreakRules, the same
     * source as GET /me/streak), NOT from the request's `streak` field. The
     * frontend keeps `streak` as a monotonic local value; it may still be
     * sent for backward compatibility but is ignored for the point amount.
     */
    public function store(StoreActivityRequest $request): JsonResponse
    {
        $validated = $request->validated();
        $user = $request->user();

        $clientUid = $validated['client_uid'] ?? null;
        if (! is_string($clientUid) || $clientUid === '') {
            $clientUid = null;
        }

        // Pre-check: a prior POST with this client_uid already succeeded.
        // Optimisation only — the DB UNIQUE below is the real guarantee.
        if ($clientUid !== null) {
            $existing = $user->activities()->where('client_uid', $clientUid)->first();

            if ($existing !== null) {
                $existing->load('pointTransactions');

                return response()->json(['activity' => $this->mapActivity($existing)], 200);
            }
        }

        try {
            $activity = DB::transaction(function () use ($user, $validated, $clientUid) {
                $activity = $user->activities()->create([
                    'workout_id' => $validated['workout_id'] ?? null,
                    'client_uid' => $clientUid,
                    'routine_label' => $validated['routine_label'] ?? null,
                    'started_at' => $validated['started_at'],
                    'finished_at' => $validated['finished_at'],
                    'duration_seconds' => $validated['duration_seconds'],
                    'sets_completed' => $validated['sets_completed'],
                    'exercises_completed' => $validated['exercises_completed'],
                ]);

                // A3: authoritative streak, computed exactly like
                // StreakController@show — from the user's own check-ins, not
                // from `$validated['streak']` (kept accepted, ignored here).
                $currentStreak = StreakRules::fromDates(
                    $user->checkIns()->orderBy('check_in_date')->pluck('check_in_date'),
                    now()->toDateString(),
                )['current_streak'];

                $amount = PointRules::forActivity(
                    (int) $validated['sets_completed'],
                    (int) $validated['exercises_completed'],
                    $currentStreak,
                );

                // Keyed on user + client_uid when present (a client_uid may
                // repeat across users, and point_transactions.idempotency_key
                // is globally unique). Legacy posts keep "activity:{id}".
                $idempotencyKey = $clientUid !== null
                    ? "activity:{$activity->user_id}:{$clientUid}"
                    : "activity:{$activity->id}";

                $activity->pointTransactions()->create([
                    'user_id' => $activity->user_id,
                    'amount' => $amount,
                    'reason' => PointTransaction::REASON_WORKOUT_COMPLETED,
                    'idempotency_key' => $idempotencyKey,
                ]);

                return $activity;
            });
        } catch (QueryException) {
            // A concurrent create raced past the pre-checks and hit a UNIQUE
            // constraint: nothing was persisted (the transaction rolled
            // back). If it was the same user + client_uid, the winning
            // request already created the Activity — return that, with no
            // second credit. Otherwise it is the UNIQUE(workout_id) case:
            // same 422 as before.
            if ($clientUid !== null) {
                $existing = $user->activities()->where('client_uid', $clientUid)->first();

                if ($existing !== null) {
                    $existing->load('pointTransactions');

                    return response()->json(['activity' => $this->mapActivity($existing)], 200);
                }
            }

            throw ValidationException::withMessages([
                'workout_id' => ['This workout already has an activity.'],
            ]);
        }

        $activity->load('pointTransactions');

        return response()->json([
            'activity' => $this->mapActivity($activity),
        ], 201);
    }

    /**
     * @return array<string, mixed>
     */
    private function mapActivity(Activity $activity): array
    {
        return [
            'id' => $activity->id,
            'workout_id' => $activity->workout_id,
            'routine_label' => $activity->routine_label,
            'started_at' => $activity->started_at,
            'finished_at' => $activity->finished_at,
            'duration_seconds' => $activity->duration_seconds,
            'sets_completed' => $activity->sets_completed,
            'exercises_completed' => $activity->exercises_completed,
            // Derived from the ledger — the ledger is the single source of
            // truth, so points are not stored a second time on the activity.
            'points_awarded' => (int) $activity->pointTransactions->sum('amount'),
            'created_at' => $activity->created_at,
        ];
    }
}
