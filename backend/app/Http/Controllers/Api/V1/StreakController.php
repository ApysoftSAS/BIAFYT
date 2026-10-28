<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Support\StreakRules;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

class StreakController extends Controller
{
    /**
     * Return the authenticated user's authoritative check-in streak,
     * computed exclusively from their own `check_ins` (see StreakRules).
     * The client sends nothing; `user_id`, dates and the streak value are
     * never accepted from the request.
     *
     * This is the backend-authoritative value for a future flip — it does
     * not (yet) change points or the frontend's local streak.
     */
    public function show(Request $request): JsonResponse
    {
        $dates = $request->user()->checkIns()
            ->orderBy('check_in_date')
            ->pluck('check_in_date');

        return response()->json(
            StreakRules::fromDates($dates, Carbon::now()->toDateString())
        );
    }
}
