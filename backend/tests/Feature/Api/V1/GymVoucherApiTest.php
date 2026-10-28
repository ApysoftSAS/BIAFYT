<?php

namespace Tests\Feature\Api\V1;

use App\Models\Branch;
use App\Models\Gym;
use App\Models\GymAssignment;
use App\Models\User;
use App\Models\Voucher;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Fase Vouchers V1 — a gym_admin issues/lists/redeems/revokes ecosystem
 * vouchers for the active members of their own gym. Focus: the per-gym
 * gym_admin gate + the active-member recipient gate (anti-IDOR, 404 for
 * anyone/anything out of scope), and the single-use redemption.
 */
class GymVoucherApiTest extends TestCase
{
    use RefreshDatabase;

    private function gym(string $name = 'KAIROS'): Gym
    {
        return Gym::create(['name' => $name]);
    }

    private function admin(Gym $gym): User
    {
        $u = User::factory()->create();
        GymAssignment::create(['user_id' => $u->id, 'gym_id' => $gym->id, 'branch_id' => null, 'role' => GymAssignment::ROLE_GYM_ADMIN, 'status' => GymAssignment::STATUS_ACTIVE]);

        return $u;
    }

    private function member(Gym $gym, ?string $name = null, string $status = GymAssignment::STATUS_ACTIVE): User
    {
        $u = User::factory()->create($name ? ['name' => $name] : []);
        $branch = Branch::create(['gym_id' => $gym->id, 'name' => 'Sede']);
        GymAssignment::create(['user_id' => $u->id, 'gym_id' => $gym->id, 'branch_id' => $branch->id, 'role' => GymAssignment::ROLE_MEMBER, 'status' => $status]);

        return $u;
    }

    /** @return array<string, mixed> */
    private function payload(User $athlete, array $overrides = []): array
    {
        return array_merge([
            'athlete_user_id' => $athlete->id,
            'title' => 'Descuento mensualidad',
            'benefit_type' => 'percent',
            'benefit_value' => 20,
            'benefit_description' => '20% en la mensualidad del gimnasio',
            'applies_to' => 'mensualidad',
        ], $overrides);
    }

    // -----------------------------------------------------------------
    // gate
    // -----------------------------------------------------------------

    public function test_endpoints_require_authentication(): void
    {
        $gym = $this->gym();
        $this->getJson("/api/v1/me/gym/{$gym->id}/vouchers")->assertStatus(401);
        $this->postJson("/api/v1/me/gym/{$gym->id}/vouchers", [])->assertStatus(401);
    }

    public function test_a_non_gym_admin_gets_404(): void
    {
        $gym = $this->gym();
        $stranger = User::factory()->create();
        $member = $this->member($gym);

        $this->actingAs($stranger)->getJson("/api/v1/me/gym/{$gym->id}/vouchers")->assertStatus(404);
        $this->actingAs($member)->postJson("/api/v1/me/gym/{$gym->id}/vouchers", $this->payload($member))->assertStatus(404);
    }

    public function test_gym_admin_of_another_gym_gets_404(): void
    {
        $a = $this->gym('A');
        $b = $this->gym('B');
        $adminB = $this->admin($b);
        $memberA = $this->member($a);

        $this->actingAs($adminB)->postJson("/api/v1/me/gym/{$a->id}/vouchers", $this->payload($memberA))->assertStatus(404);
    }

    // -----------------------------------------------------------------
    // issue
    // -----------------------------------------------------------------

    public function test_issues_a_voucher_to_an_active_member(): void
    {
        $gym = $this->gym();
        $admin = $this->admin($gym);
        $member = $this->member($gym, 'Ana');

        $response = $this->actingAs($admin)->postJson("/api/v1/me/gym/{$gym->id}/vouchers", $this->payload($member));

        $response->assertCreated()
            ->assertJsonPath('voucher.issuer_type', 'gym')
            ->assertJsonPath('voucher.gym.id', $gym->id)
            ->assertJsonPath('voucher.athlete.id', $member->id)
            ->assertJsonPath('voucher.status', 'issued')
            ->assertJsonPath('voucher.benefit_type', 'percent')
            ->assertJsonPath('voucher.benefit_value', 20);

        $this->assertMatchesRegularExpression('/^VCH-[0-9A-HJKMNP-TV-Z]{12}$/', $response->json('voucher.code'));
        $this->assertDatabaseHas('vouchers', [
            'gym_id' => $gym->id,
            'coach_user_id' => null,
            'issued_by_user_id' => $admin->id,
            'athlete_user_id' => $member->id,
            'status' => 'issued',
        ]);
    }

