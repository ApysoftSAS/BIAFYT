<?php

namespace Tests\Feature\Api\V1;

use App\Models\CheckIn;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

class StreakApiTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Carbon::setTestNow(Carbon::parse('2026-08-28T12:00:00Z'));
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function checkIn(User $user, string $date): void
    {
        CheckIn::create([
            'user_id' => $user->id,
            'check_in_date' => $date,
            'checked_in_at' => Carbon::parse($date.'T09:00:00Z'),
        ]);
    }

    public function test_streak_endpoint_rejects_unauthenticated_requests(): void
    {
        $this->getJson('/api/v1/me/streak')->assertStatus(401);
    }

    public function test_user_without_check_ins_has_zero_streak(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user, 'sanctum')->getJson('/api/v1/me/streak');

        $response->assertOk();
        $response->assertExactJson(['current_streak' => 0, 'longest_streak' => 0]);
    }

    public function test_one_check_in_today_is_streak_one(): void
    {
        $user = User::factory()->create();
        $this->checkIn($user, '2026-08-28');

        $this->actingAs($user, 'sanctum')->getJson('/api/v1/me/streak')
            ->assertOk()
            ->assertExactJson(['current_streak' => 1, 'longest_streak' => 1]);
    }

    public function test_consecutive_days_increment_the_streak(): void
    {
        $user = User::factory()->create();
        foreach (['2026-08-25', '2026-08-26', '2026-08-27', '2026-08-28'] as $d) {
            $this->checkIn($user, $d);
        }

        $this->actingAs($user, 'sanctum')->getJson('/api/v1/me/streak')
            ->assertOk()
            ->assertExactJson(['current_streak' => 4, 'longest_streak' => 4]);
    }

    public function test_a_missing_day_breaks_the_streak(): void
    {
        $user = User::factory()->create();
        // 22,23 (2) -- hueco -- 27,28 (2, termina hoy).
        foreach (['2026-08-22', '2026-08-23', '2026-08-27', '2026-08-28'] as $d) {
            $this->checkIn($user, $d);
        }

        $this->actingAs($user, 'sanctum')->getJson('/api/v1/me/streak')
            ->assertOk()
            ->assertExactJson(['current_streak' => 2, 'longest_streak' => 2]);
    }

    public function test_another_users_check_ins_do_not_affect_the_streak(): void
    {
        $user = User::factory()->create();
        $other = User::factory()->create();

        $this->checkIn($user, '2026-08-28');
        foreach (['2026-08-24', '2026-08-25', '2026-08-26', '2026-08-27', '2026-08-28'] as $d) {
            $this->checkIn($other, $d);
        }

        $this->actingAs($user, 'sanctum')->getJson('/api/v1/me/streak')
            ->assertOk()
            ->assertExactJson(['current_streak' => 1, 'longest_streak' => 1]);
    }

    public function test_response_has_the_exact_shape_without_user_id(): void
    {
        $user = User::factory()->create();
        $this->checkIn($user, '2026-08-27');
        $this->checkIn($user, '2026-08-28');

        $response = $this->actingAs($user, 'sanctum')->getJson('/api/v1/me/streak');

        $response->assertOk();
        $this->assertSame(['current_streak', 'longest_streak'], array_keys($response->json()));
        $this->assertSame(2, $response->json('current_streak'));
        $this->assertStringNotContainsString('user_id', $response->getContent());
    }
}
