<?php

namespace Tests\Feature\Api\V1;

use App\Models\PointTransaction;
use App\Models\RewardClaim;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class RewardApiTest extends TestCase
{
    use RefreshDatabase;

    private function creditPoints(User $user, int $amount): void
    {
        $user->pointTransactions()->create([
            'amount' => $amount,
            'reason' => PointTransaction::REASON_WORKOUT_COMPLETED,
            'idempotency_key' => 'seed:'.$user->id.':'.$amount,
        ]);
    }

    // 401 sin auth en los 2 endpoints.
    public function test_all_reward_endpoints_reject_unauthenticated_requests(): void
    {
        $this->postJson('/api/v1/me/reward-claims', ['prize_id' => 'pz-clase-gratis', 'reward_uid' => 'r-1'])->assertStatus(401);
        $this->getJson('/api/v1/me/reward-claims')->assertStatus(401);
    }

    // Saldo suficiente -> 201, fila creada, débito negativo, balance baja.
    public function test_claim_with_enough_balance_debits_the_ledger(): void
    {
        $user = User::factory()->create();
        $this->creditPoints($user, 1000);

        $response = $this->actingAs($user, 'sanctum')->postJson('/api/v1/me/reward-claims', [
            'prize_id' => 'pz-clase-gratis', // cost 600
            'reward_uid' => 'r-1',
        ]);

        $response->assertStatus(201);
        $response->assertJsonPath('reward_claim.prize_id', 'pz-clase-gratis');
        $response->assertJsonPath('reward_claim.cost', 600);

        $this->assertDatabaseHas('reward_claims', ['user_id' => $user->id, 'prize_id' => 'pz-clase-gratis', 'reward_uid' => 'r-1', 'cost' => 600]);
        $this->assertDatabaseHas('point_transactions', [
            'user_id' => $user->id,
            'amount' => -600,
            'reason' => 'reward_claimed',
            'idempotency_key' => "reward:{$user->id}:r-1",
        ]);
        $this->assertSame(400, (int) $user->pointTransactions()->sum('amount')); // 1000 - 600
    }

    // Saldo insuficiente -> 422, nada persiste, balance intacto.
    public function test_claim_without_enough_balance_is_rejected(): void
    {
        $user = User::factory()->create();
        $this->creditPoints($user, 100);

        $response = $this->actingAs($user, 'sanctum')->postJson('/api/v1/me/reward-claims', [
            'prize_id' => 'pz-clase-gratis', // cost 600 > balance 100
            'reward_uid' => 'r-1',
        ]);

        $response->assertStatus(422);
        $response->assertJsonValidationErrors(['prize_id']);
        $this->assertDatabaseCount('reward_claims', 0);
        $this->assertSame(100, (int) $user->pointTransactions()->sum('amount'));
    }

    // Saldo exacto (cost == balance) -> 201, balance queda en 0.
    public function test_claim_with_exact_balance_succeeds_and_zeroes_the_balance(): void
    {
        $user = User::factory()->create();
        $this->creditPoints($user, 600);

        $response = $this->actingAs($user, 'sanctum')->postJson('/api/v1/me/reward-claims', [
            'prize_id' => 'pz-clase-gratis', 'reward_uid' => 'r-1',
        ]);

        $response->assertStatus(201);
        $this->assertSame(0, (int) $user->pointTransactions()->sum('amount'));
    }

    // El costo lo pone el backend: un cost/amount/points/user_id del cliente se ignora.
    public function test_claim_ignores_client_supplied_cost_and_user_id(): void
    {
        $user = User::factory()->create();
        $other = User::factory()->create();
        $this->creditPoints($user, 1000);

        $response = $this->actingAs($user, 'sanctum')->postJson('/api/v1/me/reward-claims', [
            'prize_id' => 'pz-clase-gratis', // cost real: 600
            'reward_uid' => 'r-1',
            'cost' => 1,
            'amount' => 1,
            'points' => 1,
            'user_id' => $other->id,
        ]);

        $response->assertStatus(201);
        $this->assertDatabaseHas('reward_claims', ['user_id' => $user->id, 'cost' => 600]);
        $this->assertDatabaseMissing('reward_claims', ['user_id' => $other->id]);
        $this->assertSame(400, (int) $user->pointTransactions()->sum('amount'));
    }

    // prize_id inexistente -> 422, nada persiste.
    public function test_claim_rejects_an_unknown_prize_id(): void
    {
        $user = User::factory()->create();
        $this->creditPoints($user, 1000);

        $response = $this->actingAs($user, 'sanctum')->postJson('/api/v1/me/reward-claims', [
            'prize_id' => 'pz-does-not-exist', 'reward_uid' => 'r-1',
        ]);

        $response->assertStatus(422);
        $this->assertDatabaseCount('reward_claims', 0);
    }

    // Campos requeridos -> 422.
    public function test_claim_requires_prize_id_and_reward_uid(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user, 'sanctum')->postJson('/api/v1/me/reward-claims', [])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['prize_id', 'reward_uid']);
    }

    // Reintento del mismo reward_uid (doble canje) -> 422, sin doble débito, balance sin cambios.
    public function test_second_claim_with_the_same_reward_uid_returns_422_without_double_debit(): void
    {
        $user = User::factory()->create();
        $this->creditPoints($user, 1000);
        $payload = ['prize_id' => 'pz-clase-gratis', 'reward_uid' => 'r-1'];

        $this->actingAs($user, 'sanctum')->postJson('/api/v1/me/reward-claims', $payload)->assertStatus(201);
        $second = $this->actingAs($user, 'sanctum')->postJson('/api/v1/me/reward-claims', $payload);

        $second->assertStatus(422);
        $this->assertDatabaseCount('reward_claims', 1);
        $this->assertSame(1, PointTransaction::where('reason', 'reward_claimed')->count());
        $this->assertSame(400, (int) $user->pointTransactions()->sum('amount')); // 1000 - 600, una sola vez
    }

    // El mismo prize puede canjearse otra vez con un reward_uid distinto (no es "una vez por prize"),
    // siempre que el saldo alcance para ambos.
    public function test_the_same_prize_can_be_claimed_again_with_a_different_reward_uid(): void
    {
        $user = User::factory()->create();
        $this->creditPoints($user, 1200); // alcanza para 2 x 600

        $this->actingAs($user, 'sanctum')->postJson('/api/v1/me/reward-claims', [
            'prize_id' => 'pz-clase-gratis', 'reward_uid' => 'r-1',
        ])->assertStatus(201);
        $this->actingAs($user, 'sanctum')->postJson('/api/v1/me/reward-claims', [
            'prize_id' => 'pz-clase-gratis', 'reward_uid' => 'r-2',
        ])->assertStatus(201);

        $this->assertDatabaseCount('reward_claims', 2);
        $this->assertSame(0, (int) $user->pointTransactions()->sum('amount')); // 1200 - 600 - 600
    }

    // Saldo alcanza para el primero pero no para el segundo -> el segundo se rechaza sin tocar el balance.
    public function test_a_second_claim_that_would_overdraw_the_balance_is_rejected(): void
    {
        $user = User::factory()->create();
        $this->creditPoints($user, 1000); // alcanza para 1 x 600 pero no para 2

        $this->actingAs($user, 'sanctum')->postJson('/api/v1/me/reward-claims', [
            'prize_id' => 'pz-clase-gratis', 'reward_uid' => 'r-1',
        ])->assertStatus(201);
        $second = $this->actingAs($user, 'sanctum')->postJson('/api/v1/me/reward-claims', [
            'prize_id' => 'pz-clase-gratis', 'reward_uid' => 'r-2',
        ]);

        $second->assertStatus(422);
        $this->assertDatabaseCount('reward_claims', 1);
        $this->assertSame(400, (int) $user->pointTransactions()->sum('amount')); // solo el primer débito
    }

    // Prize gratis (cost 0, p.ej. desbloqueado por ranking) -> 201 sin necesitar saldo.
    public function test_a_zero_cost_prize_can_be_claimed_with_no_balance(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user, 'sanctum')->postJson('/api/v1/me/reward-claims', [
            'prize_id' => 'pz-mes-gratis', 'reward_uid' => 'r-1',
        ]);

        $response->assertStatus(201);
        $this->assertSame(0, (int) $user->pointTransactions()->sum('amount'));
    }

    // Shape exacto de la respuesta: sin user_id, sin idempotency_key.
    public function test_claim_response_has_the_exact_shape(): void
    {
        $user = User::factory()->create();
        $this->creditPoints($user, 1000);

        $response = $this->actingAs($user, 'sanctum')->postJson('/api/v1/me/reward-claims', [
            'prize_id' => 'pz-clase-gratis', 'reward_uid' => 'r-1',
        ]);

        $response->assertStatus(201);
        $claim = $response->json('reward_claim');
        $this->assertSame(['id', 'prize_id', 'cost', 'created_at'], array_keys($claim));
        $this->assertArrayNotHasKey('user_id', $claim);
        $this->assertStringNotContainsString('idempotency_key', $response->getContent());
    }

    // Atomicidad: si el débito choca con UNIQUE(idempotency_key), la fila claim se revierte (422, no 500).
    public function test_a_ledger_idempotency_collision_rolls_back_the_claim(): void
    {
        $user = User::factory()->create();
        $this->creditPoints($user, 1000);

        PointTransaction::create([
            'user_id' => $user->id,
            'amount' => 0,
            'reason' => PointTransaction::REASON_REWARD_CLAIMED,
            'idempotency_key' => "reward:{$user->id}:r-1",
        ]);

        $response = $this->actingAs($user, 'sanctum')->postJson('/api/v1/me/reward-claims', [
            'prize_id' => 'pz-clase-gratis', 'reward_uid' => 'r-1',
        ]);

        $response->assertStatus(422);
        $this->assertDatabaseCount('reward_claims', 0);
        $this->assertSame(2, PointTransaction::count()); // seed + la pre-sembrada de idempotencia
    }

    // Anti-IDOR: GET solo devuelve los claims del caller, más recientes primero.
    public function test_index_returns_only_the_callers_claims_newest_first(): void
    {
        $user = User::factory()->create();
        $other = User::factory()->create();

        $older = RewardClaim::create(['user_id' => $user->id, 'prize_id' => 'pz-gym-batido', 'reward_uid' => 'r-1', 'cost' => 200]);
        $newer = RewardClaim::create(['user_id' => $user->id, 'prize_id' => 'pz-clase-gratis', 'reward_uid' => 'r-2', 'cost' => 600]);
        RewardClaim::create(['user_id' => $other->id, 'prize_id' => 'pz-clase-gratis', 'reward_uid' => 'r-3', 'cost' => 600]);

        $response = $this->actingAs($user, 'sanctum')->getJson('/api/v1/me/reward-claims');

        $response->assertOk();
        $this->assertSame([$newer->id, $older->id], array_column($response->json('reward_claims'), 'id'));
    }

    // Usuario sin claims -> lista vacía.
    public function test_user_without_claims_gets_an_empty_list(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user, 'sanctum')->getJson('/api/v1/me/reward-claims')
            ->assertOk()
            ->assertExactJson(['reward_claims' => []]);
    }
}
