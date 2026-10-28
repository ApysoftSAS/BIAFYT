<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Duel;
use App\Models\DuelRun;
use App\Models\GymAssignment;
use App\Models\PointTransaction;
use App\Models\User;
use App\Support\DuelRules;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Real duels (roadmap 3b). Participants are real users; every read/write is
 * scoped to the authenticated user as challenger or opponent — a non-
 * participant always gets a 404, never a 403, and `challenger_user_id` /
 * `winner_user_id` / `stake` / `status` are never read from the client.
 *
 * Points: `stake` mirrors the frontend's LocalStorage bet. On resolution
 * the backend writes a best-effort PointTransaction per participant
 * (duel_won / duel_lost) — the ledger's 5th source — but the visible
 * balance is still LocalStorage (no 3c flip).
 */
class DuelController extends Controller
{
    /** Standing (not terminal) statuses — one duel per pair at a time. */
    private const STANDING_STATUSES = [
        Duel::STATUS_PENDING,
        Duel::STATUS_ACCEPTED,
        Duel::STATUS_IN_PROGRESS,
    ];

    /**
     * Every duel the authenticated user takes part in, on either side,
     * newest first.
     */
    public function index(Request $request): JsonResponse
    {
        $userId = $request->user()->id;

        $duels = Duel::query()
            ->where('challenger_user_id', $userId)
            ->orWhere('opponent_user_id', $userId)
            ->with(['challenger:id,name', 'opponent:id,name', 'runs'])
            ->orderByDesc('id')
            ->get()
            ->map(fn (Duel $duel) => $this->mapDuel($duel, $userId))
            ->values();

        return response()->json(['duels' => $duels]);
    }

    /**
     * Real users the authenticated user can challenge: other users with an
     * active gym assignment (any role) in a gym where the authenticated
     * user also holds an active assignment, excluding self and anyone with
     * whom a standing duel already exists. Empty when the user has no
     * active gym membership.
     */
    public function opponents(Request $request): JsonResponse
    {
        $userId = $request->user()->id;

        $myGymIds = GymAssignment::query()
            ->where('user_id', $userId)
            ->where('status', GymAssignment::STATUS_ACTIVE)
            ->pluck('gym_id')
            ->unique();

        if ($myGymIds->isEmpty()) {
            return response()->json(['opponents' => []]);
        }

        $candidateIds = GymAssignment::query()
            ->whereIn('gym_id', $myGymIds)
            ->where('status', GymAssignment::STATUS_ACTIVE)
            ->where('user_id', '!=', $userId)
            ->pluck('user_id')
            ->unique();

        $standingPartnerIds = Duel::query()
            ->whereIn('status', self::STANDING_STATUSES)
            ->where(function ($query) use ($userId) {
                $query->where('challenger_user_id', $userId)->orWhere('opponent_user_id', $userId);
            })
            ->get(['challenger_user_id', 'opponent_user_id'])
            ->flatMap(fn (Duel $duel) => [$duel->challenger_user_id, $duel->opponent_user_id])
            ->unique();

        $eligibleIds = $candidateIds->diff($standingPartnerIds)->values();

        $users = User::query()
            ->whereIn('id', $eligibleIds)
            ->orderBy('name')
            ->get(['id', 'name']);

        $records = $this->finishedRecords($eligibleIds->all());

        $opponents = $users->map(fn (User $user) => [
            'id' => $user->id,
            'name' => $user->name,
            'duels_won' => $records[$user->id]['won'] ?? 0,
            'duels_lost' => $records[$user->id]['lost'] ?? 0,
        ])->values();

        return response()->json(['opponents' => $opponents]);
    }

