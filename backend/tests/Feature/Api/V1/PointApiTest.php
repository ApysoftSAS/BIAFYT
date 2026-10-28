<?php

namespace Tests\Feature\Api\V1;

use App\Models\PointTransaction;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PointApiTest extends TestCase
{
    use RefreshDatabase;

    private function recordActivity(User $user, int $sets, int $exercises): void
    {
        $this->actingAs($user, 'sanctum')->postJson('/api/v1/me/activities', [
            'started_at' => '2026-08-28T10:00:00Z',
            'finished_at' => '2026-08-28T11:00:00Z',
            'duration_seconds' => 3600,
            'sets_completed' => $sets,
            'exercises_completed' => $exercises,
        ])->assertStatus(201);
    }

    // 401 sin auth.
    public function test_points_endpoint_rejects_unauthenticated_requests(): void
    {
        $this->getJson('/api/v1/me/points')->assertStatus(401);
    }

    // Usuario nuevo: balance 0, sin transacciones.
    public function test_new_user_has_zero_balance_and_no_transactions(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user, 'sanctum')->getJson('/api/v1/me/points');

        $response->assertOk();
        $response->assertExactJson([
            'balance' => 0,
            'transactions' => [],
            'next_cursor' => null,
            'has_more' => false,
        ]);
    }

    // Balance y transacciones reflejan las actividades registradas (SUM de amounts).
    public function test_balance_and_transactions_reflect_recorded_activities(): void
    {
        $user = User::factory()->create();
        $this->recordActivity($user, 3, 2); // 42
        $this->recordActivity($user, 1, 0); // 6

        $response = $this->actingAs($user, 'sanctum')->getJson('/api/v1/me/points');

        $response->assertOk();
        $response->assertJsonPath('balance', 48);
        $response->assertJsonCount(2, 'transactions');
    }

    // GET /me/points solo muestra los datos del usuario autenticado (anti-IDOR).
    public function test_points_endpoint_only_shows_the_callers_data(): void
    {
        $user = User::factory()->create();
        $other = User::factory()->create();
        $this->recordActivity($user, 3, 2);  // caller: 42
        $this->recordActivity($other, 5, 5); // otro: 90

        $response = $this->actingAs($user, 'sanctum')->getJson('/api/v1/me/points');

        $response->assertOk();
        $response->assertJsonPath('balance', 42);
        $response->assertJsonCount(1, 'transactions');
        $response->assertJsonPath('transactions.0.amount', 42);
    }

    // Shape de cada transacción: source_type en forma corta ("activity"), sin FQCN, sin user_id ni idempotency_key.
    public function test_transaction_shape_uses_short_source_type_and_hides_internals(): void
    {
        $user = User::factory()->create();
        $this->recordActivity($user, 3, 2);

        $response = $this->actingAs($user, 'sanctum')->getJson('/api/v1/me/points');

        $response->assertOk();
        $transaction = $response->json('transactions.0');

        $this->assertSame(['id', 'amount', 'reason', 'source_type', 'source_id', 'created_at'], array_keys($transaction));
        $this->assertSame('activity', $transaction['source_type']);
        $this->assertSame('workout_completed', $transaction['reason']);
        $this->assertArrayNotHasKey('user_id', $transaction);
        $this->assertArrayNotHasKey('idempotency_key', $transaction);
        $this->assertStringNotContainsString('App\\Models', $response->getContent());
    }

    // El ledger es append-only: no existe endpoint de escritura de transacciones.
    public function test_the_points_ledger_has_no_write_endpoint(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user, 'sanctum')->postJson('/api/v1/me/points', [])->assertStatus(405);
        $this->actingAs($user, 'sanctum')->patchJson('/api/v1/me/points', [])->assertStatus(405);
        $this->actingAs($user, 'sanctum')->deleteJson('/api/v1/me/points')->assertStatus(405);
        $this->actingAs($user, 'sanctum')->postJson('/api/v1/me/point-transactions', [])->assertStatus(404);
    }

    // El balance incluye débitos (amount negativo), aunque ninguna ruta de esta fase los cree.
    public function test_balance_includes_debits(): void
    {
        $user = User::factory()->create();
        $this->recordActivity($user, 3, 2); // +42

        // Débito directo (fase futura: compra de premio). Sin endpoint; se inserta por modelo.
        PointTransaction::create([
            'user_id' => $user->id,
            'amount' => -20,
            'reason' => 'reward_purchase',
            'idempotency_key' => null,
        ]);

        $response = $this->actingAs($user, 'sanctum')->getJson('/api/v1/me/points');

        $response->assertOk();
        $response->assertJsonPath('balance', 22);
    }
}
