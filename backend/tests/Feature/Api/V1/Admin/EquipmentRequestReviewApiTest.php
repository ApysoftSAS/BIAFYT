<?php

namespace Tests\Feature\Api\V1\Admin;

use App\Models\Equipment;
use App\Models\EquipmentRequest;
use App\Models\Gym;
use App\Models\GymAssignment;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * BIAFYT Admin review flow for equipment-catalog requests.
 * Gated by `User::is_platform_admin`. Transitions are validated; approving
 * resolves the duplicate question explicitly (associate existing OR create
 * new) and never touches any gym's inventory.
 */
class EquipmentRequestReviewApiTest extends TestCase
{
    use RefreshDatabase;

    private function platformAdmin(): User
    {
        $u = User::factory()->create();
        $u->forceFill(['is_platform_admin' => true])->save();

        return $u;
    }

    private function gymAdmin(Gym $gym): User
    {
        $u = User::factory()->create();
        GymAssignment::create([
            'user_id' => $u->id, 'gym_id' => $gym->id, 'branch_id' => null,
            'role' => GymAssignment::ROLE_GYM_ADMIN, 'status' => 'active',
        ]);

        return $u;
    }

    private function request(Gym $gym, User $requester, string $status = EquipmentRequest::STATUS_PENDING): EquipmentRequest
    {
        return EquipmentRequest::create([
            'gym_id' => $gym->id, 'requested_by_user_id' => $requester->id,
            'status' => $status, 'name' => 'Prensa Hammer Strength', 'brand' => 'Hammer Strength',
        ]);
    }

    // ---------------- gate + anti-IDOR ----------------

    public function test_unauthenticated_is_401(): void
    {
        $this->getJson('/api/v1/admin/equipment-requests')->assertStatus(401);
        $this->postJson('/api/v1/admin/equipment-requests/1/approve', [])->assertStatus(401);
    }

    public function test_non_admin_gets_404_on_every_review_endpoint(): void
    {
        $gym = Gym::create(['name' => 'KAIROS']);
        $ga = $this->gymAdmin($gym);
        $req = $this->request($gym, $ga);

        // the gym_admin who filed it still cannot review it
        $this->actingAs($ga)->getJson('/api/v1/admin/equipment-requests')->assertNotFound();
        $this->actingAs($ga)->getJson("/api/v1/admin/equipment-requests/{$req->id}")->assertNotFound();
        $this->actingAs($ga)->postJson("/api/v1/admin/equipment-requests/{$req->id}/start-review")->assertNotFound();
        $this->actingAs($ga)->postJson("/api/v1/admin/equipment-requests/{$req->id}/approve", ['create_equipment' => true])->assertNotFound();
    }

    public function test_index_filters_by_status_and_gym(): void
    {
        $admin = $this->platformAdmin();
        $g1 = Gym::create(['name' => 'G1']);
        $g2 = Gym::create(['name' => 'G2']);
        $this->request($g1, $this->gymAdmin($g1), EquipmentRequest::STATUS_PENDING);
        $this->request($g1, $this->gymAdmin($g1), EquipmentRequest::STATUS_APPROVED);
        $this->request($g2, $this->gymAdmin($g2), EquipmentRequest::STATUS_PENDING);

        $this->actingAs($admin)->getJson('/api/v1/admin/equipment-requests?status=pending')
            ->assertOk()->assertJsonCount(2, 'equipment_requests');
        $this->actingAs($admin)->getJson("/api/v1/admin/equipment-requests?gym_id={$g1->id}")
            ->assertOk()->assertJsonCount(2, 'equipment_requests');
        $this->actingAs($admin)->getJson("/api/v1/admin/equipment-requests?status=pending&gym_id={$g1->id}")
            ->assertOk()->assertJsonCount(1, 'equipment_requests');
    }

    // ---------------- transitions ----------------

