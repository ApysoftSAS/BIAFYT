<?php

namespace Tests\Feature\Api\V1;

use App\Models\ChallengeClaim;
use App\Models\PointTransaction;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

class ChallengeApiTest extends TestCase
{
    use RefreshDatabase;

    // Los 3 retos de 2026-08-28 (ground truth del frontend): dc-validated(100), dc-sets(60), dc-duration(70).
    private const DATE = '2026-08-28';

    protected function setUp(): void
    {
        parent::setUp();
        // Congela "hoy" para que DATE no sea futuro.
        Carbon::setTestNow(Carbon::parse('2026-08-28T12:00:00Z'));
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    // 401 sin auth en los 2 endpoints.
    public function test_all_challenge_endpoints_reject_unauthenticated_requests(): void
    {
        $this->postJson('/api/v1/me/challenge-claims', ['challenge_id' => 'dc-sets', 'challenge_date' => self::DATE])->assertStatus(401);
        $this->getJson('/api/v1/me/challenge-claims')->assertStatus(401);
    }

    // POST válido -> 201, fila creada, crédito = reward del template backend, balance.
    public function test_claim_creates_the_row_and_credits_the_backend_reward(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user, 'sanctum')->postJson('/api/v1/me/challenge-claims', [
            'challenge_id' => 'dc-sets',
            'challenge_date' => self::DATE,
        ]);

        $response->assertStatus(201);
        $response->assertJsonPath('challenge_claim.challenge_id', 'dc-sets');
        $response->assertJsonPath('challenge_claim.challenge_date', self::DATE);

        $this->assertDatabaseHas('challenge_claims', [
            'user_id' => $user->id, 'challenge_id' => 'dc-sets', 'challenge_date' => self::DATE,
        ]);
        $this->assertDatabaseHas('point_transactions', [
            'user_id' => $user->id,
            'amount' => 60, // reward de dc-sets, calculado por el backend
            'reason' => 'challenge_claimed',
            'idempotency_key' => "challenge:{$user->id}:".self::DATE.':dc-sets',
        ]);
        $this->assertSame(60, (int) $user->pointTransactions()->sum('amount'));
    }

    // El reward lo pone el backend: un `reward`/`amount`/`points` del cliente se ignora.
    public function test_claim_ignores_client_supplied_reward_amount_and_user_id(): void
    {
        $user = User::factory()->create();
        $other = User::factory()->create();

        $response = $this->actingAs($user, 'sanctum')->postJson('/api/v1/me/challenge-claims', [
            'challenge_id' => 'dc-validated', // reward real: 100
            'challenge_date' => self::DATE,
            'reward' => 99999,
            'amount' => 99999,
            'points' => 99999,
            'user_id' => $other->id,
        ]);

        $response->assertStatus(201);
        $this->assertDatabaseHas('challenge_claims', ['user_id' => $user->id]);
        $this->assertDatabaseMissing('challenge_claims', ['user_id' => $other->id]);
        $this->assertSame(100, (int) $user->pointTransactions()->sum('amount'));
    }

    // challenge_id que NO es uno de los 3 del día -> 422.
    public function test_claim_rejects_a_challenge_not_in_the_days_three(): void
    {
        $user = User::factory()->create();

        // dc-checkin NO está entre los 3 de 2026-08-28.
        $response = $this->actingAs($user, 'sanctum')->postJson('/api/v1/me/challenge-claims', [
            'challenge_id' => 'dc-checkin',
            'challenge_date' => self::DATE,
        ]);

        $response->assertStatus(422);
        $response->assertJsonValidationErrors(['challenge_id']);
        $this->assertDatabaseCount('challenge_claims', 0);
        $this->assertDatabaseCount('point_transactions', 0);
    }

    // challenge_id inexistente -> 422.
    public function test_claim_rejects_an_unknown_challenge_id(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user, 'sanctum')->postJson('/api/v1/me/challenge-claims', [
            'challenge_id' => 'dc-does-not-exist',
            'challenge_date' => self::DATE,
        ]);

