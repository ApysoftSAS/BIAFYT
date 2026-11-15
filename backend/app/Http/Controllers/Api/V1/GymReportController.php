<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Branch;
use App\Models\GymAssignment;
use App\Support\GymReport;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * Administrative report of the gym (attendance, peak hours, members at
 * risk…). Read-only, gated like every `me/gym/{gym}/*` endpoint: only an
 * active `gym_admin` of `{gym}`; anyone else gets 404 (never 403).
 * See App\Support\GymReport for exactly what the numbers mean.
 */
class GymReportController extends Controller
{
    public function show(Request $request, int $gym): JsonResponse
    {
        $this->assertGymAdmin($request, $gym);

        $validated = $request->validate([
            'days' => ['sometimes', 'integer', Rule::in(GymReport::PERIODS)],
            'branch_id' => ['sometimes', 'nullable', 'integer'],
        ]);

        $branchId = $validated['branch_id'] ?? null;

        if ($branchId !== null && ! Branch::where('gym_id', $gym)->whereKey($branchId)->exists()) {
            throw ValidationException::withMessages([
                'branch_id' => ['This branch does not belong to the indicated gym.'],
            ]);
        }

        return response()->json([
            'report' => GymReport::build($gym, (int) ($validated['days'] ?? 30), $branchId),
        ]);
    }

    // Same gate as GymAdminController/GymVoucherController (third copy: extract
    // a shared helper if another gym_admin surface appears).
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
