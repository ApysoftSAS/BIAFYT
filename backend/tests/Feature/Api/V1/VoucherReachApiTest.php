<?php

namespace Tests\Feature\Api\V1;

use App\Models\Branch;
use App\Models\Gym;
use App\Models\GymAssignment;
use App\Models\User;
use App\Models\Voucher;
use App\Models\VoucherCampaign;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

/**
 * Voucher reach: how long a voucher lasts (end of day on the gym's clock,
 * "valid N days"), issuing the same voucher to many members at once, and
 * shared codes with a cap that members claim themselves.
 */
class VoucherReachApiTest extends TestCase
{
    use RefreshDatabase;

    private Gym $gym;

    private Branch $norte;

    private Branch $sur;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        config(['app.report_timezone' => 'America/Bogota']); // UTC−5
        $this->travelTo(Carbon::parse('2026-11-18 10:00:00', 'UTC'));

        $this->gym = Gym::create(['name' => 'KAIROS']);
        $this->norte = Branch::create(['gym_id' => $this->gym->id, 'name' => 'Norte']);
        $this->sur = Branch::create(['gym_id' => $this->gym->id, 'name' => 'Sur']);
        $this->admin = $this->person(GymAssignment::ROLE_GYM_ADMIN);
    }

    private function person(string $role, ?Branch $branch = null, ?Gym $gym = null, string $status = GymAssignment::STATUS_ACTIVE): User
    {
        $user = User::factory()->create();
        GymAssignment::create([
            'user_id' => $user->id,
            'gym_id' => ($gym ?? $this->gym)->id,
            'branch_id' => $role === GymAssignment::ROLE_MEMBER ? ($branch ?? $this->norte)->id : null,
            'role' => $role,
            'status' => $status,
        ]);

        return $user;
    }

    private function member(?Branch $branch = null): User
    {
        return $this->person(GymAssignment::ROLE_MEMBER, $branch);
    }

    private function template(array $extra = []): array
    {
        return array_merge([
            'title' => 'Clase gratis',
            'benefit_type' => 'text',
            'benefit_description' => 'Una clase de cortesía',
        ], $extra);
    }

    private function gymUrl(string $path): string
    {
        return "/api/v1/me/gym/{$this->gym->id}/{$path}";
    }

    // ------------------------------------------------------------------
    // C. duration
    // ------------------------------------------------------------------

    public function test_a_bare_date_lasts_through_the_end_of_that_day_on_the_gym_clock(): void
    {
        $member = $this->member();
        $created = $this->actingAs($this->admin)
            ->postJson($this->gymUrl('vouchers'), $this->template(['athlete_user_id' => $member->id, 'expires_at' => '2026-11-20']))
            ->assertCreated();

        // End of 20 Nov in Bogotá (UTC−5) = 04:59:59 UTC on the 21st.
        $this->assertStringStartsWith('2026-11-21T04:59:59', $created->json('voucher.expires_at'));
        $id = $created->json('voucher.id');

        $this->travelTo(Carbon::parse('2026-11-21 04:00:00', 'UTC')); // still the 20th in Bogotá
        $this->actingAs($this->admin)->postJson($this->gymUrl("vouchers/{$id}/redeem"))->assertOk();

        $second = $this->actingAs($this->admin)
            ->postJson($this->gymUrl('vouchers'), $this->template(['athlete_user_id' => $this->member()->id, 'expires_at' => '2026-11-21']))
            ->json('voucher.id');
        $this->travelTo(Carbon::parse('2026-11-22 05:30:00', 'UTC')); // the 22nd in Bogotá
        $this->actingAs($this->admin)->postJson($this->gymUrl("vouchers/{$second}/redeem"))->assertStatus(422);
    }

    public function test_valid_days_counts_from_today_through_the_end_of_the_last_day(): void
    {
        $member = $this->member();
        $r = $this->actingAs($this->admin)
            ->postJson($this->gymUrl('vouchers'), $this->template(['athlete_user_id' => $member->id, 'valid_days' => 7]))
            ->assertCreated();

        // Today in Bogotá is 18 Nov (05:00 local); +7 days = 25 Nov, through 23:59:59 = 04:59:59 UTC on the 26th.
        $this->assertStringStartsWith('2026-11-26T04:59:59', $r->json('voucher.expires_at'));
    }

    public function test_expiry_inputs_are_validated(): void
    {
        $member = $this->member();
        $base = $this->template(['athlete_user_id' => $member->id]);

        $this->actingAs($this->admin)->postJson($this->gymUrl('vouchers'), $base + ['expires_at' => '2026-12-01', 'valid_days' => 3])
            ->assertStatus(422)->assertJsonValidationErrors('valid_days');
        $this->actingAs($this->admin)->postJson($this->gymUrl('vouchers'), $base + ['expires_at' => '2026-11-10'])
            ->assertStatus(422)->assertJsonValidationErrors('expires_at');
        foreach ([0, 366] as $days) {
            $this->actingAs($this->admin)->postJson($this->gymUrl('vouchers'), $base + ['valid_days' => $days])
                ->assertStatus(422)->assertJsonValidationErrors('valid_days');
        }
        $this->assertSame(0, Voucher::count());

        $this->actingAs($this->admin)->postJson($this->gymUrl('vouchers'), $base)->assertCreated()->assertJsonPath('voucher.expires_at', null);
    }

    // ------------------------------------------------------------------
    // A. bulk
    // ------------------------------------------------------------------

    public function test_bulk_issue_to_all_active_members_gives_each_their_own_voucher(): void
    {
        $a = $this->member($this->norte);
        $b = $this->member($this->norte);
        $c = $this->member($this->sur);
        $this->person(GymAssignment::ROLE_MEMBER, $this->norte, null, GymAssignment::STATUS_INACTIVE); // revoked
        $this->person(GymAssignment::ROLE_COACH);

        $this->actingAs($this->admin)
            ->postJson($this->gymUrl('vouchers/bulk'), $this->template(['scope' => 'all', 'valid_days' => 30]))
            ->assertCreated()->assertJsonPath('issued', 3);

        $vouchers = Voucher::all();
        $this->assertCount(3, $vouchers);
        $this->assertCount(3, $vouchers->pluck('code')->unique());
        $this->assertEqualsCanonicalizing([$a->id, $b->id, $c->id], $vouchers->pluck('athlete_user_id')->all());

        $this->actingAs($a)->getJson('/api/v1/me/vouchers')->assertOk()->assertJsonCount(1, 'vouchers');
    }

    public function test_bulk_issue_by_branch_and_by_selection(): void
    {
        $n1 = $this->member($this->norte);
        $n2 = $this->member($this->norte);
        $s1 = $this->member($this->sur);

        $this->actingAs($this->admin)
            ->postJson($this->gymUrl('vouchers/bulk'), $this->template(['scope' => 'branch', 'branch_id' => $this->norte->id]))
            ->assertCreated()->assertJsonPath('issued', 2);
        $this->assertSame(0, Voucher::where('athlete_user_id', $s1->id)->count());

        $this->actingAs($this->admin)
            ->postJson($this->gymUrl('vouchers/bulk'), $this->template(['scope' => 'selected', 'athlete_user_ids' => [$n1->id, $s1->id]]))
            ->assertCreated()->assertJsonPath('issued', 2);
        $this->assertSame(2, Voucher::where('athlete_user_id', $n1->id)->count());
        $this->assertSame(0, Voucher::where('athlete_user_id', $n2->id)->where('id', '>', 2)->count());
    }

    public function test_bulk_issue_is_all_or_nothing_and_validates_the_audience(): void
    {
        $member = $this->member();
        $outsider = User::factory()->create();
        $foreign = Branch::create(['gym_id' => Gym::create(['name' => 'Otro'])->id, 'name' => 'X']);

        $this->actingAs($this->admin)
            ->postJson($this->gymUrl('vouchers/bulk'), $this->template(['scope' => 'selected', 'athlete_user_ids' => [$member->id, $outsider->id]]))
            ->assertStatus(422)->assertJsonValidationErrors('athlete_user_ids');
        $this->assertSame(0, Voucher::count());

        $this->actingAs($this->admin)->postJson($this->gymUrl('vouchers/bulk'), $this->template(['scope' => 'selected', 'athlete_user_ids' => []]))
            ->assertStatus(422);
        $this->actingAs($this->admin)->postJson($this->gymUrl('vouchers/bulk'), $this->template(['scope' => 'branch', 'branch_id' => $foreign->id]))
            ->assertStatus(422)->assertJsonValidationErrors('branch_id');
        $this->actingAs($this->admin)->postJson($this->gymUrl('vouchers/bulk'), $this->template(['scope' => 'everybody']))
            ->assertStatus(422)->assertJsonValidationErrors('scope');
        $this->actingAs($this->admin)->postJson($this->gymUrl('vouchers/bulk'), $this->template(['scope' => 'selected', 'athlete_user_ids' => range(1, 501)]))
            ->assertStatus(422);
        // A gym with no members.
        $this->actingAs($this->admin)->postJson($this->gymUrl('vouchers/bulk'), $this->template(['scope' => 'branch', 'branch_id' => $this->sur->id]))
            ->assertStatus(422)->assertJsonValidationErrors('scope');
    }

    public function test_only_the_gym_admin_can_issue_in_bulk(): void
    {
        $this->member();
        $payload = $this->template(['scope' => 'all']);
        $otherAdmin = $this->person(GymAssignment::ROLE_GYM_ADMIN, null, Gym::create(['name' => 'Otro']));

        $this->postJson($this->gymUrl('vouchers/bulk'), $payload)->assertStatus(401);
        foreach ([$this->person(GymAssignment::ROLE_STAFF), $this->member(), $otherAdmin, User::factory()->create()] as $user) {
            $this->actingAs($user)->postJson($this->gymUrl('vouchers/bulk'), $payload)->assertStatus(404);
        }
        $this->assertSame(0, Voucher::count());
    }

    // ------------------------------------------------------------------
    // B. shared codes with a cap
    // ------------------------------------------------------------------

    private function campaign(array $extra = []): VoucherCampaign
    {
        $id = $this->actingAs($this->admin)
            ->postJson($this->gymUrl('voucher-campaigns'), $this->template($extra))
            ->assertCreated()->json('campaign.id');

        return VoucherCampaign::findOrFail($id);
    }

    private function claim(User $user, string $code)
    {
        return $this->actingAs($user)->postJson('/api/v1/me/voucher-campaigns/claim', ['code' => $code]);
    }

    public function test_the_admin_creates_a_campaign_with_a_custom_or_generated_code(): void
    {
        $c = $this->campaign(['code' => 'verano30', 'max_claims' => 50, 'valid_days' => 7]);
        $this->assertSame('VERANO30', $c->code);
        $this->assertSame(50, $c->max_claims);

        $generated = $this->campaign();
        $this->assertMatchesRegularExpression('/^[0-9A-HJKMNP-TV-Z]{8}$/', $generated->code);
        $this->assertNull($generated->max_claims);

        $this->actingAs($this->admin)->postJson($this->gymUrl('voucher-campaigns'), $this->template(['code' => 'VERANO30']))
            ->assertStatus(422)->assertJsonValidationErrors('code');
        $this->actingAs($this->admin)->postJson($this->gymUrl('voucher-campaigns'), $this->template(['code' => 'a b!']))
            ->assertStatus(422)->assertJsonValidationErrors('code');
        $this->actingAs($this->admin)->postJson($this->gymUrl('voucher-campaigns'), $this->template(['max_claims' => 0]))
            ->assertStatus(422)->assertJsonValidationErrors('max_claims');

        $list = $this->actingAs($this->admin)->getJson($this->gymUrl('voucher-campaigns'))->assertOk()->assertJsonCount(2, 'campaigns');
        $this->assertSame('active', $list->json('campaigns.0.status'));
        $this->assertSame(0, $list->json('campaigns.0.claimed'));
    }

    public function test_a_member_claims_the_code_and_gets_a_personal_voucher_the_gym_can_redeem(): void
    {
        $campaign = $this->campaign(['code' => 'VERANO30', 'valid_days' => 7, 'benefit_type' => 'percent', 'benefit_value' => 30]);
        $member = $this->member();

        $r = $this->claim($member, '  verano30 ')->assertCreated();
        $r->assertJsonPath('voucher.title', 'Clase gratis')->assertJsonPath('voucher.via_code', true)->assertJsonPath('voucher.status', 'issued');
        $this->assertSame($campaign->expires_at->toIso8601String(), Carbon::parse($r->json('voucher.expires_at'))->toIso8601String());
        $this->assertStringStartsWith('VCH-', $r->json('voucher.code'));

        $this->actingAs($member)->getJson('/api/v1/me/vouchers')->assertJsonPath('vouchers.0.via_code', true);
        $this->actingAs($this->admin)->getJson($this->gymUrl('voucher-campaigns'))->assertJsonPath('campaigns.0.claimed', 1);

        $id = $r->json('voucher.id');
        $this->actingAs($this->admin)->postJson($this->gymUrl("vouchers/{$id}/redeem"))->assertOk()->assertJsonPath('voucher.status', 'redeemed');
    }

    public function test_each_member_claims_once_and_the_cap_is_enforced(): void
    {
        $this->campaign(['code' => 'PRIMEROS2', 'max_claims' => 2]);
        [$a, $b, $c] = [$this->member(), $this->member(), $this->member()];

        $this->claim($a, 'PRIMEROS2')->assertCreated();
        $this->claim($a, 'PRIMEROS2')->assertStatus(422)->assertJsonValidationErrors('code');
        $this->claim($b, 'PRIMEROS2')->assertCreated();
        $this->claim($c, 'PRIMEROS2')->assertStatus(422)->assertJsonValidationErrors('code');

        $this->assertSame(2, Voucher::whereNotNull('campaign_id')->count());
        $this->assertSame('full', $this->actingAs($this->admin)->getJson($this->gymUrl('voucher-campaigns'))->json('campaigns.0.status'));

        // A revoked claim still used its slot.
        $voucher = Voucher::where('athlete_user_id', $a->id)->first();
        $this->actingAs($this->admin)->postJson($this->gymUrl("vouchers/{$voucher->id}/revoke"))->assertOk();
        $this->claim($c, 'PRIMEROS2')->assertStatus(422);
    }

    public function test_the_same_message_hides_whether_a_code_exists_for_non_members(): void
    {
        $this->postJson('/api/v1/me/voucher-campaigns/claim', ['code' => 'SOLOKAIROS'])->assertStatus(401);

        $this->campaign(['code' => 'SOLOKAIROS']);
        $otherGym = Gym::create(['name' => 'Otro']);
        $otherBranch = Branch::create(['gym_id' => $otherGym->id, 'name' => 'Z']);
        $foreignMember = $this->person(GymAssignment::ROLE_MEMBER, $otherBranch, $otherGym);

        $unknown = $this->claim($foreignMember, 'NOEXISTE')->assertStatus(422)->json('errors.code.0');
        $this->assertSame($unknown, $this->claim($foreignMember, 'SOLOKAIROS')->assertStatus(422)->json('errors.code.0'));
        $this->assertSame($unknown, $this->claim(User::factory()->create(), 'SOLOKAIROS')->assertStatus(422)->json('errors.code.0'));
        $this->assertSame($unknown, $this->claim($this->person(GymAssignment::ROLE_STAFF), 'SOLOKAIROS')->assertStatus(422)->json('errors.code.0'));
        $this->assertSame(0, Voucher::count());
    }

    public function test_closed_and_expired_campaigns_stop_claims_but_keep_issued_vouchers(): void
    {
        $closing = $this->campaign(['code' => 'CERRAR']);
        $expiring = $this->campaign(['code' => 'VENCE', 'valid_days' => 1]);
        [$a, $b] = [$this->member(), $this->member()];

        $this->claim($a, 'CERRAR')->assertCreated();
        $this->actingAs($this->admin)->postJson($this->gymUrl("voucher-campaigns/{$closing->id}/close"))->assertOk()->assertJsonPath('campaign.status', 'closed');
        $this->claim($b, 'CERRAR')->assertStatus(422);
        $this->assertSame('issued', Voucher::where('athlete_user_id', $a->id)->first()->status);

        $this->claim($a, 'VENCE')->assertCreated();
        $this->travel(3)->days();
        $this->claim($b, 'VENCE')->assertStatus(422);
        $this->assertSame('expired', $this->actingAs($this->admin)->getJson($this->gymUrl('voucher-campaigns'))->json('campaigns.0.status'));
    }

    public function test_only_the_gym_admin_manages_campaigns(): void
    {
        $campaign = $this->campaign(['code' => 'ADMINONLY']);
        $otherAdmin = $this->person(GymAssignment::ROLE_GYM_ADMIN, null, Gym::create(['name' => 'Otro']));

        foreach ([$this->person(GymAssignment::ROLE_STAFF), $this->member(), $otherAdmin, User::factory()->create()] as $user) {
            $this->actingAs($user)->getJson($this->gymUrl('voucher-campaigns'))->assertStatus(404);
            $this->actingAs($user)->postJson($this->gymUrl('voucher-campaigns'), $this->template())->assertStatus(404);
            $this->actingAs($user)->postJson($this->gymUrl("voucher-campaigns/{$campaign->id}/close"))->assertStatus(404);
        }
        $this->assertSame('active', $campaign->fresh()->status);
    }
}
