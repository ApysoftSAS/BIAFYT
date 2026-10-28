<?php

namespace Tests\Feature;

use App\Models\PointTransaction;
use App\Models\RewardClaim;
use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class RewardClaimTest extends TestCase
{
    use RefreshDatabase;

    public function test_claim_belongs_to_user(): void
    {
        $user = User::factory()->create();
        $claim = RewardClaim::create([
            'user_id' => $user->id, 'prize_id' => 'pz-clase-gratis', 'reward_uid' => 'r-1', 'cost' => 600,
        ]);

        $this->assertTrue($claim->user->is($user));
        $this->assertSame('pz-clase-gratis', $claim->prize_id);
        $this->assertSame(600, $claim->cost);
    }

    public function test_unique_user_reward_uid_rejects_a_duplicate(): void
    {
        $user = User::factory()->create();
        RewardClaim::create(['user_id' => $user->id, 'prize_id' => 'pz-clase-gratis', 'reward_uid' => 'r-1', 'cost' => 600]);

        $this->expectException(QueryException::class);

        RewardClaim::create(['user_id' => $user->id, 'prize_id' => 'pz-clase-gratis', 'reward_uid' => 'r-1', 'cost' => 600]);
    }

    // El mismo prize puede canjearse varias veces (reward_uid distinto cada vez) — no hay
    // límite de "una vez por prize", a diferencia de retos/check-in (bucket de día).
    public function test_same_prize_with_different_reward_uid_is_allowed(): void
    {
        $user = User::factory()->create();
        $user->rewardClaims()->create(['prize_id' => 'pz-clase-gratis', 'reward_uid' => 'r-1', 'cost' => 600]);
        $user->rewardClaims()->create(['prize_id' => 'pz-clase-gratis', 'reward_uid' => 'r-2', 'cost' => 600]);

        $this->assertSame(2, $user->rewardClaims()->count());
    }

    public function test_deleting_the_user_cascades_their_claims(): void
    {
        $user = User::factory()->create();
        RewardClaim::create(['user_id' => $user->id, 'prize_id' => 'pz-clase-gratis', 'reward_uid' => 'r-1', 'cost' => 600]);

        $user->delete();

        $this->assertSame(0, RewardClaim::count());
    }

    public function test_point_transactions_morph_relation_resolves(): void
    {
        $user = User::factory()->create();
        $claim = RewardClaim::create(['user_id' => $user->id, 'prize_id' => 'pz-clase-gratis', 'reward_uid' => 'r-1', 'cost' => 600]);
        $tx = $claim->pointTransactions()->create([
            'user_id' => $user->id,
            'amount' => -600,
            'reason' => PointTransaction::REASON_REWARD_CLAIMED,
            'idempotency_key' => "reward:{$user->id}:r-1",
        ]);

        $this->assertSame(1, $claim->pointTransactions()->count());
        $this->assertTrue($tx->fresh()->source->is($claim));
    }

    // El débito es negativo: comparte ledger con los créditos y resta del balance.
    public function test_reward_debit_shares_the_ledger_with_the_other_reasons(): void
    {
        $user = User::factory()->create();
        $user->pointTransactions()->createMany([
            ['amount' => 600, 'reason' => PointTransaction::REASON_WORKOUT_COMPLETED, 'idempotency_key' => 'activity:1'],
            ['amount' => -600, 'reason' => PointTransaction::REASON_REWARD_CLAIMED, 'idempotency_key' => 'reward:1:r-1'],
        ]);

        $this->assertSame(0, (int) $user->pointTransactions()->sum('amount'));
    }
}
