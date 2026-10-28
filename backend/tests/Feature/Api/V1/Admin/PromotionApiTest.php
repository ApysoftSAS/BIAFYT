<?php

namespace Tests\Feature\Api\V1\Admin;

use App\Models\Promotion;
use App\Models\PromotionRule;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

/**
 * Platform promotions (Promotion V1) — BIAFYT Admin side. Gated by
 * `User::is_platform_admin` (404 for anyone else). List + create only: a
 * promotion is created together with its rules (audience + duration_months
 * + benefit) in one request.
 */
class PromotionApiTest extends TestCase
{
    use RefreshDatabase;

    private function platformAdmin(): User
    {
        $user = User::factory()->create();
        $user->forceFill(['is_platform_admin' => true])->save();

        return $user;
    }

    private function rule(array $overrides = []): array
    {
        return array_merge([
            'audience' => PromotionRule::AUDIENCE_ATHLETE,
            'duration_months' => 12,
            'benefit_type' => PromotionRule::BENEFIT_PERCENT,
            'benefit_value' => 15,
        ], $overrides);
    }

    private function payload(array $overrides = []): array
    {
        return array_merge([
            'code' => 'ANIVERSARIO2026',
            'rules' => [$this->rule()],
        ], $overrides);
    }

    public function test_endpoint_requires_authentication(): void
    {
        $this->postJson('/api/v1/admin/promotions', $this->payload())->assertStatus(401);
        $this->getJson('/api/v1/admin/promotions')->assertStatus(401);
    }

