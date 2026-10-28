<?php

namespace Tests\Feature\Api\V1;

use App\Models\EquipmentRequest;
use App\Models\Gym;
use App\Models\GymAssignment;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Gym side of equipment-catalog requests (slice D-GYM-EQUIPMENT-REQUEST).
 * Gated per gym by an active gym_admin GymAssignment (404 for anyone else).
 * The gym files a request, can edit + resubmit while pending /
 * changes_requested, and never decides the outcome.
 */
class EquipmentRequestApiTest extends TestCase
{
    use RefreshDatabase;

    private function admin(Gym $gym): User
    {
        $user = User::factory()->create();
        GymAssignment::create([
            'user_id' => $user->id, 'gym_id' => $gym->id, 'branch_id' => null,
            'role' => GymAssignment::ROLE_GYM_ADMIN, 'status' => GymAssignment::STATUS_ACTIVE,
        ]);

        return $user;
    }

    private function payload(array $over = []): array
    {
        return array_merge([
            'name' => 'Prensa Hammer Strength',
            'brand' => 'Hammer Strength',
            'model' => 'ISO-Lateral Leg Press',
            'description' => 'Prensa de placas con recorrido isolateral.',
            'category' => 'Piernas',
        ], $over);
    }

    // ---------------- gate ----------------

    public function test_requires_auth(): void
    {
        $this->getJson('/api/v1/me/gym/1/equipment-requests')->assertStatus(401);
        $this->postJson('/api/v1/me/gym/1/equipment-requests', [])->assertStatus(401);
    }

    public function test_plain_user_and_foreign_gym_admin_get_404(): void
    {
        $a = Gym::create(['name' => 'Gym A']);
        $b = Gym::create(['name' => 'Gym B']);
        $plain = User::factory()->create();
        $adminA = $this->admin($a);

        $this->actingAs($plain)->getJson("/api/v1/me/gym/{$a->id}/equipment-requests")->assertNotFound();
        $this->actingAs($adminA)->getJson("/api/v1/me/gym/{$b->id}/equipment-requests")->assertNotFound();
        $this->actingAs($adminA)->postJson("/api/v1/me/gym/{$b->id}/equipment-requests", $this->payload())->assertNotFound();
    }

    // ---------------- create ----------------

    public function test_gym_admin_creates_a_pending_request_with_an_audit_event(): void
    {
        $gym = Gym::create(['name' => 'KAIROS']);
        $admin = $this->admin($gym);

        $res = $this->actingAs($admin)->postJson("/api/v1/me/gym/{$gym->id}/equipment-requests", $this->payload())
            ->assertStatus(201)
            ->assertJsonPath('equipment_request.status', 'pending')
            ->assertJsonPath('equipment_request.name', 'Prensa Hammer Strength')
            ->assertJsonPath('equipment_request.events.0.action', 'submitted');

        $this->assertDatabaseHas('equipment_requests', [
            'id' => $res->json('equipment_request.id'),
            'gym_id' => $gym->id,
            'requested_by_user_id' => $admin->id,
            'status' => 'pending',
        ]);
        // The gym-facing shape never leaks internal ids.
        $res->assertJsonMissingPath('equipment_request.requested_by_user_id');
    }

    public function test_photo_urls_must_be_urls(): void
    {
        $gym = Gym::create(['name' => 'KAIROS']);
        $admin = $this->admin($gym);

        $this->actingAs($admin)->postJson("/api/v1/me/gym/{$gym->id}/equipment-requests", $this->payload([
            'photo_urls' => ['not-a-url'],
        ]))->assertStatus(422)->assertJsonValidationErrorFor('photo_urls.0');
    }

    // ---------------- isolation ----------------

    public function test_a_gym_only_sees_its_own_requests(): void
    {
        $a = Gym::create(['name' => 'Gym A']);
        $b = Gym::create(['name' => 'Gym B']);
        $adminA = $this->admin($a);
        $adminB = $this->admin($b);

        $idA = $this->actingAs($adminA)->postJson("/api/v1/me/gym/{$a->id}/equipment-requests", $this->payload(['name' => 'De A']))->json('equipment_request.id');
        $this->actingAs($adminB)->postJson("/api/v1/me/gym/{$b->id}/equipment-requests", $this->payload(['name' => 'De B']))->json('equipment_request.id');

        $listA = $this->actingAs($adminA)->getJson("/api/v1/me/gym/{$a->id}/equipment-requests")->json('equipment_requests');
        $this->assertCount(1, $listA);
        $this->assertSame('De A', $listA[0]['name']);

        // B's admin cannot read A's request through B's (or A's) gym path.
        $this->actingAs($adminB)->getJson("/api/v1/me/gym/{$b->id}/equipment-requests/{$idA}")->assertNotFound();
        $this->actingAs($adminB)->getJson("/api/v1/me/gym/{$a->id}/equipment-requests/{$idA}")->assertNotFound();
    }

    // ---------------- edit + resubmit ----------------

    public function test_gym_edits_a_pending_request_without_a_status_change(): void
    {
        $gym = Gym::create(['name' => 'KAIROS']);
        $admin = $this->admin($gym);
        $id = $this->actingAs($admin)->postJson("/api/v1/me/gym/{$gym->id}/equipment-requests", $this->payload())->json('equipment_request.id');

        $this->actingAs($admin)->putJson("/api/v1/me/gym/{$gym->id}/equipment-requests/{$id}", $this->payload(['name' => 'Prensa 45°']))
            ->assertOk()
            ->assertJsonPath('equipment_request.status', 'pending')
            ->assertJsonPath('equipment_request.name', 'Prensa 45°');
    }

    public function test_editing_a_changes_requested_request_moves_it_back_to_pending_and_clears_the_note(): void
    {
        $gym = Gym::create(['name' => 'KAIROS']);
        $admin = $this->admin($gym);
        $req = EquipmentRequest::create([
            'gym_id' => $gym->id, 'requested_by_user_id' => $admin->id,
            'status' => EquipmentRequest::STATUS_CHANGES_REQUESTED,
            'name' => 'Prensa', 'review_note' => 'Falta la marca.',
        ]);

        $res = $this->actingAs($admin)->putJson("/api/v1/me/gym/{$gym->id}/equipment-requests/{$req->id}", $this->payload())
            ->assertOk()
            ->assertJsonPath('equipment_request.status', 'pending')
            ->assertJsonPath('equipment_request.review_note', null);

        $actions = collect($res->json('equipment_request.events'))->pluck('action');
        $this->assertTrue($actions->contains('resubmitted'));
    }

    public function test_gym_cannot_edit_a_request_that_is_in_review_or_terminal(): void
    {
        $gym = Gym::create(['name' => 'KAIROS']);
        $admin = $this->admin($gym);

        foreach (['in_review', 'approved', 'rejected'] as $status) {
            $req = EquipmentRequest::create([
                'gym_id' => $gym->id, 'requested_by_user_id' => $admin->id,
                'status' => $status, 'name' => 'X',
            ]);
            $this->actingAs($admin)->putJson("/api/v1/me/gym/{$gym->id}/equipment-requests/{$req->id}", $this->payload())
                ->assertStatus(422)->assertJsonValidationErrorFor('status');
        }
    }

    public function test_non_numeric_request_segment_is_404_at_router(): void
    {
        $gym = Gym::create(['name' => 'KAIROS']);
        $admin = $this->admin($gym);

        $this->actingAs($admin)->getJson("/api/v1/me/gym/{$gym->id}/equipment-requests/abc")->assertNotFound();
    }
}
