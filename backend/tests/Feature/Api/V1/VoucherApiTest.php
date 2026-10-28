<?php

namespace Tests\Feature\Api\V1;

use App\Models\Gym;
use App\Models\User;
use App\Models\Voucher;
use App\Support\Vouchers;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

/**
 * Fase Vouchers V1 — the athlete's read-only view (`me/vouchers*`). The
 * athlete sees only vouchers issued to them (by any gym or coach), cannot
 * issue/redeem/revoke, and cannot reach another athlete's voucher.
 */
class VoucherApiTest extends TestCase
{
    use RefreshDatabase;

    private function gymVoucher(User $athlete, array $overrides = []): Voucher
    {
        $gym = Gym::create(['name' => 'G']);
        $admin = User::factory()->create();

        return Vouchers::issue(array_merge([
            'gym_id' => $gym->id,
            'coach_user_id' => null,
            'issued_by_user_id' => $admin->id,
            'athlete_user_id' => $athlete->id,
            'title' => 'Descuento gym',
            'benefit_type' => Voucher::BENEFIT_PERCENT,
            'benefit_value' => 20,
            'benefit_description' => '20% mensualidad',
        ], $overrides));
    }

    private function coachVoucher(User $athlete, array $overrides = []): Voucher
    {
        $coach = User::factory()->create();

        return Vouchers::issue(array_merge([
            'gym_id' => null,
            'coach_user_id' => $coach->id,
            'issued_by_user_id' => $coach->id,
            'athlete_user_id' => $athlete->id,
            'title' => 'Descuento sesión',
            'benefit_type' => Voucher::BENEFIT_TEXT,
            'benefit_value' => null,
            'benefit_description' => 'Sesión de valoración gratis',
        ], $overrides));
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    public function test_endpoints_require_authentication(): void
    {
        $this->getJson('/api/v1/me/vouchers')->assertStatus(401);
        $this->getJson('/api/v1/me/vouchers/1')->assertStatus(401);
    }

    public function test_lists_only_the_athletes_own_vouchers_from_any_issuer(): void
    {
        $athlete = User::factory()->create();
        $other = User::factory()->create();

        $g = $this->gymVoucher($athlete);
        $c = $this->coachVoucher($athlete);
        $this->gymVoucher($other); // de otro atleta

        $response = $this->actingAs($athlete)->getJson('/api/v1/me/vouchers')->assertOk();

        $ids = collect($response->json('vouchers'))->pluck('id')->sort()->values()->all();
        $this->assertSame([$g->id, $c->id], collect($ids)->sort()->values()->all());
        $this->assertContains('gym', collect($response->json('vouchers'))->pluck('issuer_type')->all());
        $this->assertContains('coach', collect($response->json('vouchers'))->pluck('issuer_type')->all());
    }

    public function test_cannot_see_another_athletes_voucher(): void
    {
        $athlete = User::factory()->create();
        $other = User::factory()->create();
        $v = $this->gymVoucher($other);

        $this->actingAs($athlete)->getJson("/api/v1/me/vouchers/{$v->id}")->assertStatus(404);
    }

    public function test_athlete_has_no_write_endpoints(): void
    {
        $athlete = User::factory()->create();
        $v = $this->gymVoucher($athlete);

        $this->actingAs($athlete)->postJson('/api/v1/me/vouchers', [])->assertStatus(405);
        $this->actingAs($athlete)->postJson("/api/v1/me/vouchers/{$v->id}/redeem")->assertStatus(404);
        $this->actingAs($athlete)->deleteJson("/api/v1/me/vouchers/{$v->id}")->assertStatus(405);
    }

    public function test_status_filter_and_pagination(): void
    {
        $athlete = User::factory()->create();
        $issuer = User::factory()->create();
        $a = $this->gymVoucher($athlete);
        $b = $this->gymVoucher($athlete);
        $c = $this->gymVoucher($athlete);
        Vouchers::redeem($b, $issuer, null);

        $issued = $this->actingAs($athlete)->getJson('/api/v1/me/vouchers?status=issued')->assertOk();
        $this->assertCount(2, $issued->json('vouchers'));

        $redeemed = $this->actingAs($athlete)->getJson('/api/v1/me/vouchers?status=redeemed')->assertOk();
        $this->assertCount(1, $redeemed->json('vouchers'));
        $this->assertSame($b->id, $redeemed->json('vouchers.0.id'));

        $page1 = $this->actingAs($athlete)->getJson('/api/v1/me/vouchers?limit=2')->assertOk();
        $this->assertCount(2, $page1->json('vouchers'));
        $this->assertTrue($page1->json('has_more'));

        $page2 = $this->actingAs($athlete)
            ->getJson('/api/v1/me/vouchers?limit=2&cursor='.urlencode($page1->json('next_cursor')))->assertOk();
        $this->assertCount(1, $page2->json('vouchers'));
        $this->assertFalse($page2->json('has_more'));

        $seen = array_merge(array_column($page1->json('vouchers'), 'id'), array_column($page2->json('vouchers'), 'id'));
        $this->assertSame([$c->id, $b->id, $a->id], $seen); // newest first, sin huecos/repes
    }

    public function test_a_past_expires_at_reads_as_expired(): void
    {
        Carbon::setTestNow('2026-09-15 12:00:00');
        $athlete = User::factory()->create();
        $v = $this->gymVoucher($athlete, ['expires_at' => '2026-09-14 12:00:00']);

        $this->actingAs($athlete)->getJson("/api/v1/me/vouchers/{$v->id}")
            ->assertOk()
            ->assertJsonPath('voucher.status', 'expired');
    }

    public function test_response_shape_hides_internal_audit_ids(): void
    {
        $athlete = User::factory()->create();
        $v = $this->gymVoucher($athlete);

        $body = $this->actingAs($athlete)->getJson("/api/v1/me/vouchers/{$v->id}")->json('voucher');

        $this->assertSame([
            'id', 'code', 'issuer_type', 'gym', 'coach', 'athlete', 'title',
            'benefit_type', 'benefit_value', 'benefit_description', 'applies_to',
            'status', 'expires_at', 'redeemed_at', 'redemption_note',
            'revoked_at', 'revoke_reason', 'created_at',
        ], array_keys($body));
        $this->assertArrayNotHasKey('issued_by_user_id', $body);
        $this->assertArrayNotHasKey('redeemed_by_user_id', $body);
    }
}
