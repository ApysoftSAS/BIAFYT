<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\CheckIn;
use App\Models\PointTransaction;
use App\Support\PointRules;
use Illuminate\Database\QueryException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class CheckInController extends Controller
{
    /**
     * Return the authenticated user's check-ins, newest first. Not
     * paginated in this phase (same registered debt as GET /me/workouts,
     * GET /me/activities, GET /me/points).
     */
    public function index(Request $request): JsonResponse
    {
        $checkIns = $request->user()->checkIns()
            ->orderByDesc('check_in_date')
            ->orderByDesc('id')
            ->get()
            ->map(fn (CheckIn $checkIn) => $this->mapCheckIn($checkIn))
            ->values();

        return response()->json([
            'check_ins' => $checkIns,
        ]);
    }

    /**
     * Record today's check-in for the authenticated user and credit the
     * flat `checkin` amount to the points ledger, atomically. The client
     * sends no body: `user_id` comes from the token, the amount from
     * `PointRules::CHECKIN` (never from the request).
     *
     * One check-in per calendar day: a pre-check plus
     * `UNIQUE(check_ins.user_id, check_in_date)` /
     * `UNIQUE(point_transactions.idempotency_key)` as the last line of
     * defense. A second attempt the same day is a 422, never a 500, with
     * nothing persisted.
     */
    public function store(Request $request): JsonResponse
    {
        $user = $request->user();
        $today = Carbon::now()->toDateString();

        if ($user->checkIns()->where('check_in_date', $today)->exists()) {
            throw ValidationException::withMessages([
                'check_in' => ['You have already checked in today.'],
            ]);
        }

        try {
            $checkIn = DB::transaction(function () use ($user, $today) {
                $checkIn = $user->checkIns()->create([
                    'check_in_date' => $today,
                    'checked_in_at' => Carbon::now(),
                ]);

                $checkIn->pointTransactions()->create([
                    'user_id' => $user->id,
                    'amount' => PointRules::CHECKIN,
                    'reason' => PointTransaction::REASON_CHECKIN,
                    'idempotency_key' => "checkin:{$user->id}:{$today}",
                ]);

                return $checkIn;
            });
        } catch (QueryException) {
            // A concurrent request raced past the pre-check and hit
            // UNIQUE(user_id, check_in_date) / UNIQUE(idempotency_key).
            // Same last-line-of-defense pattern as Programs/Workout/Activity.
            throw ValidationException::withMessages([
                'check_in' => ['You have already checked in today.'],
            ]);
        }

        return response()->json([
            'check_in' => $this->mapCheckIn($checkIn),
        ], 201);
    }

    /**
     * Set `checked_out_at` on today's check-in for the authenticated user.
     * 404 if there is no check-in for today (the addressed resource does
     * not exist); 422 if it has already been checked out.
     */
    public function checkOut(Request $request): JsonResponse
    {
        $user = $request->user();
        $today = Carbon::now()->toDateString();

        $checkIn = $user->checkIns()->where('check_in_date', $today)->first();

        if (! $checkIn) {
            abort(404, 'There is no check-in for today.');
        }

        if ($checkIn->checked_out_at !== null) {
            throw ValidationException::withMessages([
                'check_out' => ['You have already checked out today.'],
            ]);
        }

        $checkIn->update(['checked_out_at' => Carbon::now()]);

        return response()->json([
            'check_in' => $this->mapCheckIn($checkIn),
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    private function mapCheckIn(CheckIn $checkIn): array
    {
        return [
            'id' => $checkIn->id,
            'check_in_date' => $checkIn->check_in_date,
            'checked_in_at' => $checkIn->checked_in_at,
            'checked_out_at' => $checkIn->checked_out_at,
            'created_at' => $checkIn->created_at,
        ];
    }
}
