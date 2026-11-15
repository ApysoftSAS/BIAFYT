<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Support\CoachReport;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * The authenticated coach's report over their own athletes. Scoped to the
 * token's user by construction (no id in the URL); a user with no athletes
 * simply gets zeros.
 */
class CoachReportController extends Controller
{
    public function show(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'days' => ['sometimes', 'integer', Rule::in(CoachReport::PERIODS)],
        ]);

        return response()->json([
            'report' => CoachReport::build($request->user(), (int) ($validated['days'] ?? 30)),
        ]);
    }
}
