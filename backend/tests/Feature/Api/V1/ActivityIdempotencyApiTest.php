<?php

namespace Tests\Feature\Api\V1;

use App\Models\Activity;
use App\Models\PointTransaction;
use App\Models\User;
use App\Models\Workout;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Roadmap 3c — A1: client idempotency of `POST /me/activities`.
 *
 * A retried POST that carries the same `client_uid` must resolve to the
 * SAME Activity and the SAME `workout_completed` credit — never a second
 * Activity, never a second credit. Posts without a `client_uid` keep the
 * exact previous behaviour.
 */
class ActivityIdempotencyApiTest extends TestCase
{
    use RefreshDatabase;

    /**
     * @return array<string, mixed>
     */
    private function payload(array $overrides = []): array
    {
        return array_merge([
            'started_at' => '2026-08-28T10:00:00Z',
            'finished_at' => '2026-08-28T11:00:00Z',
            'duration_seconds' => 3600,
            'sets_completed' => 3,
            'exercises_completed' => 2,
        ], $overrides);
    }

    // Test 1 — mismo client_uid: 201 el primero, 200 el segundo, una sola
    // Activity, un solo crédito, balance de un solo crédito.
    public function test_same_client_uid_creates_one_activity_and_one_credit(): void
    {
        $user = User::factory()->create();
        $uid = 'sess-2026-08-28-abc';

        $first = $this->actingAs($user, 'sanctum')->postJson('/api/v1/me/activities', $this->payload([
            'client_uid' => $uid,
        ]));
        $second = $this->actingAs($user, 'sanctum')->postJson('/api/v1/me/activities', $this->payload([
            'client_uid' => $uid,
        ]));

        $first->assertStatus(201)->assertJsonPath('activity.points_awarded', 42);
        $second->assertStatus(200)->assertJsonPath('activity.points_awarded', 42);
        $second->assertJsonPath('activity.id', $first->json('activity.id'));

        $this->assertDatabaseCount('activities', 1);
        $this->assertSame(1, PointTransaction::where('reason', PointTransaction::REASON_WORKOUT_COMPLETED)->count());
        $this->assertSame(42, (int) $user->pointTransactions()->sum('amount'));
    }

    // Test 2 — usuarios diferentes: el mismo client_uid es válido para cada
    // uno; 2 Activities, 2 créditos, cada usuario solo el suyo.
    public function test_the_same_client_uid_is_independent_per_user(): void
    {
        $a = User::factory()->create();
        $b = User::factory()->create();
        $uid = 'shared-device-uid';

        $ra = $this->actingAs($a, 'sanctum')->postJson('/api/v1/me/activities', $this->payload(['client_uid' => $uid]));
        $rb = $this->actingAs($b, 'sanctum')->postJson('/api/v1/me/activities', $this->payload(['client_uid' => $uid]));

        $ra->assertStatus(201);
        $rb->assertStatus(201);
        $this->assertNotSame($ra->json('activity.id'), $rb->json('activity.id'));

        $this->assertDatabaseCount('activities', 2);
        $this->assertSame(2, PointTransaction::where('reason', PointTransaction::REASON_WORKOUT_COMPLETED)->count());
        $this->assertSame(42, (int) $a->pointTransactions()->sum('amount'));
        $this->assertSame(42, (int) $b->pointTransactions()->sum('amount'));
    }

    // Test 3 — sin client_uid: comportamiento legacy intacto (dos POST
    // standalone crean dos Activities, como hasta ahora).
    public function test_without_client_uid_the_legacy_behaviour_is_unchanged(): void
    {
        $user = User::factory()->create();

        $first = $this->actingAs($user, 'sanctum')->postJson('/api/v1/me/activities', $this->payload());
        $second = $this->actingAs($user, 'sanctum')->postJson('/api/v1/me/activities', $this->payload());

        $first->assertStatus(201);
        $second->assertStatus(201);
        $this->assertNotSame($first->json('activity.id'), $second->json('activity.id'));

        $this->assertDatabaseCount('activities', 2);
        $this->assertSame(2, PointTransaction::count());
        $this->assertSame(84, (int) $user->pointTransactions()->sum('amount'));

        // Y la clave de idempotencia legacy sigue siendo "activity:{id}".
        $this->assertDatabaseHas('point_transactions', ['idempotency_key' => 'activity:'.$first->json('activity.id')]);
    }

