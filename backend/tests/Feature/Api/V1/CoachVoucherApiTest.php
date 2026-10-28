<?php

namespace Tests\Feature\Api\V1;

use App\Models\CoachAthleteRelationship;
use App\Models\Gym;
use App\Models\GymAssignment;
use App\Models\User;
use App\Models\Voucher;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Fase Vouchers V1 — a coach issues/lists/redeems/revokes ecosystem
 * vouchers for an athlete they have a currently `active` relationship with.
 * Focus: the relationship gate (404 for missing/pending/revoked), the
 * athlete coming from the route (never the body), and cross-coach /
 * cross-athlete isolation. GymAssignment plays no part.
 */
class CoachVoucherApiTest extends TestCase
{
    use RefreshDatabase;

    private function coach(): User
    {
        $coach = User::factory()->create();
        $gym = Gym::create(['name' => 'Coach Gym']);
        GymAssignment::create(['user_id' => $coach->id, 'gym_id' => $gym->id, 'branch_id' => null, 'role' => GymAssignment::ROLE_COACH, 'status' => GymAssignment::STATUS_ACTIVE]);

        return $coach;
    }

    private function relate(User $coach, User $athlete, string $status): void
    {
        CoachAthleteRelationship::create([
            'coach_user_id' => $coach->id,
            'athlete_user_id' => $athlete->id,
            'status' => $status,
            'requested_at' => now()->subDay(),
            'activated_at' => $status === CoachAthleteRelationship::STATUS_PENDING ? null : now()->subDay(),
            'revoked_at' => $status === CoachAthleteRelationship::STATUS_REVOKED ? now() : null,
        ]);
    }

    /** @return array<string, mixed> */
    private function payload(array $overrides = []): array
    {
        return array_merge([
            'title' => 'Descuento sesión',
            'benefit_type' => 'percent',
            'benefit_value' => 15,
            'benefit_description' => '15% en una sesión personalizada',
            'applies_to' => 'sesión',
        ], $overrides);
    }

    private function baseUrl(User $athlete): string
    {
        return "/api/v1/me/coach/athletes/{$athlete->id}/vouchers";
    }

    public function test_endpoints_require_authentication(): void
    {
        $athlete = User::factory()->create();
        $this->getJson($this->baseUrl($athlete))->assertStatus(401);
        $this->postJson($this->baseUrl($athlete), [])->assertStatus(401);
    }

    public function test_only_a_coach_with_an_active_relationship_can_issue(): void
    {
        $coach = $this->coach();
        $activeAthlete = User::factory()->create();
        $pendingAthlete = User::factory()->create();
        $revokedAthlete = User::factory()->create();
        $unrelated = User::factory()->create();

        $this->relate($coach, $activeAthlete, CoachAthleteRelationship::STATUS_ACTIVE);
        $this->relate($coach, $pendingAthlete, CoachAthleteRelationship::STATUS_PENDING);
        $this->relate($coach, $revokedAthlete, CoachAthleteRelationship::STATUS_REVOKED);

        $this->actingAs($coach)->postJson($this->baseUrl($activeAthlete), $this->payload())->assertCreated();

        foreach ([$pendingAthlete, $revokedAthlete, $unrelated] as $athlete) {
            $this->actingAs($coach)->postJson($this->baseUrl($athlete), $this->payload())->assertStatus(404);
        }
        $this->assertDatabaseCount('vouchers', 1);
    }

    public function test_issues_with_athlete_from_the_route_and_coach_from_the_token(): void
    {
        $coach = $this->coach();
        $athlete = User::factory()->create(['name' => 'Bea']);
        $someoneElse = User::factory()->create();
        $this->relate($coach, $athlete, CoachAthleteRelationship::STATUS_ACTIVE);

        $response = $this->actingAs($coach)->postJson($this->baseUrl($athlete), $this->payload([
            'athlete_user_id' => $someoneElse->id, // ignorado
            'coach_user_id' => $someoneElse->id,   // ignorado
            'gym_id' => 99,                        // ignorado
        ]));

        $response->assertCreated()
            ->assertJsonPath('voucher.issuer_type', 'coach')
            ->assertJsonPath('voucher.coach.id', $coach->id)
            ->assertJsonPath('voucher.athlete.id', $athlete->id);

        $this->assertDatabaseHas('vouchers', [
            'coach_user_id' => $coach->id,
            'gym_id' => null,
            'issued_by_user_id' => $coach->id,
            'athlete_user_id' => $athlete->id,
        ]);
    }

