<?php

namespace Tests\Feature\Api\V1;

use App\Models\Activity;
use App\Models\CheckIn;
use App\Models\PointTransaction;
use App\Models\User;
use App\Models\Workout;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

class ActivityApiTest extends TestCase
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

    private function finishedWorkout(User $user): Workout
    {
        return Workout::create([
            'user_id' => $user->id,
            'started_at' => '2026-08-28T10:00:00Z',
            'finished_at' => '2026-08-28T11:00:00Z',
        ]);
    }

    // 401 sin auth en los 3 endpoints de esta fase.
    public function test_all_activity_endpoints_reject_unauthenticated_requests(): void
    {
        $this->postJson('/api/v1/me/activities', $this->payload())->assertStatus(401);
        $this->getJson('/api/v1/me/activities')->assertStatus(401);
        $this->getJson('/api/v1/me/points')->assertStatus(401);
    }

    // Usuario sin actividades -> lista vacía.
    public function test_user_without_activities_gets_an_empty_list(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user, 'sanctum')->getJson('/api/v1/me/activities');

        $response->assertOk();
        $response->assertExactJson([
            'activities' => [],
            'next_cursor' => null,
            'has_more' => false,
        ]);
    }

    // Crear actividad standalone -> 201, puntos derivados, ledger creado, balance sube.
    public function test_create_standalone_activity_awards_derived_points(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user, 'sanctum')->postJson('/api/v1/me/activities', $this->payload([
            'sets_completed' => 3,
            'exercises_completed' => 2,
        ]));

        $response->assertStatus(201);
        $response->assertJsonPath('activity.workout_id', null);
        $response->assertJsonPath('activity.points_awarded', 42); // 3*6 + 2*12

        $this->assertDatabaseHas('activities', ['user_id' => $user->id, 'workout_id' => null]);
        $this->assertDatabaseHas('point_transactions', [
            'user_id' => $user->id,
            'amount' => 42,
            'reason' => 'workout_completed',
        ]);
        $this->assertSame(42, (int) $user->pointTransactions()->sum('amount'));
    }

    // A3: el bono de racha sale de la racha AUTORITATIVA (check-ins, StreakRules),
    // no del `streak` del request. 5 check-ins consecutivos -> current_streak 5.
    public function test_create_activity_awards_the_streak_bonus_from_the_authoritative_streak(): void
    {
        Carbon::setTestNow('2026-09-10T12:00:00Z');
        $user = User::factory()->create();
        for ($i = 0; $i < 5; $i++) {
            CheckIn::create([
                'user_id' => $user->id,
                'check_in_date' => now()->subDays($i)->toDateString(),
                'checked_in_at' => now()->subDays($i),
            ]);
        }

        $response = $this->actingAs($user, 'sanctum')->postJson('/api/v1/me/activities', $this->payload([
            'sets_completed' => 3,
            'exercises_completed' => 2,
            'streak' => 5, // aceptado por compatibilidad, ignorado para el cálculo
        ]));

        $response->assertStatus(201);
        $response->assertJsonPath('activity.points_awarded', 92); // 3*6 + 2*12 + min(100, 5*10)
        $this->assertSame(92, (int) $user->pointTransactions()->sum('amount'));
        Carbon::setTestNow();
    }

    // `streak` ausente se comporta como streak=0 (compatibilidad con clientes que no lo envían).
    public function test_create_activity_without_streak_defaults_to_zero_bonus(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user, 'sanctum')->postJson('/api/v1/me/activities', $this->payload([
            'sets_completed' => 3,
            'exercises_completed' => 2,
        ]));

        $response->assertJsonPath('activity.points_awarded', 42);
    }

    // Crear actividad desde Workout propio y cerrado -> 201, workout_id seteado.
    public function test_create_activity_from_own_finished_workout(): void
    {
        $user = User::factory()->create();
        $workout = $this->finishedWorkout($user);

        $response = $this->actingAs($user, 'sanctum')->postJson('/api/v1/me/activities', $this->payload([
            'workout_id' => $workout->id,
        ]));

        $response->assertStatus(201);
        $response->assertJsonPath('activity.workout_id', $workout->id);
        $this->assertDatabaseHas('point_transactions', ['idempotency_key' => 'activity:'.$response->json('activity.id')]);
    }

    // workout_id de otro usuario -> 422, nada persiste.
    public function test_create_activity_rejects_a_workout_belonging_to_another_user(): void
    {
        $user = User::factory()->create();
        $other = User::factory()->create();
        $workout = $this->finishedWorkout($other);

        $response = $this->actingAs($user, 'sanctum')->postJson('/api/v1/me/activities', $this->payload([
            'workout_id' => $workout->id,
        ]));

        $response->assertStatus(422);
        $response->assertJsonValidationErrors(['workout_id']);
        $this->assertDatabaseCount('activities', 0);
        $this->assertDatabaseCount('point_transactions', 0);
    }

    // workout_id de un Workout abierto (finished_at null) -> 422.
    public function test_create_activity_rejects_an_unfinished_workout(): void
    {
        $user = User::factory()->create();
        $workout = Workout::create(['user_id' => $user->id, 'started_at' => '2026-08-28T10:00:00Z']);

        $response = $this->actingAs($user, 'sanctum')->postJson('/api/v1/me/activities', $this->payload([
            'workout_id' => $workout->id,
        ]));

        $response->assertStatus(422);
        $response->assertJsonValidationErrors(['workout_id']);
        $this->assertDatabaseCount('activities', 0);
    }

    // Segunda Activity para el mismo Workout -> 422, sin segundo crédito, balance sin cambios.
    public function test_create_activity_rejects_a_second_activity_for_the_same_workout(): void
    {
        $user = User::factory()->create();
        $workout = $this->finishedWorkout($user);

        $first = $this->actingAs($user, 'sanctum')->postJson('/api/v1/me/activities', $this->payload([
            'workout_id' => $workout->id,
            'sets_completed' => 3,
            'exercises_completed' => 2,
        ]));
        $first->assertStatus(201);

        $second = $this->actingAs($user, 'sanctum')->postJson('/api/v1/me/activities', $this->payload([
            'workout_id' => $workout->id,
            'sets_completed' => 10,
            'exercises_completed' => 10,
        ]));

        $second->assertStatus(422);
        $this->assertDatabaseCount('activities', 1);
        $this->assertSame(1, PointTransaction::count());
        $this->assertSame(42, (int) $user->pointTransactions()->sum('amount'));
    }

    // finished_at anterior a started_at -> 422.
    public function test_create_activity_rejects_finished_at_before_started_at(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user, 'sanctum')->postJson('/api/v1/me/activities', $this->payload([
            'started_at' => '2026-08-28T11:00:00Z',
            'finished_at' => '2026-08-28T10:00:00Z',
        ]));

        $response->assertStatus(422);
        $response->assertJsonValidationErrors(['finished_at']);
        $this->assertDatabaseCount('activities', 0);
    }

    // Valores negativos -> 422.
    public function test_create_activity_rejects_negative_counts(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user, 'sanctum')->postJson('/api/v1/me/activities', $this->payload([
            'duration_seconds' => -1,
            'sets_completed' => -3,
            'exercises_completed' => -2,
        ]));

        $response->assertStatus(422);
        $response->assertJsonValidationErrors(['duration_seconds', 'sets_completed', 'exercises_completed']);
        $this->assertDatabaseCount('activities', 0);
    }

    // Campos requeridos ausentes -> 422.
    public function test_create_activity_requires_the_session_facts(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user, 'sanctum')->postJson('/api/v1/me/activities', []);

        $response->assertStatus(422);
        $response->assertJsonValidationErrors([
            'started_at', 'finished_at', 'duration_seconds', 'sets_completed', 'exercises_completed',
        ]);
    }

    // Shape exacto de la respuesta: sin user_id, sin idempotency_key, sin FQCN del morph.
    public function test_create_activity_response_has_the_exact_shape(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user, 'sanctum')->postJson('/api/v1/me/activities', $this->payload([
            'routine_label' => 'Hipertrofia',
        ]));

        $response->assertStatus(201);
        $activity = $response->json('activity');

        $this->assertSame([
            'id', 'workout_id', 'routine_label', 'started_at', 'finished_at',
            'duration_seconds', 'sets_completed', 'exercises_completed', 'points_awarded', 'created_at',
        ], array_keys($activity));
        $this->assertArrayNotHasKey('user_id', $activity);
        $this->assertArrayNotHasKey('idempotency_key', $activity);
        $this->assertStringNotContainsString('App\\Models', $response->getContent());
        $this->assertSame('Hipertrofia', $activity['routine_label']);
    }

    // El cliente no puede enviar points/amount/activity_points/competitive_points: se ignoran, el backend deriva.
    public function test_create_activity_ignores_client_supplied_points(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user, 'sanctum')->postJson('/api/v1/me/activities', $this->payload([
            'sets_completed' => 3,
            'exercises_completed' => 2,
            'points' => 99999,
            'amount' => 99999,
            'activity_points' => 99999,
            'competitive_points' => 99999,
            'points_awarded' => 99999,
        ]));

        $response->assertStatus(201);
        $response->assertJsonPath('activity.points_awarded', 42);
        $this->assertSame(42, (int) $user->pointTransactions()->sum('amount'));
    }

    // El cliente no puede inyectar user_id: la actividad pertenece al usuario autenticado.
    public function test_create_activity_ignores_a_user_id_in_the_payload(): void
    {
        $user = User::factory()->create();
        $other = User::factory()->create();

        $response = $this->actingAs($user, 'sanctum')->postJson('/api/v1/me/activities', $this->payload([
            'user_id' => $other->id,
        ]));

        $response->assertStatus(201);
        $this->assertDatabaseHas('activities', ['user_id' => $user->id]);
        $this->assertDatabaseMissing('activities', ['user_id' => $other->id]);
        $this->assertDatabaseHas('point_transactions', ['user_id' => $user->id]);
    }

    // GET /me/activities: solo las del caller, más recientes primero (finished_at DESC).
    public function test_index_returns_only_the_callers_activities_newest_first(): void
    {
        $user = User::factory()->create();
        $other = User::factory()->create();

        $older = Activity::create([
            'user_id' => $user->id, 'started_at' => '2026-08-20T10:00:00Z', 'finished_at' => '2026-08-20T11:00:00Z',
            'duration_seconds' => 3600, 'sets_completed' => 1, 'exercises_completed' => 1,
        ]);
        $newer = Activity::create([
            'user_id' => $user->id, 'started_at' => '2026-08-27T10:00:00Z', 'finished_at' => '2026-08-27T11:00:00Z',
            'duration_seconds' => 3600, 'sets_completed' => 1, 'exercises_completed' => 1,
        ]);
        Activity::create([
            'user_id' => $other->id, 'started_at' => '2026-08-28T10:00:00Z', 'finished_at' => '2026-08-28T11:00:00Z',
            'duration_seconds' => 3600, 'sets_completed' => 1, 'exercises_completed' => 1,
        ]);

        $response = $this->actingAs($user, 'sanctum')->getJson('/api/v1/me/activities');

        $response->assertOk();
        $ids = array_column($response->json('activities'), 'id');
        $this->assertSame([$newer->id, $older->id], $ids);
    }

    // Una Activity es un hecho inmutable: no hay endpoint de update ni delete.
    public function test_activities_cannot_be_updated_or_deleted(): void
    {
        $user = User::factory()->create();
        $create = $this->actingAs($user, 'sanctum')->postJson('/api/v1/me/activities', $this->payload());
        $id = $create->json('activity.id');

        $this->actingAs($user, 'sanctum')->patchJson("/api/v1/me/activities/{$id}", [])->assertStatus(404);
        $this->actingAs($user, 'sanctum')->deleteJson("/api/v1/me/activities/{$id}")->assertStatus(404);
        $this->assertDatabaseHas('activities', ['id' => $id]);
    }

    // Puntos capados a 600 a través del endpoint.
    public function test_points_are_capped_at_600_through_the_endpoint(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user, 'sanctum')->postJson('/api/v1/me/activities', $this->payload([
            'sets_completed' => 500,
            'exercises_completed' => 500,
        ]));

        $response->assertStatus(201);
        $response->assertJsonPath('activity.points_awarded', 600);
        $this->assertSame(600, (int) $user->pointTransactions()->sum('amount'));
    }

    // Dos POST para el mismo Workout: exactamente un 201, un 422, una sola Activity y una sola PointTransaction.
    // (SQLite :memory: no permite ejecución realmente paralela; se ejecuta secuencial —
    //  el UNIQUE(workout_id) de BD es la última línea de defensa real, ver ActivityTest::test_unique_workout_id_*).
    public function test_two_activity_posts_for_the_same_workout_yield_one_success_and_one_422(): void
    {
        $user = User::factory()->create();
        $workout = $this->finishedWorkout($user);
        $payload = $this->payload(['workout_id' => $workout->id]);

        $first = $this->actingAs($user, 'sanctum')->postJson('/api/v1/me/activities', $payload);
        $second = $this->actingAs($user, 'sanctum')->postJson('/api/v1/me/activities', $payload);

        $first->assertStatus(201);
        $second->assertStatus(422);
        $this->assertDatabaseCount('activities', 1);
        $this->assertSame(1, PointTransaction::count());
    }

    // Atomicidad: si el crédito del ledger choca con UNIQUE(idempotency_key), la Activity se revierte por completo (422, no 500).
    public function test_a_ledger_idempotency_collision_rolls_back_the_activity(): void
    {
        $user = User::factory()->create();

        // La primera actividad tendrá id 1 -> su clave será "activity:1". La pre-sembramos para forzar el choque.
        PointTransaction::create([
            'user_id' => $user->id,
            'amount' => 0,
            'reason' => PointTransaction::REASON_WORKOUT_COMPLETED,
            'idempotency_key' => 'activity:1',
        ]);

        $response = $this->actingAs($user, 'sanctum')->postJson('/api/v1/me/activities', $this->payload());

        $response->assertStatus(422);
        $this->assertDatabaseCount('activities', 0);
        $this->assertSame(1, PointTransaction::count()); // solo la pre-sembrada
    }
}