    public function test_gym_id_and_issuer_are_never_taken_from_the_body(): void
    {
        $gym = $this->gym();
        $other = $this->gym('OTHER');
        $admin = $this->admin($gym);
        $member = $this->member($gym);

        $this->actingAs($admin)->postJson("/api/v1/me/gym/{$gym->id}/vouchers", $this->payload($member, [
            'gym_id' => $other->id,
            'coach_user_id' => $admin->id,
            'issued_by_user_id' => $member->id,
            'status' => 'redeemed',
        ]))->assertCreated()
            ->assertJsonPath('voucher.gym.id', $gym->id)
            ->assertJsonPath('voucher.status', 'issued');

        $this->assertDatabaseHas('vouchers', ['gym_id' => $gym->id, 'issued_by_user_id' => $admin->id]);
    }

    public function test_cannot_issue_to_a_non_member_or_inactive_member(): void
    {
        $gym = $this->gym();
        $admin = $this->admin($gym);
        $stranger = User::factory()->create();
        $inactive = $this->member($gym, null, GymAssignment::STATUS_INACTIVE);
        $otherGymMember = $this->member($this->gym('B'));

        foreach ([$stranger, $inactive, $otherGymMember] as $target) {
            $this->actingAs($admin)->postJson("/api/v1/me/gym/{$gym->id}/vouchers", $this->payload($target))
                ->assertStatus(404);
        }
        $this->assertDatabaseCount('vouchers', 0);
    }

    public function test_benefit_validation(): void
    {
        $gym = $this->gym();
        $admin = $this->admin($gym);
        $member = $this->member($gym);
        $url = "/api/v1/me/gym/{$gym->id}/vouchers";

        // percent sin value
        $this->actingAs($admin)->postJson($url, $this->payload($member, ['benefit_type' => 'percent', 'benefit_value' => null]))
            ->assertStatus(422)->assertJsonValidationErrors('benefit_value');

        // percent > 100
        $this->actingAs($admin)->postJson($url, $this->payload($member, ['benefit_type' => 'percent', 'benefit_value' => 150]))
            ->assertStatus(422)->assertJsonValidationErrors('benefit_value');

        // tipo desconocido
        $this->actingAs($admin)->postJson($url, $this->payload($member, ['benefit_type' => 'magic']))
            ->assertStatus(422)->assertJsonValidationErrors('benefit_type');

        // text: value se descarta, se acepta
        $this->actingAs($admin)->postJson($url, $this->payload($member, ['benefit_type' => 'text', 'benefit_value' => 99]))
            ->assertCreated()->assertJsonPath('voucher.benefit_value', null);
    }

    // -----------------------------------------------------------------
    // list / show / anti-IDOR
    // -----------------------------------------------------------------

    public function test_index_is_scoped_to_the_gym_with_status_filter_and_pagination(): void
    {
        $gym = $this->gym();
        $other = $this->gym('OTHER');
        $admin = $this->admin($gym);
        $adminOther = $this->admin($other);
        $m1 = $this->member($gym);
        $m2 = $this->member($gym);
        $mOther = $this->member($other);

        $this->actingAs($admin)->postJson("/api/v1/me/gym/{$gym->id}/vouchers", $this->payload($m1))->assertCreated();
        $v2 = $this->actingAs($admin)->postJson("/api/v1/me/gym/{$gym->id}/vouchers", $this->payload($m2))->json('voucher.id');
        $this->actingAs($adminOther)->postJson("/api/v1/me/gym/{$other->id}/vouchers", $this->payload($mOther))->assertCreated();

        $this->actingAs($admin)->postJson("/api/v1/me/gym/{$gym->id}/vouchers/{$v2}/revoke")->assertOk();

        $all = $this->actingAs($admin)->getJson("/api/v1/me/gym/{$gym->id}/vouchers")->assertOk();
        $this->assertCount(2, $all->json('vouchers')); // solo las de este gym

        $issued = $this->actingAs($admin)->getJson("/api/v1/me/gym/{$gym->id}/vouchers?status=issued")->assertOk();
        $this->assertCount(1, $issued->json('vouchers'));

        $limited = $this->actingAs($admin)->getJson("/api/v1/me/gym/{$gym->id}/vouchers?limit=1")->assertOk();
        $this->assertCount(1, $limited->json('vouchers'));
        $this->assertTrue($limited->json('has_more'));
        $this->assertIsString($limited->json('next_cursor'));
    }