    // Test 4 — retry tras respuesta perdida: el primer POST creó todo, el
    // cliente no recibió la respuesta y reenvía el mismo client_uid con
    // datos distintos. No hay segundo crédito y se devuelve la Activity
    // original (con SUS datos, no los del reintento).
    public function test_retry_after_a_lost_response_returns_the_original_activity(): void
    {
        $user = User::factory()->create();
        $uid = 'sess-lost-response';

        $first = $this->actingAs($user, 'sanctum')->postJson('/api/v1/me/activities', $this->payload([
            'client_uid' => $uid,
            'sets_completed' => 3,
            'exercises_completed' => 2,
        ]));
        $first->assertStatus(201)->assertJsonPath('activity.points_awarded', 42);
        $balanceAfterFirst = (int) $user->pointTransactions()->sum('amount');

        // El "reintento" trae más volumen — se ignora por completo.
        $retry = $this->actingAs($user, 'sanctum')->postJson('/api/v1/me/activities', $this->payload([
            'client_uid' => $uid,
            'sets_completed' => 50,
            'exercises_completed' => 50,
        ]));

        $retry->assertStatus(200);
        $retry->assertJsonPath('activity.id', $first->json('activity.id'));
        $retry->assertJsonPath('activity.points_awarded', 42); // los del original
        $retry->assertJsonPath('activity.sets_completed', 3);

        $this->assertDatabaseCount('activities', 1);
        $this->assertSame(1, PointTransaction::where('reason', PointTransaction::REASON_WORKOUT_COMPLETED)->count());
        $this->assertSame($balanceAfterFirst, (int) $user->pointTransactions()->sum('amount'));
    }

    // Test 5 — "concurrencia" (SQLite :memory: no permite ejecución
    // realmente paralela; se ejecuta secuencial — igual que
    // ActivityApiTest::test_two_activity_posts_for_the_same_workout_*). La
    // garantía real ante dos requests paralelos es el índice
    // UNIQUE(user_id, client_uid), verificado a nivel de BD en
    // ActivityTest::test_unique_user_id_client_uid_*. Aquí se comprueba el
    // resultado observable: exactamente una Activity y un crédito, y que el
    // segundo request termina en 200 (nunca 422/500).
    public function test_a_repeated_client_uid_never_double_credits_and_never_errors(): void
    {
        $user = User::factory()->create();
        $uid = 'sess-concurrent';
        $payload = $this->payload(['client_uid' => $uid]);

        $first = $this->actingAs($user, 'sanctum')->postJson('/api/v1/me/activities', $payload);
        $second = $this->actingAs($user, 'sanctum')->postJson('/api/v1/me/activities', $payload);

        $first->assertStatus(201);
        $second->assertStatus(200);

        $this->assertDatabaseCount('activities', 1);
        $this->assertSame(1, PointTransaction::count());
        $this->assertSame(42, (int) $user->pointTransactions()->sum('amount'));
    }

    // Un client_uid en blanco se trata como ausente (no como un uid real):
    // dos POST con "" crean dos Activities, como el flujo legacy.
    public function test_a_blank_client_uid_is_treated_as_absent(): void
    {
        $user = User::factory()->create();

        $first = $this->actingAs($user, 'sanctum')->postJson('/api/v1/me/activities', $this->payload(['client_uid' => '']));
        $second = $this->actingAs($user, 'sanctum')->postJson('/api/v1/me/activities', $this->payload(['client_uid' => '']));

        $first->assertStatus(201);
        $second->assertStatus(201);
        $this->assertDatabaseCount('activities', 2);
        $this->assertDatabaseMissing('activities', ['client_uid' => '']);
    }

    // client_uid demasiado largo (> 64) -> 422 de validación.
    public function test_client_uid_over_64_chars_is_rejected(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user, 'sanctum')->postJson('/api/v1/me/activities', $this->payload([
            'client_uid' => str_repeat('x', 65),
        ]));

        $response->assertStatus(422)->assertJsonValidationErrors('client_uid');
        $this->assertDatabaseCount('activities', 0);
    }

    // El client_uid nunca se filtra en la respuesta (clave interna de dedup).
    public function test_client_uid_is_not_exposed_in_the_response(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user, 'sanctum')->postJson('/api/v1/me/activities', $this->payload([
            'client_uid' => 'sess-hidden',
        ]));

        $response->assertStatus(201);
        $this->assertArrayNotHasKey('client_uid', $response->json('activity'));
    }

    // Un client_uid + un workout_id ya usado por otra Activity: si el
    // client_uid es nuevo, sigue siendo un 422 por UNIQUE(workout_id)
    // (no se enmascara como éxito).
    public function test_a_new_client_uid_with_a_taken_workout_still_conflicts(): void
    {
        $user = User::factory()->create();
        $workout = Workout::create([
            'user_id' => $user->id,
            'started_at' => '2026-08-28T10:00:00Z',
            'finished_at' => '2026-08-28T11:00:00Z',
        ]);

        $this->actingAs($user, 'sanctum')->postJson('/api/v1/me/activities', $this->payload([
            'workout_id' => $workout->id,
            'client_uid' => 'sess-one',
        ]))->assertStatus(201);

        $this->actingAs($user, 'sanctum')->postJson('/api/v1/me/activities', $this->payload([
            'workout_id' => $workout->id,
            'client_uid' => 'sess-two',
        ]))->assertStatus(422);

        $this->assertDatabaseCount('activities', 1);
        $this->assertSame(1, PointTransaction::count());
    }
}
