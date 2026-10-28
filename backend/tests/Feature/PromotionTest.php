<?php

namespace Tests\Feature;

use App\Models\Promotion;
use App\Models\PromotionRedemption;
use App\Models\PromotionRule;
use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PromotionTest extends TestCase
{
    use RefreshDatabase;

    public function test_unique_code_rejects_a_duplicate(): void
    {
        Promotion::create(['code' => 'WELCOME10']);

        $this->expectException(QueryException::class);

        Promotion::create(['code' => 'WELCOME10']);
    }

    public function test_a_promotion_can_have_multiple_rules_across_audiences_and_durations(): void
    {
        $promotion = Promotion::create(['code' => 'ANIVERSARIO2026']);

        $promotion->rules()->create([
            'audience' => PromotionRule::AUDIENCE_ATHLETE, 'duration_months' => 12,
            'benefit_type' => PromotionRule::BENEFIT_PERCENT, 'benefit_value' => 15,
        ]);
        $promotion->rules()->create([
            'audience' => PromotionRule::AUDIENCE_COACH, 'duration_months' => 12,
            'benefit_type' => PromotionRule::BENEFIT_PERCENT, 'benefit_value' => 25,
        ]);

        $this->assertCount(2, $promotion->fresh()->rules);
    }

    public function test_duplicate_rule_for_the_same_audience_and_duration_is_rejected_at_db_level(): void
    {
        $promotion = Promotion::create(['code' => 'ANIVERSARIO2026']);
        $promotion->rules()->create([
            'audience' => 'athlete', 'duration_months' => 12,
            'benefit_type' => 'percent', 'benefit_value' => 15,
        ]);

        $this->expectException(QueryException::class);

        $promotion->rules()->create([
            'audience' => 'athlete', 'duration_months' => 12,
            'benefit_type' => 'percent', 'benefit_value' => 20,
        ]);
    }

    public function test_deleting_a_promotion_cascades_its_rules(): void
    {
        $promotion = Promotion::create(['code' => 'ANIVERSARIO2026']);
        $rule = $promotion->rules()->create([
            'audience' => 'athlete', 'duration_months' => 12,
            'benefit_type' => 'percent', 'benefit_value' => 15,
        ]);

        $promotion->delete();

        $this->assertDatabaseMissing('promotion_rules', ['id' => $rule->id]);
    }

    public function test_unique_promotion_and_user_rejects_a_duplicate_redemption(): void
    {
        $promotion = Promotion::create(['code' => 'WELCOME10']);
        $user = User::factory()->create();

        PromotionRedemption::create([
            'promotion_id' => $promotion->id,
            'user_id' => $user->id,
            'benefit_type' => 'percent',
            'benefit_value' => 10,
            'benefit_description' => 'Primer mes con 10% de descuento.',
        ]);

        $this->expectException(QueryException::class);

        PromotionRedemption::create([
            'promotion_id' => $promotion->id,
            'user_id' => $user->id,
            'benefit_type' => 'percent',
            'benefit_value' => 10,
            'benefit_description' => 'Primer mes con 10% de descuento.',
        ]);
    }

    public function test_redemption_snapshot_is_independent_of_the_promotion(): void
    {
        $promotion = Promotion::create(['code' => 'WELCOME10']);
        $user = User::factory()->create();

        $redemption = PromotionRedemption::create([
            'promotion_id' => $promotion->id,
            'user_id' => $user->id,
            'benefit_type' => 'percent',
            'benefit_value' => 10,
            'benefit_description' => 'Primer mes con 10% de descuento.',
        ]);

        $promotion->update(['active' => false]);

        $this->assertSame(10, $redemption->fresh()->benefit_value);
        $this->assertSame('Primer mes con 10% de descuento.', $redemption->fresh()->benefit_description);
    }

    public function test_redemption_survives_deleting_the_promotion(): void
    {
        $promotion = Promotion::create(['code' => 'WELCOME10']);
        $user = User::factory()->create();

        $redemption = PromotionRedemption::create([
            'promotion_id' => $promotion->id,
            'user_id' => $user->id,
            'benefit_type' => 'text',
            'benefit_value' => null,
            'benefit_description' => 'Una clase de prueba gratis.',
        ]);

        $promotion->delete();

        $this->assertNull($redemption->fresh()->promotion_id);
        $this->assertDatabaseHas('promotion_redemptions', ['id' => $redemption->id]);
    }

    public function test_deleting_the_user_cascades_their_redemption(): void
    {
        $promotion = Promotion::create(['code' => 'WELCOME10']);
        $user = User::factory()->create();

        $redemption = PromotionRedemption::create([
            'promotion_id' => $promotion->id,
            'user_id' => $user->id,
            'benefit_type' => 'text',
            'benefit_value' => null,
            'benefit_description' => 'Una clase de prueba gratis.',
        ]);

        $user->delete();

        $this->assertDatabaseMissing('promotion_redemptions', ['id' => $redemption->id]);
    }

    public function test_created_by_user_id_is_hidden_from_the_public_contract(): void
    {
        $admin = User::factory()->create();

        $promotion = Promotion::create(['code' => 'WELCOME10', 'created_by_user_id' => $admin->id]);

        $this->assertArrayNotHasKey('created_by_user_id', $promotion->toArray());
    }
}