    public function test_a_non_platform_admin_gets_404_on_index(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user, 'sanctum')
            ->getJson('/api/v1/admin/promotions')
            ->assertStatus(404);
    }

    public function test_a_non_platform_admin_gets_404_on_store(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user, 'sanctum')
            ->postJson('/api/v1/admin/promotions', $this->payload())
            ->assertStatus(404);
    }

    public function test_index_lists_promotions_with_their_rules_newest_first(): void
    {
        $admin = $this->platformAdmin();

        Carbon::setTestNow('2026-09-16T10:00:00Z');
        $older = Promotion::create(['code' => 'OLD']);
        $older->rules()->create($this->rule());
        Carbon::setTestNow('2026-09-16T11:00:00Z');
        $newer = Promotion::create(['code' => 'NEW']);
        $newer->rules()->create($this->rule());
        Carbon::setTestNow();

        $response = $this->actingAs($admin, 'sanctum')->getJson('/api/v1/admin/promotions');

        $response->assertOk();
        $response->assertJsonPath('promotions.0.id', $newer->id);
        $response->assertJsonPath('promotions.1.id', $older->id);
        $response->assertJsonCount(1, 'promotions.0.rules');
        $response->assertJsonMissingPath('promotions.0.created_by_user_id');
    }

    public function test_a_platform_admin_can_create_a_promotion_with_multiple_rules_per_audience(): void
    {
        $admin = $this->platformAdmin();

        $payload = $this->payload([
            'code' => 'ANIVERSARIO2026',
            'active' => true,
            'valid_from' => '2026-01-01',
            'valid_until' => '2026-12-31',
            'rules' => [
                $this->rule(['audience' => 'athlete', 'duration_months' => 3, 'benefit_value' => 10]),
                $this->rule(['audience' => 'athlete', 'duration_months' => 6, 'benefit_value' => 13]),
                $this->rule(['audience' => 'athlete', 'duration_months' => 12, 'benefit_value' => 15]),
                $this->rule(['audience' => 'coach', 'duration_months' => 3, 'benefit_value' => 15]),
                $this->rule(['audience' => 'coach', 'duration_months' => 6, 'benefit_value' => 20]),
                $this->rule(['audience' => 'coach', 'duration_months' => 12, 'benefit_value' => 25]),
                $this->rule(['audience' => 'gym', 'duration_months' => 3, 'benefit_value' => 20]),
                $this->rule(['audience' => 'gym', 'duration_months' => 6, 'benefit_value' => 25]),
                $this->rule(['audience' => 'gym', 'duration_months' => 12, 'benefit_value' => 30]),
            ],
        ]);

        $response = $this->actingAs($admin, 'sanctum')->postJson('/api/v1/admin/promotions', $payload);

        $response->assertCreated();
        $response->assertJsonPath('promotion.code', 'ANIVERSARIO2026');
        $response->assertJsonPath('promotion.active', true);
        $response->assertJsonCount(9, 'promotion.rules');

        $this->assertDatabaseHas('promotions', ['code' => 'ANIVERSARIO2026', 'active' => true]);
        $this->assertDatabaseCount('promotion_rules', 9);
        $this->assertDatabaseHas('promotion_rules', [
            'audience' => 'coach', 'duration_months' => 12, 'benefit_value' => 25,
        ]);
    }

    public function test_a_promotion_can_target_a_single_audience(): void
    {
        $admin = $this->platformAdmin();

        $payload = $this->payload([
            'code' => 'COACH2026',
            'rules' => [
                $this->rule(['audience' => 'coach', 'duration_months' => 3, 'benefit_value' => 5]),
                $this->rule(['audience' => 'coach', 'duration_months' => 6, 'benefit_value' => 10]),
                $this->rule(['audience' => 'coach', 'duration_months' => 12, 'benefit_value' => 20]),
            ],
        ]);

        $response = $this->actingAs($admin, 'sanctum')->postJson('/api/v1/admin/promotions', $payload);

        $response->assertCreated();
        $response->assertJsonCount(3, 'promotion.rules');
        $this->assertDatabaseMissing('promotion_rules', ['audience' => 'athlete']);
        $this->assertDatabaseMissing('promotion_rules', ['audience' => 'gym']);
    }

    public function test_code_is_normalized_with_trim_and_uppercase(): void
    {
        $admin = $this->platformAdmin();

        $response = $this->actingAs($admin, 'sanctum')
            ->postJson('/api/v1/admin/promotions', $this->payload(['code' => '  aniversario2026  ']));

        $response->assertCreated();
        $response->assertJsonPath('promotion.code', 'ANIVERSARIO2026');
    }

    public function test_a_duplicate_code_is_rejected_case_and_whitespace_insensitively(): void
    {
        $admin = $this->platformAdmin();
        Promotion::create(['code' => 'ANIVERSARIO2026']);

        $response = $this->actingAs($admin, 'sanctum')
            ->postJson('/api/v1/admin/promotions', $this->payload(['code' => ' aniversario2026 ']));

        $response->assertStatus(422);
        $response->assertJsonValidationErrors(['code']);
    }

    public function test_requires_at_least_one_rule(): void
    {
        $admin = $this->platformAdmin();

        $response = $this->actingAs($admin, 'sanctum')
            ->postJson('/api/v1/admin/promotions', $this->payload(['rules' => []]));

        $response->assertStatus(422);
        $response->assertJsonValidationErrors(['rules']);
    }

    public function test_rule_validation_rejects_unknown_audience_duration_and_benefit_type(): void
    {
        $admin = $this->platformAdmin();

        $this->actingAs($admin, 'sanctum')
            ->postJson('/api/v1/admin/promotions', $this->payload(['rules' => [$this->rule(['audience' => 'guest'])]]))
            ->assertStatus(422)
            ->assertJsonValidationErrors(['rules.0.audience']);

        $this->actingAs($admin, 'sanctum')
            ->postJson('/api/v1/admin/promotions', $this->payload(['code' => 'OTRO', 'rules' => [$this->rule(['duration_months' => 4])]]))
            ->assertStatus(422)
            ->assertJsonValidationErrors(['rules.0.duration_months']);

        $this->actingAs($admin, 'sanctum')
            ->postJson('/api/v1/admin/promotions', $this->payload(['code' => 'OTRO2', 'rules' => [$this->rule(['benefit_type' => 'cash'])]]))
            ->assertStatus(422)
            ->assertJsonValidationErrors(['rules.0.benefit_type']);
    }

    public function test_a_percent_rule_cannot_exceed_100(): void
    {
        $admin = $this->platformAdmin();

        $response = $this->actingAs($admin, 'sanctum')
            ->postJson('/api/v1/admin/promotions', $this->payload(['rules' => [$this->rule(['benefit_value' => 150])]]));

        $response->assertStatus(422);
        $response->assertJsonValidationErrors(['rules']);
    }

    public function test_rejects_duplicate_rule_for_the_same_audience_and_duration(): void
    {
        $admin = $this->platformAdmin();

        $response = $this->actingAs($admin, 'sanctum')->postJson('/api/v1/admin/promotions', $this->payload([
            'rules' => [
                $this->rule(['audience' => 'athlete', 'duration_months' => 12, 'benefit_value' => 15]),
                $this->rule(['audience' => 'athlete', 'duration_months' => 12, 'benefit_value' => 20]),
            ],
        ]));

        $response->assertStatus(422);
        $response->assertJsonValidationErrors(['rules']);
        $this->assertDatabaseCount('promotions', 0);
    }

    public function test_valid_until_must_not_precede_valid_from(): void
    {
        $admin = $this->platformAdmin();

        $response = $this->actingAs($admin, 'sanctum')->postJson('/api/v1/admin/promotions', $this->payload([
            'valid_from' => '2026-12-31',
            'valid_until' => '2026-01-01',
        ]));

        $response->assertStatus(422);
        $response->assertJsonValidationErrors(['valid_until']);
    }

    public function test_defaults_to_active_true_when_omitted(): void
    {
        $admin = $this->platformAdmin();

        $response = $this->actingAs($admin, 'sanctum')->postJson('/api/v1/admin/promotions', $this->payload());

        $response->assertCreated();
        $response->assertJsonPath('promotion.active', true);
    }
}