        $response->assertStatus(422);
        $this->assertDatabaseCount('challenge_claims', 0);
    }

    // challenge_date futura -> 422.
    public function test_claim_rejects_a_future_challenge_date(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user, 'sanctum')->postJson('/api/v1/me/challenge-claims', [
            'challenge_id' => 'dc-sets',
            'challenge_date' => '2026-09-01', // > hoy congelado (2026-08-28)
        ]);

        $response->assertStatus(422);
        $response->assertJsonValidationErrors(['challenge_date']);
        $this->assertDatabaseCount('challenge_claims', 0);
    }

    // Formato de fecha inválido -> 422.
    public function test_claim_rejects_a_bad_date_format(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user, 'sanctum')->postJson('/api/v1/me/challenge-claims', [
            'challenge_id' => 'dc-sets',
            'challenge_date' => '28/08/2026',
        ])->assertStatus(422);
    }

    // Campos requeridos -> 422.
    public function test_claim_requires_challenge_id_and_date(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user, 'sanctum')->postJson('/api/v1/me/challenge-claims', [])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['challenge_id', 'challenge_date']);
    }

    // Segundo claim del mismo (reto, día) -> 422, sin doble crédito, balance sin cambios.
    public function test_second_claim_of_the_same_challenge_returns_422_without_double_credit(): void
    {
        $user = User::factory()->create();
        $payload = ['challenge_id' => 'dc-duration', 'challenge_date' => self::DATE];

        $this->actingAs($user, 'sanctum')->postJson('/api/v1/me/challenge-claims', $payload)->assertStatus(201);
        $second = $this->actingAs($user, 'sanctum')->postJson('/api/v1/me/challenge-claims', $payload);

        $second->assertStatus(422);
        $this->assertDatabaseCount('challenge_claims', 1);
        $this->assertSame(1, PointTransaction::count());
        $this->assertSame(70, (int) $user->pointTransactions()->sum('amount'));
    }

    // Se pueden reclamar los 3 retos del día (distintos challenge_id).
    public function test_the_three_challenges_of_the_day_can_each_be_claimed(): void
    {
        $user = User::factory()->create();

        foreach (['dc-validated', 'dc-sets', 'dc-duration'] as $id) {
            $this->actingAs($user, 'sanctum')->postJson('/api/v1/me/challenge-claims', [
                'challenge_id' => $id, 'challenge_date' => self::DATE,
            ])->assertStatus(201);
        }

        $this->assertDatabaseCount('challenge_claims', 3);
        $this->assertSame(100 + 60 + 70, (int) $user->pointTransactions()->sum('amount'));
    }

    // Shape exacto de la respuesta: sin user_id, sin idempotency_key.
    public function test_claim_response_has_the_exact_shape(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user, 'sanctum')->postJson('/api/v1/me/challenge-claims', [
            'challenge_id' => 'dc-sets', 'challenge_date' => self::DATE,
        ]);

        $response->assertStatus(201);
        $claim = $response->json('challenge_claim');
        $this->assertSame(['id', 'challenge_id', 'challenge_date', 'created_at'], array_keys($claim));
        $this->assertArrayNotHasKey('user_id', $claim);
        $this->assertStringNotContainsString('idempotency_key', $response->getContent());
    }

    // Atomicidad: si el crédito choca con UNIQUE(idempotency_key), la fila claim se revierte (422, no 500).
    public function test_a_ledger_idempotency_collision_rolls_back_the_claim(): void
    {
        $user = User::factory()->create();

        PointTransaction::create([
            'user_id' => $user->id,
            'amount' => 0,
            'reason' => PointTransaction::REASON_CHALLENGE_CLAIMED,
            'idempotency_key' => "challenge:{$user->id}:".self::DATE.':dc-sets',
        ]);

        $response = $this->actingAs($user, 'sanctum')->postJson('/api/v1/me/challenge-claims', [
            'challenge_id' => 'dc-sets', 'challenge_date' => self::DATE,
        ]);

        $response->assertStatus(422);
        $this->assertDatabaseCount('challenge_claims', 0);
        $this->assertSame(1, PointTransaction::count()); // solo la pre-sembrada
    }

    // Anti-IDOR: GET solo devuelve los claims del caller, más recientes primero.
    public function test_index_returns_only_the_callers_claims_newest_first(): void
    {
        $user = User::factory()->create();
        $other = User::factory()->create();

        $older = ChallengeClaim::create(['user_id' => $user->id, 'challenge_id' => 'dc-sets', 'challenge_date' => '2026-08-20']);
        $newer = ChallengeClaim::create(['user_id' => $user->id, 'challenge_id' => 'dc-duration', 'challenge_date' => '2026-08-27']);
        ChallengeClaim::create(['user_id' => $other->id, 'challenge_id' => 'dc-sets', 'challenge_date' => '2026-08-28']);

        $response = $this->actingAs($user, 'sanctum')->getJson('/api/v1/me/challenge-claims');

        $response->assertOk();
        $this->assertSame([$newer->id, $older->id], array_column($response->json('challenge_claims'), 'id'));
    }

    // Usuario sin claims -> lista vacía.
    public function test_user_without_claims_gets_an_empty_list(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user, 'sanctum')->getJson('/api/v1/me/challenge-claims')
            ->assertOk()
            ->assertExactJson(['challenge_claims' => []]);
    }
}
