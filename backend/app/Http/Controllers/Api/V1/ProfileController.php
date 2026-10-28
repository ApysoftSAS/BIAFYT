<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ProfileController extends Controller
{
    /**
     * Return the authenticated user's profile.
     */
    public function show(Request $request): JsonResponse
    {
        return response()->json([
            'profile' => $request->user()->profile,
        ]);
    }

    /**
     * Create or partially update the authenticated user's profile.
     *
     * A field omitted from the payload is left unchanged. A field sent
     * explicitly as `null` clears the stored value, since every profile
     * field is nullable.
     */
    public function update(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'age' => ['nullable', 'integer', 'between:12,100'],
            'weight' => ['nullable', 'numeric', 'between:20,400'],
            'height' => ['nullable', 'numeric', 'between:100,250'],
            'months_training' => ['nullable', 'integer', 'min:0'],
            'level' => ['nullable', 'string', 'max:50'],
            'focus_id' => ['nullable', 'string', 'max:50'],
        ]);

        $profile = $request->user()->profile()->updateOrCreate([], $validated);

        return response()->json([
            'profile' => $profile,
        ]);
    }
}
