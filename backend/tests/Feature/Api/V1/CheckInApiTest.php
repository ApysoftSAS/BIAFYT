<?php

namespace Tests\Feature\Api\V1;

use App\Models\CheckIn;
use App\Models\PointTransaction;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

class CheckInApiTest extends TestCase
{
    use RefreshDatabase;

    // 401 sin auth en los 3 endpoints.
    public function test_all_check_in_endpoints_reject_unauthenticated_requests(): void
    {
        $this->postJson('/api/v1/me/check-ins')->assertStatus(401);
        $this->getJson('/api/v1/me/check-ins')->assertStatus(401);
        $this->patchJson('/api/v1/me/check-ins/today/check-out')->assertStatus(401);
    }

    // POST -> 201, fila check_ins creada, crédito +20 `checkin` en el ledger, balance +20.
    public function test_check_in_creates_the_row_and_credits_twenty_to_the_ledger(): void
    {
        $user = User::factory()->create();
        $today = Carbon::now()->toDateString();

        $response = $this->actingAs($user, 'sanctum')->postJson('/api/v1/me/check-ins');

        $response->assertStatus(201);
        $response->assertJsonPath('check_in.check_in_date', $today);
        $response->assertJsonPath('check_in.checked_out_at', null);

        $this->assertDatabaseHas('check_ins', ['user_id' => $user->id, 'check_in_date' => $today]);
        $this->assertDatabaseHas('point_transactions', [
            'user_id' => $user->id,
            'amount' => 20,
            'reason' => 'checkin',
            'idempotency_key' => "checkin:{$user->id}:{$today}",
        ]);
        $this->assertSame(20, (int) $user->pointTransactions()->sum('amount'));
    }

    // Segundo POST el mismo día -> 422, sin segunda fila, sin doble crédito, balance sin cambios.
    public function test_second_check_in_same_day_returns_422_without_double_credit(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user, 'sanctum')->postJson('/api/v1/me/check-ins')->assertStatus(201);
        $second = $this->actingAs($user, 'sanctum')->postJson('/api/v1/me/check-ins');