    public function test_cannot_see_or_act_on_another_gyms_voucher(): void
    {
        $a = $this->gym('A');
        $b = $this->gym('B');
        $adminA = $this->admin($a);
        $adminB = $this->admin($b);
        $memberA = $this->member($a);

        $voucherId = $this->actingAs($adminA)->postJson("/api/v1/me/gym/{$a->id}/vouchers", $this->payload($memberA))->json('voucher.id');

        // adminB usando el id de {gym}=B con un voucher de A
        $this->actingAs($adminB)->getJson("/api/v1/me/gym/{$b->id}/vouchers/{$voucherId}")->assertStatus(404);
        $this->actingAs($adminB)->postJson("/api/v1/me/gym/{$b->id}/vouchers/{$voucherId}/redeem")->assertStatus(404);
        $this->actingAs($adminB)->postJson("/api/v1/me/gym/{$b->id}/vouchers/{$voucherId}/revoke")->assertStatus(404);
        // adminB apuntando a {gym}=A (no es admin de A)
        $this->actingAs($adminB)->getJson("/api/v1/me/gym/{$a->id}/vouchers/{$voucherId}")->assertStatus(404);
    }

    // -----------------------------------------------------------------
    // redeem / revoke lifecycle
    // -----------------------------------------------------------------

    public function test_redeem_is_single_use(): void
    {
        $gym = $this->gym();
        $admin = $this->admin($gym);
        $member = $this->member($gym);
        $id = $this->actingAs($admin)->postJson("/api/v1/me/gym/{$gym->id}/vouchers", $this->payload($member))->json('voucher.id');

        $this->actingAs($admin)->postJson("/api/v1/me/gym/{$gym->id}/vouchers/{$id}/redeem", ['note' => 'en recepción'])
            ->assertOk()
            ->assertJsonPath('voucher.status', 'redeemed')
            ->assertJsonPath('voucher.redemption_note', 'en recepción');

        $this->actingAs($admin)->postJson("/api/v1/me/gym/{$gym->id}/vouchers/{$id}/redeem")
            ->assertStatus(422)->assertJsonValidationErrors('status');

        // ya no se puede revocar
        $this->actingAs($admin)->postJson("/api/v1/me/gym/{$gym->id}/vouchers/{$id}/revoke")
            ->assertStatus(422)->assertJsonValidationErrors('status');
    }

    public function test_revoke_then_no_redeem(): void
    {
        $gym = $this->gym();
        $admin = $this->admin($gym);
        $member = $this->member($gym);
        $id = $this->actingAs($admin)->postJson("/api/v1/me/gym/{$gym->id}/vouchers", $this->payload($member))->json('voucher.id');

        $this->actingAs($admin)->postJson("/api/v1/me/gym/{$gym->id}/vouchers/{$id}/revoke", ['reason' => 'error'])
            ->assertOk()->assertJsonPath('voucher.status', 'revoked');

        $this->actingAs($admin)->postJson("/api/v1/me/gym/{$gym->id}/vouchers/{$id}/redeem")
            ->assertStatus(422)->assertJsonValidationErrors('status');
    }

    public function test_an_expired_voucher_cannot_be_redeemed(): void
    {
        $gym = $this->gym();
        $admin = $this->admin($gym);
        $member = $this->member($gym);

        $id = $this->actingAs($admin)->postJson("/api/v1/me/gym/{$gym->id}/vouchers", $this->payload($member, [
            'expires_at' => now()->subDay()->toIso8601String(),
        ]))->json('voucher.id');

        $this->actingAs($admin)->getJson("/api/v1/me/gym/{$gym->id}/vouchers/{$id}")
            ->assertOk()->assertJsonPath('voucher.status', 'expired');

        $this->actingAs($admin)->postJson("/api/v1/me/gym/{$gym->id}/vouchers/{$id}/redeem")
            ->assertStatus(422)->assertJsonValidationErrors('status');
    }
}
