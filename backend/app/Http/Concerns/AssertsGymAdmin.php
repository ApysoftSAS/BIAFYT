<?php

namespace App\Http\Concerns;

use App\Models\GymAssignment;
use Illuminate\Http\Request;

/**
 * The `gym_admin` gate shared by the newer gym controllers: 404 unless the
 * caller is an ACTIVE gym_admin of the `{gym}` in the route (never 403).
 * (GymAdminController and GymVoucherController keep their own private copies;
 * folding them into this trait is a pure refactor left for later.)
 */
trait AssertsGymAdmin
{
    protected function assertGymAdmin(Request $request, int $gym): void
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
