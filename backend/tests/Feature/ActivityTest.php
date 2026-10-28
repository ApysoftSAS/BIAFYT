<?php

namespace Tests\Feature;

use App\Models\Activity;
use App\Models\PointTransaction;
use App\Models\User;
use App\Models\Workout;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

class ActivityTest extends TestCase
{
    use RefreshDatabase;

    /**
     * @return array<string, mixed>
     */
    private function activityAttributes(User $user, array $overrides = []): array
    {
        return array_merge([
            'user_id' => $user->id,
            'started_at' => '2026-08-28 10:00:00',
            'finished_at' => '2026-08-28 11:00:00',
            'duration_seconds' => 3600,
            'sets_completed' => 3,
            'exercises_completed' => 2,
        ], $overrides);
    }

    // 1. Activity pertenece a un user; workout_id es opcional (standalone).
    public function test_activity_belongs_to_user_and_workout_is_optional(): void
    {
        $user = User::factory()->create();
        $activity = Activity::create($this->activityAttributes($user));

        $this->assertTrue($activity->user->is($user));
        $this->assertNull($activity->workout_id);
        $this->assertNull($activity->workout);
    }

    // 2. Activity puede referenciar un Workout.
    public function test_activity_can_reference_a_workout(): void
    {
        $user = User::factory()->create();
        $workout = Workout::create(['user_id' => $user->id, 'started_at' => now(), 'finished_at' => now()]);

        $activity = Activity::create($this->activityAttributes($user, ['workout_id' => $workout->id]));

        $this->assertTrue($activity->workout->is($workout));
    }

    // 3. UNIQUE(workout_id): una segunda Activity para el mismo Workout es rechazada por la BD.
    public function test_unique_workout_id_rejects_a_second_activity_for_the_same_workout(): void
    {
        $user = User::factory()->create();
        $workout = Workout::create(['user_id' => $user->id, 'started_at' => now(), 'finished_at' => now()]);
        Activity::create($this->activityAttributes($user, ['workout_id' => $workout->id]));

        $this->expectException(QueryException::class);

        Activity::create($this->activityAttributes($user, ['workout_id' => $workout->id]));
    }

    // 4. Múltiples actividades standalone (workout_id null) para el mismo usuario.
    public function test_multiple_standalone_activities_are_allowed_for_the_same_user(): void
    {
        $user = User::factory()->create();

        Activity::create($this->activityAttributes($user));
        Activity::create($this->activityAttributes($user));

        $this->assertSame(2, $user->activities()->count());
    }

    // 3b. UNIQUE(user_id, client_uid) (roadmap 3c / A1): la BD es la garantía
    // final ante dos requests concurrentes con el mismo user_id + client_uid.
    public function test_unique_user_id_client_uid_rejects_a_duplicate_for_the_same_user(): void
    {
        $user = User::factory()->create();
        Activity::create($this->activityAttributes($user, ['client_uid' => 'sess-1']));

        $this->expectException(QueryException::class);

        Activity::create($this->activityAttributes($user, ['client_uid' => 'sess-1']));
    }

    // 3c. El mismo client_uid es válido para usuarios distintos (no es
    // globalmente único), y varios client_uid NULL conviven para un usuario.
    public function test_client_uid_is_scoped_per_user_and_nulls_do_not_collide(): void
    {
        $a = User::factory()->create();
        $b = User::factory()->create();

        Activity::create($this->activityAttributes($a, ['client_uid' => 'shared']));
        Activity::create($this->activityAttributes($b, ['client_uid' => 'shared']));
        Activity::create($this->activityAttributes($a)); // client_uid NULL
        Activity::create($this->activityAttributes($a)); // client_uid NULL

        $this->assertSame(3, $a->activities()->count());
        $this->assertSame(1, $b->activities()->count());
    }

    // 5. Borrar el Workout vinculado (nullOnDelete): la Activity sobrevive, solo se limpia el vínculo.
    public function test_deleting_the_linked_workout_nulls_the_link_but_keeps_the_activity(): void
    {
        $user = User::factory()->create();
        $workout = Workout::create(['user_id' => $user->id, 'started_at' => now()]);
        $activity = Activity::create($this->activityAttributes($user, ['workout_id' => $workout->id]));

        $workout->delete();

        $this->assertNotNull($activity->fresh());
        $this->assertNull($activity->fresh()->workout_id);
    }

    // 6. Borrar el User arrastra en cascada sus Activities.
    public function test_deleting_the_user_cascades_their_activities(): void
    {
        $user = User::factory()->create();
        Activity::create($this->activityAttributes($user));

        $user->delete();

        $this->assertSame(0, Activity::count());
    }