    /**
     * Create a duel. The authenticated user is always the challenger.
     * Requires the opponent to share an active gym with the challenger.
     *
     * Stake bound (roadmap 3c / A4): the stake cannot exceed the
     * challenger's AVAILABLE points — the authoritative ledger balance
     * (SUM(point_transactions.amount)) minus the stake already committed to
     * the challenger's own open duels. Duel creation writes nothing to the
     * ledger; this check is what keeps a later resolution from driving the
     * balance negative for the single-participant case.
     *
     * Residual concurrency risk (accepted, minimal-safe per the phase
     * brief): two simultaneous `POST /me/duels` from the same challenger can
     * each read the same available balance and both pass, over-committing
     * the balance. There is no per-user ledger row to lock without a larger
     * refactor. The opponent side is also not bounded here (stake is
     * committed on accept, a different endpoint). See PROJECT_STATE.
     */
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'opponent_user_id' => ['required', 'integer', 'exists:users,id'],
            'modality' => ['required', 'string'],
            'stake' => ['required', 'integer', 'min:0'],
        ]);

        $challengerId = $request->user()->id;
        $opponentId = (int) $validated['opponent_user_id'];
        $modality = $validated['modality'];
        $stake = (int) $validated['stake'];

        if ($opponentId === $challengerId) {
            throw ValidationException::withMessages([
                'opponent_user_id' => ['You cannot duel yourself.'],
            ]);
        }

        if (! DuelRules::isModality($modality)) {
            throw ValidationException::withMessages([
                'modality' => ['Unknown duel modality.'],
            ]);
        }

        if ($stake > DuelRules::maxStake($modality)) {
            throw ValidationException::withMessages([
                'stake' => ['The stake exceeds the maximum for this modality.'],
            ]);
        }

        // A4: stake must fit the challenger's available points — the whole
        // ledger balance minus what is already staked on their own open
        // duels (they could still lose those).
        $balance = (int) $request->user()->pointTransactions()->sum('amount');
        $committedStake = (int) Duel::query()
            ->where('challenger_user_id', $challengerId)
            ->whereIn('status', self::STANDING_STATUSES)
            ->sum('stake');

        if ($stake > $balance - $committedStake) {
            throw ValidationException::withMessages([
                'stake' => ['The stake exceeds your available points balance.'],
            ]);
        }

        $sharedGymId = $this->sharedActiveGymId($challengerId, $opponentId);

        if ($sharedGymId === null) {
            throw ValidationException::withMessages([
                'opponent_user_id' => ['You can only duel someone from a gym you both belong to.'],
            ]);
        }

        $hasStanding = Duel::query()
            ->whereIn('status', self::STANDING_STATUSES)
            ->where(function ($query) use ($challengerId, $opponentId) {
                $query->where(function ($q) use ($challengerId, $opponentId) {
                    $q->where('challenger_user_id', $challengerId)->where('opponent_user_id', $opponentId);
                })->orWhere(function ($q) use ($challengerId, $opponentId) {
                    $q->where('challenger_user_id', $opponentId)->where('opponent_user_id', $challengerId);
                });
            })
            ->exists();

        if ($hasStanding) {
            throw ValidationException::withMessages([
                'opponent_user_id' => ['You already have an open duel with this user.'],
            ]);
        }

        $duel = Duel::create([
            'challenger_user_id' => $challengerId,
            'opponent_user_id' => $opponentId,
            'gym_id' => $sharedGymId,
            'modality' => $modality,
            'stake' => $stake,
            'status' => Duel::STATUS_PENDING,
        ]);

        return response()->json([
            'duel' => $this->mapDuel($duel->load(['challenger:id,name', 'opponent:id,name', 'runs']), $challengerId),
        ], 201);
    }

    /**
     * Show a single duel the authenticated user takes part in.
     */
    public function show(Request $request, int $duel): JsonResponse
    {
        $userId = $request->user()->id;
        $model = $this->findParticipantDuel($userId, $duel);

        return response()->json([
            'duel' => $this->mapDuel($model->load(['challenger:id,name', 'opponent:id,name', 'runs']), $userId),
        ]);
    }

    /**
     * Accept a pending duel. Only the opponent may accept.
     */
    public function accept(Request $request, int $duel): JsonResponse
    {
        $userId = $request->user()->id;
        $model = $this->findParticipantDuel($userId, $duel);

        if ((int) $model->opponent_user_id !== $userId) {
            throw ValidationException::withMessages(['status' => ['Only the challenged user can accept this duel.']]);
        }

        if ($model->status !== Duel::STATUS_PENDING) {
            throw ValidationException::withMessages(['status' => ['Only a pending duel can be accepted.']]);
        }

        $model->update(['status' => Duel::STATUS_ACCEPTED, 'accepted_at' => now()]);

        return $this->show($request, $duel);
    }

    /**
     * Reject a pending duel. Only the opponent may reject.
     */
    public function reject(Request $request, int $duel): JsonResponse
    {
        $userId = $request->user()->id;
        $model = $this->findParticipantDuel($userId, $duel);

        if ((int) $model->opponent_user_id !== $userId) {
            throw ValidationException::withMessages(['status' => ['Only the challenged user can reject this duel.']]);
        }

        if ($model->status !== Duel::STATUS_PENDING) {
            throw ValidationException::withMessages(['status' => ['Only a pending duel can be rejected.']]);
        }

        $model->update(['status' => Duel::STATUS_REJECTED, 'finished_at' => now()]);

        return $this->show($request, $duel);
    }

    /**
     * Cancel a duel that has not finished. Only the challenger may cancel.
     *
     * ponytail: no time-based expiry — a duel just stays open until the
     * challenger walks away. Add a sweep when stale duels actually matter.
     */
    public function cancel(Request $request, int $duel): JsonResponse
    {
        $userId = $request->user()->id;
        $model = $this->findParticipantDuel($userId, $duel);

        if ((int) $model->challenger_user_id !== $userId) {
            throw ValidationException::withMessages(['status' => ['Only the challenger can cancel this duel.']]);
        }

        if (! in_array($model->status, Duel::CANCELLABLE_STATUSES, true)) {
            throw ValidationException::withMessages(['status' => ['This duel can no longer be cancelled.']]);
        }

        $model->update(['status' => Duel::STATUS_CANCELLED, 'finished_at' => now()]);

        return $this->show($request, $duel);
    }

    /**
     * Submit the authenticated participant's run. When both participants
     * have submitted, the duel resolves (finished with a winner, or
     * unvalidated if either run was not competitive-eligible).
     */
    public function run(Request $request, int $duel): JsonResponse
    {
        $validated = $request->validate([
            'duration_seconds' => ['required', 'integer', 'min:0'],
            'exercises_completed' => ['required', 'integer', 'min:0'],
            'sets_completed' => ['required', 'integer', 'min:0'],
            'valid_reps' => ['required', 'integer', 'min:0'],
            'consistency' => ['required', 'integer', 'min:0', 'max:100'],
            'penalties' => ['required', 'integer', 'min:0'],
            'competitive_eligible' => ['required', 'boolean'],
        ]);

        $userId = $request->user()->id;
        $model = $this->findParticipantDuel($userId, $duel);

        if (! in_array($model->status, Duel::RUNNABLE_STATUSES, true)) {
            throw ValidationException::withMessages(['status' => ['This duel is not accepting runs.']]);
        }

        if ($model->runs()->where('user_id', $userId)->exists()) {
            throw ValidationException::withMessages(['run' => ['You have already submitted your run for this duel.']]);
        }

        DB::transaction(function () use ($model, $userId, $validated) {
            $model->runs()->create([
                'user_id' => $userId,
                'duration_seconds' => (int) $validated['duration_seconds'],
                'exercises_completed' => (int) $validated['exercises_completed'],
                'sets_completed' => (int) $validated['sets_completed'],
                'valid_reps' => (int) $validated['valid_reps'],
                'consistency' => (int) $validated['consistency'],
                'penalties' => (int) $validated['penalties'],
                'competitive_eligible' => (bool) $validated['competitive_eligible'],
                'submitted_at' => now(),
            ]);

            if ($model->status === Duel::STATUS_ACCEPTED) {
                $model->update(['status' => Duel::STATUS_IN_PROGRESS]);
            }

            $runs = $model->runs()->get();

            if ($runs->count() >= 2) {
                $this->resolve($model, $runs);
            }
        });

        return $this->show($request, $duel);
    }

    /**
     * Resolve a duel once both runs are in. Writes the outcome and, for a
     * decisive competitive result, the best-effort ledger movement.
     *
     * @param  Collection<int, DuelRun>  $runs
     */
    private function resolve(Duel $duel, $runs): void
    {
        $challengerRun = $runs->firstWhere('user_id', $duel->challenger_user_id);
        $opponentRun = $runs->firstWhere('user_id', $duel->opponent_user_id);

        // A missing side should be impossible here (count >= 2 and one run
        // per participant), but guard rather than fatal.
        if (! $challengerRun || ! $opponentRun) {
            return;
        }

        if (! $challengerRun->competitive_eligible || ! $opponentRun->competitive_eligible) {
            $duel->update([
                'status' => Duel::STATUS_UNVALIDATED,
                'outcome' => null,
                'winner_user_id' => null,
                'result' => null,
                'finished_at' => now(),
            ]);

            return;
        }

        $resolution = DuelRules::resolve($duel->modality, $challengerRun->toRunArray(), $opponentRun->toRunArray());

        $winnerUserId = match ($resolution['winner']) {
            'challenger' => (int) $duel->challenger_user_id,
            'opponent' => (int) $duel->opponent_user_id,
            default => null,
        };

        $duel->update([
            'status' => Duel::STATUS_FINISHED,
            'outcome' => $resolution['winner'],
            'winner_user_id' => $winnerUserId,
            'result' => $resolution,
            'finished_at' => now(),
        ]);

        // Draw → no ledger movement. Decisive → +stake / -stake, best effort.
        if ($winnerUserId !== null && $duel->stake > 0) {
            $loserUserId = $winnerUserId === (int) $duel->challenger_user_id
                ? (int) $duel->opponent_user_id
                : (int) $duel->challenger_user_id;

            $duel->pointTransactions()->create([
                'user_id' => $winnerUserId,
                'amount' => $duel->stake,
                'reason' => PointTransaction::REASON_DUEL_WON,
                'idempotency_key' => "duel:{$duel->id}:won",
            ]);

            $duel->pointTransactions()->create([
                'user_id' => $loserUserId,
                'amount' => -$duel->stake,
                'reason' => PointTransaction::REASON_DUEL_LOST,
                'idempotency_key' => "duel:{$duel->id}:lost",
            ]);
        }
    }

    /**
     * The id of a gym in which both users currently hold an active
     * assignment, or null. Picks the lowest gym id for determinism.
     */
    private function sharedActiveGymId(int $userA, int $userB): ?int
    {
        $gymsA = GymAssignment::query()
            ->where('user_id', $userA)
            ->where('status', GymAssignment::STATUS_ACTIVE)
            ->pluck('gym_id')
            ->unique();

        return GymAssignment::query()
            ->where('user_id', $userB)
            ->where('status', GymAssignment::STATUS_ACTIVE)
            ->whereIn('gym_id', $gymsA)
            ->orderBy('gym_id')
            ->value('gym_id');
    }

    /**
     * Finished-duel win/loss tally for the given user ids.
     *
     * @param  array<int, int>  $userIds
     * @return array<int, array{won: int, lost: int}>
     */
    private function finishedRecords(array $userIds): array
    {
        if ($userIds === []) {
            return [];
        }

        $records = [];
        foreach ($userIds as $id) {
            $records[$id] = ['won' => 0, 'lost' => 0];
        }

        Duel::query()
            ->where('status', Duel::STATUS_FINISHED)
            ->whereNotNull('winner_user_id')
            ->where(function ($query) use ($userIds) {
                $query->whereIn('challenger_user_id', $userIds)->orWhereIn('opponent_user_id', $userIds);
            })
            ->get(['challenger_user_id', 'opponent_user_id', 'winner_user_id'])
            ->each(function (Duel $duel) use (&$records) {
                foreach ([$duel->challenger_user_id, $duel->opponent_user_id] as $participantId) {
                    if (! isset($records[$participantId])) {
                        continue;
                    }
                    if ((int) $duel->winner_user_id === (int) $participantId) {
                        $records[$participantId]['won']++;
                    } else {
                        $records[$participantId]['lost']++;
                    }
                }
            });

        return $records;
    }

    /**
     * A duel by id that the user takes part in, or 404. Scoping the lookup
     * to the participant is what makes a non-participant indistinguishable
     * from a missing row.
     */
    private function findParticipantDuel(int $userId, int $duelId): Duel
    {
        return Duel::query()
            ->where(function ($query) use ($userId) {
                $query->where('challenger_user_id', $userId)->orWhere('opponent_user_id', $userId);
            })
            ->findOrFail($duelId);
    }

    /**
     * @return array<string, mixed>
     */
    private function mapDuel(Duel $duel, int $viewerUserId): array
    {
        $viewerRole = (int) $duel->challenger_user_id === $viewerUserId ? 'challenger' : 'opponent';

        $runs = $duel->relationLoaded('runs') ? $duel->runs : $duel->runs()->get();
        $yourRun = $runs->firstWhere('user_id', $viewerUserId);
        $theirId = $viewerRole === 'challenger' ? (int) $duel->opponent_user_id : (int) $duel->challenger_user_id;
        $theirRun = $runs->firstWhere('user_id', $theirId);

        return [
            'id' => $duel->id,
            'status' => $duel->status,
            'viewer_role' => $viewerRole,
            'modality' => $duel->modality,
            'stake' => (int) $duel->stake,
            'gym_id' => $duel->gym_id,
            'challenger' => ['id' => $duel->challenger->id, 'name' => $duel->challenger->name],
            'opponent' => ['id' => $duel->opponent->id, 'name' => $duel->opponent->name],
            'winner_user_id' => $duel->winner_user_id,
            'outcome' => $duel->outcome,
            'result' => $duel->result,
            'you_submitted' => $yourRun !== null,
            'opponent_submitted' => $theirRun !== null,
            'your_run' => $yourRun ? $this->mapRun($yourRun) : null,
            'their_run' => ($theirRun && in_array($duel->status, [Duel::STATUS_FINISHED, Duel::STATUS_UNVALIDATED], true))
                ? $this->mapRun($theirRun)
                : null,
            'accepted_at' => $duel->accepted_at,
            'finished_at' => $duel->finished_at,
            'created_at' => $duel->created_at,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function mapRun(DuelRun $run): array
    {
        return [
            'duration_seconds' => (int) $run->duration_seconds,
            'exercises_completed' => (int) $run->exercises_completed,
            'sets_completed' => (int) $run->sets_completed,
            'valid_reps' => (int) $run->valid_reps,
            'consistency' => (int) $run->consistency,
            'penalties' => (int) $run->penalties,
            'competitive_eligible' => (bool) $run->competitive_eligible,
            'submitted_at' => $run->submitted_at,
        ];
    }
}
