<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\Branch;
use App\Models\Gym;
use App\Models\GymAssignment;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * The BIAFYT Admin's minimal, read-only view of the gyms on the platform.
 * Gated by `User::is_platform_admin` (404 otherwise). No personal data — only
 * gym names, branches and active-role counts.
 */
class GymController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        abort_unless((bool) $request->user()->is_platform_admin, 404);

        $activeRole = fn (string $role) => fn (Builder $query) => $query
            ->where('role', $role)
            ->where('status', GymAssignment::STATUS_ACTIVE);

        $gyms = Gym::query()
            ->with('branches')
            ->withCount([
                'gymAssignments as gym_admin_count' => $activeRole(GymAssignment::ROLE_GYM_ADMIN),
                'gymAssignments as coach_count' => $activeRole(GymAssignment::ROLE_COACH),
                'gymAssignments as member_count' => $activeRole(GymAssignment::ROLE_MEMBER),
            ])
            ->orderBy('name')
            ->get()
            ->map(fn (Gym $gym) => [
                'id' => $gym->id,
                'name' => $gym->name,
                'branches' => $gym->branches
                    ->map(fn (Branch $branch) => ['id' => $branch->id, 'name' => $branch->name])
                    ->values(),
                'gym_admin_count' => $gym->gym_admin_count,
                'coach_count' => $gym->coach_count,
                'member_count' => $gym->member_count,
                'created_at' => $gym->created_at,
            ])
            ->values();

        return response()->json([
            'gyms' => $gyms,
        ]);
    }
}
