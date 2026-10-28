<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Branch;
use App\Models\Gym;
use Illuminate\Http\JsonResponse;

class GymController extends Controller
{
    /**
     * Return the full gym catalog, with each gym's branches nested inside it.
     */
    public function index(): JsonResponse
    {
        $gyms = Gym::with('branches')->orderBy('name')->get()
            ->map(fn (Gym $gym) => [
                'id' => $gym->id,
                'name' => $gym->name,
                'branches' => $gym->branches
                    ->map(fn (Branch $branch) => [
                        'id' => $branch->id,
                        'name' => $branch->name,
                    ])
                    ->values(),
            ])
            ->values();

        return response()->json([
            'gyms' => $gyms,
        ]);
    }
}