    // 7. started_at/finished_at se castean a Carbon; los conteos a int.
    public function test_timestamps_and_counts_are_cast(): void
    {
        $user = User::factory()->create();
        $activity = Activity::create($this->activityAttributes($user, [
            'duration_seconds' => '3600',
            'sets_completed' => '3',
            'exercises_completed' => '2',
        ]))->fresh();

        $this->assertInstanceOf(Carbon::class, $activity->started_at);
        $this->assertInstanceOf(Carbon::class, $activity->finished_at);
        $this->assertSame(3600, $activity->duration_seconds);
        $this->assertSame(3, $activity->sets_completed);
        $this->assertSame(2, $activity->exercises_completed);
    }

    // 8. La relación morfológica pointTransactions() resuelve, y source() apunta de vuelta a la Activity.
    public function test_point_transactions_morph_relation_resolves(): void
    {
        $user = User::factory()->create();
        $activity = Activity::create($this->activityAttributes($user));
        $transaction = $activity->pointTransactions()->create([
            'user_id' => $user->id,
            'amount' => 42,
            'reason' => PointTransaction::REASON_WORKOUT_COMPLETED,
            'idempotency_key' => "activity:{$activity->id}",
        ]);

        $this->assertSame(1, $activity->pointTransactions()->count());
        $this->assertTrue($transaction->fresh()->source->is($activity));
    }

    // 9. points_awarded se deriva del ledger: suma de las transacciones de la Activity.
    public function test_points_awarded_is_the_sum_of_the_activity_ledger_rows(): void
    {
        $user = User::factory()->create();
        $activity = Activity::create($this->activityAttributes($user));
        $activity->pointTransactions()->create([
            'user_id' => $user->id,
            'amount' => 42,
            'reason' => PointTransaction::REASON_WORKOUT_COMPLETED,
            'idempotency_key' => "activity:{$activity->id}",
        ]);

        $this->assertSame(42, (int) $activity->fresh()->pointTransactions->sum('amount'));
    }

    // 10. UNIQUE(idempotency_key): una segunda fila de ledger con la misma clave es rechazada por la BD.
    public function test_unique_idempotency_key_rejects_a_duplicate_ledger_row(): void
    {
        $user = User::factory()->create();
        PointTransaction::create([
            'user_id' => $user->id,
            'amount' => 10,
            'reason' => PointTransaction::REASON_WORKOUT_COMPLETED,
            'idempotency_key' => 'activity:1',
        ]);

        $this->expectException(QueryException::class);

        PointTransaction::create([
            'user_id' => $user->id,
            'amount' => 20,
            'reason' => PointTransaction::REASON_WORKOUT_COMPLETED,
            'idempotency_key' => 'activity:1',
        ]);
    }

    // 11. amount es un entero con signo: admite débitos (negativos) para fases futuras.
    public function test_amount_is_a_signed_integer(): void
    {
        $user = User::factory()->create();
        $transaction = PointTransaction::create([
            'user_id' => $user->id,
            'amount' => -150,
            'reason' => 'reward_purchase',
            'idempotency_key' => null,
        ])->fresh();

        $this->assertSame(-150, $transaction->amount);
    }

    // 12. El balance del usuario es SUM(amount), incluyendo débitos.
    public function test_balance_is_the_sum_of_amounts_including_debits(): void
    {
        $user = User::factory()->create();
        $user->pointTransactions()->createMany([
            ['amount' => 180, 'reason' => PointTransaction::REASON_WORKOUT_COMPLETED, 'idempotency_key' => 'a'],
            ['amount' => 42, 'reason' => PointTransaction::REASON_WORKOUT_COMPLETED, 'idempotency_key' => 'b'],
            ['amount' => -100, 'reason' => 'reward_purchase', 'idempotency_key' => 'c'],
        ]);

        $this->assertSame(122, (int) $user->pointTransactions()->sum('amount'));
    }

    // 13. Borrar la Activity origen arrastra en cascada sus filas de ledger (nullableMorphs, cascade por user_id no aplica aquí:
    //     se verifica que borrar el usuario limpia todo el ledger).
    public function test_deleting_the_user_cascades_their_point_transactions(): void
    {
        $user = User::factory()->create();
        $user->pointTransactions()->create([
            'amount' => 10,
            'reason' => PointTransaction::REASON_WORKOUT_COMPLETED,
            'idempotency_key' => 'activity:1',
        ]);

        $user->delete();

        $this->assertSame(0, PointTransaction::count());
    }
}