    public function test_full_happy_path_pending_to_review_to_changes_to_pending_to_review_to_approved(): void
    {
        $admin = $this->platformAdmin();
        $gym = Gym::create(['name' => 'KAIROS']);
        $ga = $this->gymAdmin($gym);
        $req = $this->request($gym, $ga);

        $this->actingAs($admin)->postJson("/api/v1/admin/equipment-requests/{$req->id}/start-review")
            ->assertOk()->assertJsonPath('equipment_request.status', 'in_review');

        $this->actingAs($admin)->postJson("/api/v1/admin/equipment-requests/{$req->id}/request-changes", [
            'review_note' => 'Añade el modelo exacto.',
        ])->assertOk()->assertJsonPath('equipment_request.status', 'changes_requested')
            ->assertJsonPath('equipment_request.review_note', 'Añade el modelo exacto.');

        // gym edits + resubmits
        $this->actingAs($ga)->putJson("/api/v1/me/gym/{$gym->id}/equipment-requests/{$req->id}", [
            'name' => 'Prensa Hammer Strength', 'brand' => 'Hammer Strength', 'model' => 'ISO-Lateral',
        ])->assertOk()->assertJsonPath('equipment_request.status', 'pending');

        $this->actingAs($admin)->postJson("/api/v1/admin/equipment-requests/{$req->id}/start-review")->assertOk();

        $res = $this->actingAs($admin)->postJson("/api/v1/admin/equipment-requests/{$req->id}/approve", [
            'create_equipment' => true, 'review_note' => 'Máquina nueva, no había equivalente.',
        ])->assertOk()->assertJsonPath('equipment_request.status', 'approved');

        // A new catalog item was created and linked.
        $equipmentId = $res->json('equipment_request.resulting_equipment.id');
        $this->assertNotNull($equipmentId);
        $this->assertDatabaseHas('equipment', ['id' => $equipmentId, 'name' => 'Prensa Hammer Strength', 'model' => 'ISO-Lateral']);

        // Audit trail records every actor + action.
        $actions = collect($res->json('equipment_request.events'))->pluck('action')->all();
        $this->assertSame(
            ['review_started', 'changes_requested', 'resubmitted', 'review_started', 'approved'],
            $actions,
        );
        $this->assertSame($admin->id, collect($res->json('equipment_request.events'))->last()['actor']['id']);

        // Approving did NOT add the equipment to the gym's inventory.
        $this->assertDatabaseMissing('gym_equipment', ['gym_id' => $gym->id, 'equipment_id' => $equipmentId]);
    }

    public function test_approve_can_associate_an_existing_equipment_instead_of_creating_a_duplicate(): void
    {
        $admin = $this->platformAdmin();
        $gym = Gym::create(['name' => 'KAIROS']);
        $req = $this->request($gym, $this->gymAdmin($gym));
        $existing = Equipment::create(['slug' => 'm-prensa', 'name' => 'Prensa de piernas']);

        $this->actingAs($admin)->postJson("/api/v1/admin/equipment-requests/{$req->id}/start-review")->assertOk();

        $before = Equipment::count();
        $this->actingAs($admin)->postJson("/api/v1/admin/equipment-requests/{$req->id}/approve", [
            'equipment_id' => $existing->id,
        ])->assertOk()
            ->assertJsonPath('equipment_request.status', 'approved')
            ->assertJsonPath('equipment_request.resulting_equipment.id', $existing->id);

        $this->assertSame($before, Equipment::count(), 'No duplicate catalog item should be created');
    }

    public function test_approve_requires_exactly_one_resolution_choice(): void
    {
        $admin = $this->platformAdmin();
        $gym = Gym::create(['name' => 'KAIROS']);
        $req = $this->request($gym, $this->gymAdmin($gym));
        $existing = Equipment::create(['slug' => 'm-prensa', 'name' => 'Prensa']);
        $this->actingAs($admin)->postJson("/api/v1/admin/equipment-requests/{$req->id}/start-review")->assertOk();

        // neither
        $this->actingAs($admin)->postJson("/api/v1/admin/equipment-requests/{$req->id}/approve", [])
            ->assertStatus(422)->assertJsonValidationErrorFor('equipment_id');
        // both
        $this->actingAs($admin)->postJson("/api/v1/admin/equipment-requests/{$req->id}/approve", [
            'equipment_id' => $existing->id, 'create_equipment' => true,
        ])->assertStatus(422)->assertJsonValidationErrorFor('equipment_id');
    }