    // El gate es la relación, NO un GymAssignment compartido (paridad con
    // los programas del coach en Fase 5).
    public function test_a_coach_without_a_shared_gym_can_still_issue(): void
    {
        $coach = $this->coach();
        $athlete = User::factory()->create(); // sin GymAssignment
        $this->relate($coach, $athlete, CoachAthleteRelationship::STATUS_ACTIVE);

        $this->actingAs($coach)->postJson($this->baseUrl($athlete), $this->payload())->assertCreated();
    }

    public function test_list_is_scoped_to_this_coach_and_athlete(): void
    {
        $coachA = $this->coach();
        $coachB = $this->coach();
        $athlete1 = User::factory()->create();
        $athlete2 = User::factory()->create();

        $this->relate($coachA, $athlete1, CoachAthleteRelationship::STATUS_ACTIVE);
        $this->relate($coachA, $athlete2, CoachAthleteRelationship::STATUS_ACTIVE);
        $this->relate($coachB, $athlete1, CoachAthleteRelationship::STATUS_ACTIVE);

        $this->actingAs($coachA)->postJson($this->baseUrl($athlete1), $this->payload())->assertCreated();
        $this->actingAs($coachA)->postJson($this->baseUrl($athlete2), $this->payload())->assertCreated();
        $this->actingAs($coachB)->postJson($this->baseUrl($athlete1), $this->payload())->assertCreated();

        // coachA / athlete1 → solo el suyo para ese atleta
        $list = $this->actingAs($coachA)->getJson($this->baseUrl($athlete1))->assertOk();
        $this->assertCount(1, $list->json('vouchers'));
        $this->assertSame($coachA->id, $list->json('vouchers.0.coach.id'));
    }

    public function test_cannot_touch_another_coachs_voucher_or_another_athletes(): void
    {
        $coachA = $this->coach();
        $coachB = $this->coach();
        $athlete1 = User::factory()->create();
        $athlete2 = User::factory()->create();
        $this->relate($coachA, $athlete1, CoachAthleteRelationship::STATUS_ACTIVE);
        $this->relate($coachB, $athlete1, CoachAthleteRelationship::STATUS_ACTIVE);
        $this->relate($coachA, $athlete2, CoachAthleteRelationship::STATUS_ACTIVE);

        $id = $this->actingAs($coachA)->postJson($this->baseUrl($athlete1), $this->payload())->json('voucher.id');

        // coachB (tiene relación con athlete1 pero no emitió ESTE voucher)
        $this->actingAs($coachB)->getJson("{$this->baseUrl($athlete1)}/{$id}")->assertStatus(404);
        $this->actingAs($coachB)->postJson("{$this->baseUrl($athlete1)}/{$id}/redeem")->assertStatus(404);
        // coachA pero por la ruta del atleta equivocado
        $this->actingAs($coachA)->getJson("{$this->baseUrl($athlete2)}/{$id}")->assertStatus(404);
    }

    public function test_redeem_and_revoke_lifecycle(): void
    {
        $coach = $this->coach();
        $athlete = User::factory()->create();
        $this->relate($coach, $athlete, CoachAthleteRelationship::STATUS_ACTIVE);
        $url = $this->baseUrl($athlete);

        $id = $this->actingAs($coach)->postJson($url, $this->payload())->json('voucher.id');

        $this->actingAs($coach)->postJson("{$url}/{$id}/redeem", ['note' => 'sesión del martes'])
            ->assertOk()->assertJsonPath('voucher.status', 'redeemed');
        $this->actingAs($coach)->postJson("{$url}/{$id}/redeem")
            ->assertStatus(422)->assertJsonValidationErrors('status');

        $id2 = $this->actingAs($coach)->postJson($url, $this->payload())->json('voucher.id');
        $this->actingAs($coach)->postJson("{$url}/{$id2}/revoke", ['reason' => 'cambio de plan'])
            ->assertOk()->assertJsonPath('voucher.status', 'revoked');
    }
}
