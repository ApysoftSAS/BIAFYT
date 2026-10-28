<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\ChallengeClaim;
use App\Models\PointTransaction;
use App\Support\ChallengeRules;
use Illuminate\Database\QueryException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class ChallengeController extends Controller
{
    /**
     * Return the authenticated user's challenge claims, newest first. Not
     * paginated in this phase (same registered debt as the other /me/* list
     * endpoints).
     */
    public function index(Request $request): JsonResponse
    {
        $claims = $request->user()->challengeClaims()
            ->orderByDesc('challenge_date')
            ->orderByDesc('id')
            ->get()
            ->map(fn (ChallengeClaim $claim) => $this->mapClaim($claim))
            ->values();

        return response()->json([
            'challenge_claims' => $claims,
        ]);
    }

    /**
     * Record a daily challenge claim for the authenticated user and credit
     * its reward to the points ledger, atomically. SHADOW MODE: this does
     * NOT verify the challenge was completed — completion is computed
     * frontend-side. It only checks that `challenge_id` is one of the three
     * challenges for `challenge_date` and has not been claimed yet.
     *
     * The client sends `challenge_id` + `challenge_date` only. The reward
     * amount comes from `App\Support\ChallengeRules`; `points`/`amount`/
     * `user_id` are never read from the request.
     */
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'challenge_id' => ['required', 'string'],
            'challenge_date' => ['required', 'string', 'date_format:Y-m-d'],
        ]);

        $user = $request->user();
        $challengeId = $validated['challenge_id'];
        $date = $validated['challenge_date'];

        if ($date > Carbon::now()->toDateString()) {
            throw ValidationException::withMessages([
                'challenge_date' => ['challenge_date cannot be in the future.'],
            ]);
        }

        $reward = ChallengeRules::rewardFor($challengeId, $date);

        if ($reward === null) {
            throw ValidationException::withMessages([
                'challenge_id' => ['This challenge is not one of the challenges for challenge_date.'],
            ]);
        }

        if ($user->challengeClaims()
            ->where('challenge_date', $date)
            ->where('challenge_id', $challengeId)
            ->exists()) {
            throw ValidationException::withMessages([
                'challenge_id' => ['This challenge has already been claimed for this date.'],
            ]);
        }

        try {
            $claim = DB::transaction(function () use ($user, $challengeId, $date, $reward) {
                $claim = $user->challengeClaims()->create([
                    'challenge_id' => $challengeId,
                    'challenge_date' => $date,
                ]);

                $claim->pointTransactions()->create([
                    'user_id' => $user->id,
                    'amount' => $reward,
                    'reason' => PointTransaction::REASON_CHALLENGE_CLAIMED,
                    'idempotency_key' => "challenge:{$user->id}:{$date}:{$challengeId}",
                ]);

                return $claim;
            });
        } catch (QueryException) {
            // A concurrent request raced past the pre-check and hit
            // UNIQUE(user_id, challenge_date, challenge_id) / UNIQUE(idempotency_key).
            // Same last-line-of-defense pattern as the other write-through phases.
            throw ValidationException::withMessages([
                'challenge_id' => ['This challenge has already been claimed for this date.'],
            ]);
        }

        return response()->json([
            'challenge_claim' => $this->mapClaim($claim),
        ], 201);
    }

    /**
     * @return array<string, mixed>
     */
    private function mapClaim(ChallengeClaim $claim): array
    {
        return [
            'id' => $claim->id,
            'challenge_id' => $claim->challenge_id,
            'challenge_date' => $claim->challenge_date,
            'created_at' => $claim->created_at,
        ];
    }
}
