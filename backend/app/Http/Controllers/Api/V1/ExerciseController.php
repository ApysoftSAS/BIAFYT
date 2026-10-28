<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Exercise;
use Illuminate\Http\JsonResponse;

class ExerciseController extends Controller
{
    /**
     * Return the full exercise catalog.
     */
    public function index(): JsonResponse
    {
        return response()->json([
            'exercises' => Exercise::all(),
        ]);
    }
}