    public function test_invalid_transitions_are_422(): void
    {
        $admin = $this->platformAdmin();
        $gym = Gym::create(['name' => 'KAIROS']);
        $ga = $this->gymAdmin($gym);

        // approve from pending (must go through in_review first)
        $pending = $this->request($gym, $ga, EquipmentRequest::STATUS_PENDING);
        $this->actingAs($admin)->postJson("/api/v1/admin/equipment-requests/{$pending->id}/approve", ['create_equipment' => true])
            ->assertStatus(422)->assertJsonValidationErrorFor('status');

        // request-changes from pending
        $this->actingAs($admin)->postJson("/api/v1/admin/equipment-requests/{$pending->id}/request-changes", ['review_note' => 'x'])
            ->assertStatus(422)->assertJsonValidationErrorFor('status');

        // start-review from approved
        $approved = $this->request($gym, $ga, EquipmentRequest::STATUS_APPROVED);
        $this->actingAs($admin)->postJson("/api/v1/admin/equipment-requests/{$approved->id}/start-review")
            ->assertStatus(422)->assertJsonValidationErrorFor('status');

        // reject from changes_requested
        $changes = $this->request($gym, $ga, EquipmentRequest::STATUS_CHANGES_REQUESTED);
        $this->actingAs($admin)->postJson("/api/v1/admin/equipment-requests/{$changes->id}/reject")
            ->assertStatus(422)->assertJsonValidationErrorFor('status');
    }

    public function test_request_changes_requires_a_note(): void
    {
        $admin = $this->platformAdmin();
        $gym = Gym::create(['name' => 'KAIROS']);
        $req = $this->request($gym, $this->gymAdmin($gym), EquipmentRequest::STATUS_IN_REVIEW);

        $this->actingAs($admin)->postJson("/api/v1/admin/equipment-requests/{$req->id}/request-changes", [])
            ->assertStatus(422)->assertJsonValidationErrorFor('review_note');
    }

    public function test_admin_can_correct_the_submitted_info_in_place_while_in_review(): void
    {
        $admin = $this->platformAdmin();
        $gym = Gym::create(['name' => 'KAIROS']);
        $req = $this->request($gym, $this->gymAdmin($gym), EquipmentRequest::STATUS_IN_REVIEW);

        $res = $this->actingAs($admin)->patchJson("/api/v1/admin/equipment-requests/{$req->id}", [
            'name' => 'Prensa 45° (normalizada)', 'category' => 'Piernas',
        ])->assertOk()
            ->assertJsonPath('equipment_request.status', 'in_review')
            ->assertJsonPath('equipment_request.name', 'Prensa 45° (normalizada)');

        $this->assertTrue(collect($res->json('equipment_request.events'))->pluck('action')->contains('info_corrected'));
    }

    public function test_reject_moves_in_review_to_rejected_and_is_terminal(): void
    {
        $admin = $this->platformAdmin();
        $gym = Gym::create(['name' => 'KAIROS']);
        $req = $this->request($gym, $this->gymAdmin($gym), EquipmentRequest::STATUS_IN_REVIEW);

        $this->actingAs($admin)->postJson("/api/v1/admin/equipment-requests/{$req->id}/reject", ['review_note' => 'Duplicada.'])
            ->assertOk()->assertJsonPath('equipment_request.status', 'rejected');

        // can't approve a rejected one
        $this->actingAs($admin)->postJson("/api/v1/admin/equipment-requests/{$req->id}/approve", ['create_equipment' => true])
            ->assertStatus(422);
    }
}
