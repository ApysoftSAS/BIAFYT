<?php

namespace Tests\Feature\Api\V1;

use App\Models\CheckIn;
use App\Models\PointTransaction;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

/**
 * Roadmap 3c — A3: the `workout_completed` streak bonus is derived from the
 * AUTHORITATIVE check-in streak (App\Support\StreakRules, the same source
 * as GET /me/streak), never from the request's `streak` field. `streak` is
 * still accepted for backward compatibility but ignored for the amount.
 *
 * `PointRules::forActivity` is unchanged: only the source of the streak
 * value it receives changed.
 */
class ActivityStreakBonusApiTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Carbon::setTestNow(Carbon::parse('2026-09-10T12:00:00Z'));
    }

    /** @return array<string, mixed> */
    private function payload(array $overrides = []): array
    {
        return array_merge([
            'started_at' => '2026-09-10T10:00:00Z',
            'finished_at' => '2026-09-10T11:00:00Z',
            'duration_seconds' => 3600,
            'sets_completed' => 3,
            'exercises_completed' => 2,
        ], $overrides);
    }

    /** Seed check-ins for the given day-offsets from today (0 = today). */
    private function checkInsOn(User $user, int ...$dayOffsets): void
    {
        foreach ($dayOffsets as $offset) {
            CheckIn::create([
                'user_id' => $user->id,
                'check_in_date' => Carbon::now()->subDays($offset)->toDateString(),
                'checked_in_at' => Carbon::now()->subDays($offset),
            ]);
        }
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    // Racha real de 5 días consecutivos -> bono min(100, 5*10) = 50.
    public function test_consecutive_check_ins_drive_the_streak_bonus(): void
    {
        $user = User::factory()->create();
        $this->checkInsOn($user, 0, 1, 2, 3, 4);

        $response = $this->actingAs($user, 'sanctum')->postJson('/api/v1/me/activities', $this->payload([
            'sets_completed' => 3,
            'exercises_completed' => 2,
        ]));

        $response->assertStatus(201);
        $response->assertJsonPath('activity.points_awarded', 92); // 42 + 50
        $this->assertSame(92, (int) $user->pointTransactions()->sum('amount'));
    }

    // Día perdido: aunque el request mande un streak alto, la racha actual
    // real es 0 (el último check-in tiene 3+ días) -> sin bono.
    public function test_a_missed_day_means_no_bonus_even_if_the_request_inflates_streak(): void
    {
        $user = User::factory()->create();
        $this->checkInsOn($user, 3, 4, 5); // nada hoy ni ayer -> current_streak 0

        $response = $this->actingAs($user, 'sanctum')->postJson('/api/v1/me/activities', $this->payload([
            'sets_completed' => 3,
            'exercises_completed' => 2,
            'streak' => 999, // manipulado
        ]));

        $response->assertStatus(201);
        $response->assertJsonPath('activity.points_awarded', 42); // 42 + 0
        $this->assertSame(42, (int) $user->pointTransactions()->sum('amount'));
    }

    // El request no puede subir el crédito por encima de la racha real: hoy
    // + ayer = 2 días; el bono es min(100, 2*10) = 20, no 990.
    public function test_a_manipulated_streak_cannot_increase_the_credit(): void
    {
        $user = User::factory()->create();
        $this->checkInsOn($user, 0, 1); // current_streak 2

        $withHugeStreak = $this->actingAs($user, 'sanctum')->postJson('/api/v1/me/activities', $this->payload([
            'sets_completed' => 3,
            'exercises_completed' => 2,
            'streak' => 99,
        ]));

        $withHugeStreak->assertJsonPath('activity.points_awarded', 62); // 42 + 20
    }

    // Request sin `streak`: sigue funcionando; el bono sale de la racha real.
    public function test_request_without_streak_still_works(): void
    {
        $user = User::factory()->create();
        $this->checkInsOn($user, 0, 1, 2); // current_streak 3

        $response = $this->actingAs($user, 'sanctum')->postJson('/api/v1/me/activities', $this->payload([
            'sets_completed' => 3,
            'exercises_completed' => 2,
        ]));

        $response->assertStatus(201);
        $response->assertJsonPath('activity.points_awarded', 72); // 42 + 30
    }

    // Sin check-ins: racha 0, actividad normal acredita solo su base.
    public function test_no_check_ins_means_base_points_only(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user, 'sanctum')->postJson('/api/v1/me/activities', $this->payload([
            'sets_completed' => 3,
            'exercises_completed' => 2,
            'streak' => 7,
        ]));

        $response->assertJsonPath('activity.points_awarded', 42);
    }

    // El bono sigue capado a 100 (min(100, streak*10)) — racha de 20 días.
    public function test_the_streak_bonus_is_still_capped_at_100(): void
    {
        $user = User::factory()->create();
        $this->checkInsOn($user, ...range(0, 19)); // current_streak 20 -> bono cap 100

        $response = $this->actingAs($user, 'sanctum')->postJson('/api/v1/me/activities', $this->payload([
            'sets_completed' => 3,
            'exercises_completed' => 2,
        ]));

        $response->assertJsonPath('activity.points_awarded', 142); // 42 + 100
    }

    // A3 no cambia A1: un client_uid repetido con racha real sigue siendo
    // idempotente — una Activity, un crédito.
    public function test_a1_idempotency_is_unaffected_by_a3(): void
    {
        $user = User::factory()->create();
        $this->checkInsOn($user, 0, 1, 2);
        $body = $this->payload(['client_uid' => 'sess-a3-a1', 'sets_completed' => 3, 'exercises_completed' => 2]);

        $first = $this->actingAs($user, 'sanctum')->postJson('/api/v1/me/activities', $body);
        $second = $this->actingAs($user, 'sanctum')->postJson('/api/v1/me/activities', $body);

        $first->assertStatus(201)->assertJsonPath('activity.points_awarded', 72); // 42 + 30
        $second->assertStatus(200)->assertJsonPath('activity.points_awarded', 72);
        $this->assertSame(1, PointTransaction::where('reason', PointTransaction::REASON_WORKOUT_COMPLETED)->count());
        $this->assertSame(72, (int) $user->pointTransactions()->sum('amount'));
    }
}
