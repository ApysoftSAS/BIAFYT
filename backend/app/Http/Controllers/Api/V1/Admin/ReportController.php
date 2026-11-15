<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Support\PlatformReport;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * Platform-wide report for BIAFYT Admin. Gated by `User::is_platform_admin`
 * (404 otherwise, like every /admin/* endpoint). Aggregate numbers only.
 */
class ReportController extends Controller
{
    public function show(Request $request): JsonResponse
    {
        abort_unless((bool) $request->user()->is_platform_admin, 404);

        $validated = $request->validate([
            'days' => ['sometimes', 'integer', Rule::in(PlatformReport::PERIODS)],
        ]);

        return response()->json(['report' => PlatformReport::build((int) ($validated['days'] ?? 30))]);
    }
}