        $second->assertStatus(422);
        $second->assertJsonValidationErrors(['check_in']);
        $this->assertDatabaseCount('check_ins', 1);
        $this->assertSame(1, PointTransaction::count());
        $this->assertSame(20, (int) $user->pointTransactions()->sum('amount'));
    }

    // El cliente no puede enviar amount/points/user_id: se ignoran, el crédito sigue siendo 20.
    public function test_check_in_ignores_client_supplied_amount_and_user_id(): void
    {
        $user = User::factory()->create();
        $other = User::factory()->create();

        $response = $this->actingAs($user, 'sanctum')->postJson('/api/v1/me/check-ins', [
            'amount' => 99999,
            'points' => 99999,
            'user_id' => $other->id,
        ]);

        $response->assertStatus(201);
        $this->assertDatabaseHas('check_ins', ['user_id' => $user->id]);
        $this->assertDatabaseMissing('check_ins', ['user_id' => $other->id]);
        $this->assertSame(20, (int) $user->pointTransactions()->sum('amount'));
    }

    // Shape exacto de la respuesta: sin user_id.
    public function test_check_in_response_has_the_exact_shape(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user, 'sanctum')->postJson('/api/v1/me/check-ins');

        $response->assertStatus(201);
        $checkIn = $response->json('check_in');
        $this->assertSame(['id', 'check_in_date', 'checked_in_at', 'checked_out_at', 'created_at'], array_keys($checkIn));
        $this->assertArrayNotHasKey('user_id', $checkIn);
        $this->assertStringNotContainsString('idempotency_key', $response->getContent());
    }

    // Atomicidad/idempotencia: si el crédito choca con UNIQUE(idempotency_key), la fila check_ins se revierte (422, no 500).
    public function test_a_ledger_idempotency_collision_rolls_back_the_check_in(): void
    {
        $user = User::factory()->create();
        $today = Carbon::now()->toDateString();

        PointTransaction::create([
            'user_id' => $user->id,
            'amount' => 0,
            'reason' => PointTransaction::REASON_CHECKIN,
            'idempotency_key' => "checkin:{$user->id}:{$today}",
        ]);

        $response = $this->actingAs($user, 'sanctum')->postJson('/api/v1/me/check-ins');

        $response->assertStatus(422);
        $this->assertDatabaseCount('check_ins', 0);
        $this->assertSame(1, PointTransaction::count()); // solo la pre-sembrada
    }

    // Anti-IDOR: GET solo devuelve los check-ins del caller, más recientes primero.
    public function test_index_returns_only_the_callers_check_ins_newest_first(): void
    {
        $user = User::factory()->create();
        $other = User::factory()->create();

        $older = CheckIn::create(['user_id' => $user->id, 'check_in_date' => '2026-08-20', 'checked_in_at' => '2026-08-20T10:00:00Z']);
        $newer = CheckIn::create(['user_id' => $user->id, 'check_in_date' => '2026-08-27', 'checked_in_at' => '2026-08-27T10:00:00Z']);
        CheckIn::create(['user_id' => $other->id, 'check_in_date' => '2026-08-28', 'checked_in_at' => '2026-08-28T10:00:00Z']);

        $response = $this->actingAs($user, 'sanctum')->getJson('/api/v1/me/check-ins');

        $response->assertOk();
        $this->assertSame([$newer->id, $older->id], array_column($response->json('check_ins'), 'id'));
    }

    // Check-out válido: POST check-in -> PATCH check-out -> 200, checked_out_at seteado.
    public function test_check_out_sets_checked_out_at(): void
    {
        $user = User::factory()->create();
        $this->actingAs($user, 'sanctum')->postJson('/api/v1/me/check-ins')->assertStatus(201);

        $response = $this->actingAs($user, 'sanctum')->patchJson('/api/v1/me/check-ins/today/check-out');

        $response->assertOk();
        $response->assertJsonPath('check_in.checked_out_at', fn ($value) => $value !== null);
        $this->assertNotNull($user->checkIns()->first()->checked_out_at);
    }

    // Check-out sin check-in de hoy -> 404.
    public function test_check_out_without_a_check_in_today_returns_404(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user, 'sanctum')->patchJson('/api/v1/me/check-ins/today/check-out')->assertStatus(404);
    }

    // Segundo check-out el mismo día -> 422.
    public function test_second_check_out_same_day_returns_422(): void
    {
        $user = User::factory()->create();
        $this->actingAs($user, 'sanctum')->postJson('/api/v1/me/check-ins')->assertStatus(201);
        $this->actingAs($user, 'sanctum')->patchJson('/api/v1/me/check-ins/today/check-out')->assertOk();

        $second = $this->actingAs($user, 'sanctum')->patchJson('/api/v1/me/check-ins/today/check-out');

        $second->assertStatus(422);
        $second->assertJsonValidationErrors(['check_out']);
    }

    // Check-out solo actúa sobre el check-in propio: el de ayer no cuenta como "hoy".
    public function test_check_out_only_targets_todays_check_in(): void
    {
        $user = User::factory()->create();
        CheckIn::create([
            'user_id' => $user->id,
            'check_in_date' => Carbon::now()->subDay()->toDateString(),
            'checked_in_at' => Carbon::now()->subDay(),
        ]);

        $this->actingAs($user, 'sanctum')->patchJson('/api/v1/me/check-ins/today/check-out')->assertStatus(404);
    }

    // El check-in de un usuario nunca aparece ni se afecta desde otro usuario (anti-IDOR en check-out).
    public function test_a_users_check_out_never_touches_another_users_check_in(): void
    {
        $userA = User::factory()->create();
        $userB = User::factory()->create();
        $this->actingAs($userB, 'sanctum')->postJson('/api/v1/me/check-ins')->assertStatus(201);

        // A no tiene check-in hoy -> 404 (no puede cerrar el de B).
        $this->actingAs($userA, 'sanctum')->patchJson('/api/v1/me/check-ins/today/check-out')->assertStatus(404);
        $this->assertNull($userB->checkIns()->first()->checked_out_at);
    }
}
