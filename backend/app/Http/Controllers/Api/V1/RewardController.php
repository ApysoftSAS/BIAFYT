<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\PointTransaction;
use App\Models\RewardClaim;
use App\Support\RewardRules;
use Illuminate\Database\QueryException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class RewardController extends Controller
{
    /**
     * Return the authenticated user's reward claims, newest first. Not
     * paginated in this phase (same registered debt as the other /me/* list
     * endpoints).
     */
    public function index(Request $request): JsonResponse
    {
        $claims = $request->user()->rewardClaims()
            ->orderByDesc('created_at')
            ->orderByDesc('id')
            ->get()
            ->map(fn (RewardClaim $claim) => $this->mapClaim($claim))
            ->values();

        return response()->json([
            'reward_claims' => $claims,
        ]);
    }

    /**
     * Record a prize redemption for the authenticated user and debit its
     * cost from the points ledger, atomically. SHADOW MODE: this does NOT
     * verify the prize's unlock condition (rank, points threshold, duels
     * won, ...) — that stays frontend-only. It only checks that `prize_id`
     * is a known prize, that `reward_uid` has not already been claimed
     * (idempotency for a retried write-through POST), and that the user's
     * ledger balance covers the cost.
     *
     * The client sends `prize_id` + `reward_uid` only. The cost comes from
     * App\Support\RewardRules; `cost`/`points`/`amount`/`user_id` are never
     * read from the request.
     */
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'prize_id' => ['required', 'string'],
            'reward_uid' => ['required', 'string', 'max:64'],
        ]);

        $user = $request->user();
        $prizeId = $validated['prize_id'];
        $rewardUid = $validated['reward_uid'];

        $cost = RewardRules::costFor($prizeId);

        if ($cost === null) {
            throw ValidationException::withMessages([
                'prize_id' => ['This prize does not exist.'],
            ]);
        }

        if ($user->rewardClaims()->where('reward_uid', $rewardUid)->exists()) {
            throw ValidationException::withMessages([
                'reward_uid' => ['This reward has already been claimed.'],
            ]);
        }

        $balance = (int) $user->pointTransactions()->sum('amount');

        if ($cost > $balance) {
            throw ValidationException::withMessages([
                'prize_id' => ['Insufficient points balance for this prize.'],
            ]);
        }

        try {
            $claim = DB::transaction(function () use ($user, $prizeId, $rewardUid, $cost) {
                $claim = $user->rewardClaims()->create([
                    'prize_id' => $prizeId,
                    'reward_uid' => $rewardUid,
                    'cost' => $cost,
                ]);

                $claim->pointTransactions()->create([
                    'user_id' => $user->id,
                    'amount' => -$cost,
                    'reason' => PointTransaction::REASON_REWARD_CLAIMED,
                    'idempotency_key' => "reward:{$user->id}:{$rewardUid}",
                ]);

                return $claim;
            });
        } catch (QueryException) {
            // A concurrent request raced past the pre-checks and hit
            // UNIQUE(user_id, reward_uid) / UNIQUE(idempotency_key). Same
            // last-line-of-defense pattern as the other write-through phases.
            throw ValidationException::withMessages([
                'reward_uid' => ['This reward has already been claimed.'],
            ]);
        }

        return response()->json([
            'reward_claim' => $this->mapClaim($claim),
        ], 201);
    }

    /**
     * @return array<string, mixed>
     */
    private function mapClaim(RewardClaim $claim): array
    {
        return [
            'id' => $claim->id,
            'prize_id' => $claim->prize_id,
            'cost' => $claim->cost,
            'created_at' => $claim->created_at,
        ];
    }
}
