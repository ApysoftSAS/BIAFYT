<?php

namespace Tests\Feature\Api\V1\Admin;

use App\Models\Gym;
use App\Models\GymAssignment;
use App\Models\GymRegistrationRequest;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Gym onboarding — BIAFYT Admin side. Gated by `User::is_platform_admin`
 * (404 for anyone else). Approving creates Gym + main Branch + active
 * gym_admin GymAssignment atomically and is idempotent.
 */
class GymRegistrationRequestApiTest extends TestCase
{
    use RefreshDatabase;

    private function platformAdmin(): User
    {
        $user = User::factory()->create();
        $user->forceFill(['is_platform_admin' => true])->save();

        return $user;
    }

    private function pendingRequest(?User $applicant = null): GymRegistrationRequest
    {
        return GymRegistrationRequest::create([
            'user_id' => ($applicant ?? User::factory()->create())->id,
            'status' => GymRegistrationRequest::STATUS_PENDING,
            'gym_name' => 'KAIROS GYM',
            'branch_name' => 'Norte',
            'applicant_message' => 'Contexto del solicitante.',
        ]);
    }

    // -----------------------------------------------------------------
    // gate: is_platform_admin
    // -----------------------------------------------------------------

    public function test_index_rejects_unauthenticated_requests(): void
    {
        $this->getJson('/api/v1/admin/gym-registration-requests')->assertStatus(401);
    }

    public function test_a_normal_user_gets_404_on_every_admin_endpoint(): void
    {
        $user = User::factory()->create();
        $req = $this->pendingRequest();

        $this->actingAs($user, 'sanctum')->getJson('/api/v1/admin/gym-registration-requests')->assertStatus(404);
        $this->actingAs($user, 'sanctum')->getJson("/api/v1/admin/gym-registration-requests/{$req->id}")->assertStatus(404);
        $this->actingAs($user, 'sanctum')->postJson("/api/v1/admin/gym-registration-requests/{$req->id}/approve")->assertStatus(404);
        $this->actingAs($user, 'sanctum')->postJson("/api/v1/admin/gym-registration-requests/{$req->id}/reject")->assertStatus(404);
        $this->actingAs($user, 'sanctum')->getJson('/api/v1/admin/gyms')->assertStatus(404);

        $this->assertSame('pending', $req->fresh()->status);
        $this->assertSame(0, Gym::count());
    }

    // -----------------------------------------------------------------
    // list / show
    // -----------------------------------------------------------------

    public function test_admin_can_list_requests_and_filter_by_status(): void
    {
        $admin = $this->platformAdmin();
        $this->pendingRequest();
        GymRegistrationRequest::create(['user_id' => User::factory()->create()->id, 'status' => 'rejected', 'gym_name' => 'X', 'branch_name' => 'x', 'reviewed_at' => now()]);

        $all = $this->actingAs($admin, 'sanctum')->getJson('/api/v1/admin/gym-registration-requests');
        $all->assertOk();
        $all->assertJsonCount(2, 'gym_registration_requests');

        $pending = $this->actingAs($admin, 'sanctum')->getJson('/api/v1/admin/gym-registration-requests?status=pending');
        $pending->assertOk();
        $pending->assertJsonCount(1, 'gym_registration_requests');
        $pending->assertJsonPath('gym_registration_requests.0.status', 'pending');
    }

    public function test_admin_can_see_a_request_with_the_applicant_identity(): void
    {
        $admin = $this->platformAdmin();
        $applicant = User::factory()->create(['name' => 'Nadia', 'email' => 'nadia@e2e.test']);
        $req = $this->pendingRequest($applicant);

        $response = $this->actingAs($admin, 'sanctum')->getJson("/api/v1/admin/gym-registration-requests/{$req->id}");

        $response->assertOk();
        $response->assertJsonPath('gym_registration_request.applicant.id', $applicant->id);
        $response->assertJsonPath('gym_registration_request.applicant.name', 'Nadia');
        $response->assertJsonPath('gym_registration_request.applicant.email', 'nadia@e2e.test');
        $this->assertSame(
            ['id', 'name', 'email'],
            array_keys($response->json('gym_registration_request.applicant')),
        );
        $response->assertJsonMissingPath('gym_registration_request.user_id');
    }

    public function test_show_of_a_nonexistent_request_is_404(): void
    {
        $admin = $this->platformAdmin();

        $this->actingAs($admin, 'sanctum')->getJson('/api/v1/admin/gym-registration-requests/999999')->assertStatus(404);
    }

    // -----------------------------------------------------------------
    // approve
    // -----------------------------------------------------------------

    public function test_approving_creates_gym_branch_and_active_gym_admin(): void
    {
        $admin = $this->platformAdmin();
        $applicant = User::factory()->create();
        $req = $this->pendingRequest($applicant);

        $response = $this->actingAs($admin, 'sanctum')->postJson(
            "/api/v1/admin/gym-registration-requests/{$req->id}/approve",
            ['review_note' => 'Verificado por teléfono.'],
        );

        $response->assertOk();
        $response->assertJsonPath('gym_registration_request.status', 'approved');
        $response->assertJsonPath('gym_registration_request.review_note', 'Verificado por teléfono.');

        $gym = Gym::firstWhere('name', 'KAIROS GYM');
        $this->assertNotNull($gym);
        $response->assertJsonPath('gym_registration_request.gym.id', $gym->id);

        $this->assertDatabaseHas('branches', ['gym_id' => $gym->id, 'name' => 'Norte']);
        $this->assertDatabaseHas('gym_assignments', [
            'user_id' => $applicant->id,
            'gym_id' => $gym->id,
            'branch_id' => null,
            'role' => 'gym_admin',
            'status' => 'active',
        ]);
        $this->assertDatabaseHas('gym_registration_requests', [
            'id' => $req->id,
            'status' => 'approved',
            'reviewed_by_user_id' => $admin->id,
            'gym_id' => $gym->id,
        ]);
        $this->assertNotNull($req->fresh()->reviewed_at);
    }

    public function test_approving_is_idempotent(): void
    {
        $admin = $this->platformAdmin();
        $req = $this->pendingRequest();

        $first = $this->actingAs($admin, 'sanctum')->postJson("/api/v1/admin/gym-registration-requests/{$req->id}/approve");
        $first->assertOk();
        $gymId = $first->json('gym_registration_request.gym.id');

        $second = $this->actingAs($admin, 'sanctum')->postJson("/api/v1/admin/gym-registration-requests/{$req->id}/approve");
        $second->assertOk();
        $second->assertJsonPath('gym_registration_request.gym.id', $gymId);

        $this->assertSame(1, Gym::count());
        $this->assertSame(1, GymAssignment::where('role', 'gym_admin')->count());
    }

    public function test_a_rejected_request_cannot_be_approved(): void
    {
        $admin = $this->platformAdmin();
        $req = GymRegistrationRequest::create(['user_id' => User::factory()->create()->id, 'status' => 'rejected', 'gym_name' => 'X', 'branch_name' => 'x', 'reviewed_at' => now()]);

        $this->actingAs($admin, 'sanctum')
            ->postJson("/api/v1/admin/gym-registration-requests/{$req->id}/approve")
            ->assertStatus(422);

        $this->assertSame(0, Gym::count());
    }

    // -----------------------------------------------------------------
    // reject
    // -----------------------------------------------------------------

    public function test_rejecting_a_pending_request(): void
    {
        $admin = $this->platformAdmin();
        $req = $this->pendingRequest();

        $response = $this->actingAs($admin, 'sanctum')->postJson(
            "/api/v1/admin/gym-registration-requests/{$req->id}/reject",
            ['review_note' => 'Nombre de gym duplicado.'],
        );

        $response->assertOk();
        $response->assertJsonPath('gym_registration_request.status', 'rejected');
        $this->assertDatabaseHas('gym_registration_requests', [
            'id' => $req->id,
            'status' => 'rejected',
            'review_note' => 'Nombre de gym duplicado.',
            'reviewed_by_user_id' => $admin->id,
        ]);
        $this->assertSame(0, Gym::count());
    }

    public function test_rejecting_is_idempotent_and_an_approved_request_cannot_be_rejected(): void
    {
        $admin = $this->platformAdmin();
        $req = $this->pendingRequest();

        $this->actingAs($admin, 'sanctum')->postJson("/api/v1/admin/gym-registration-requests/{$req->id}/reject")->assertOk();
        $this->actingAs($admin, 'sanctum')->postJson("/api/v1/admin/gym-registration-requests/{$req->id}/reject")->assertOk();
        $this->assertSame('rejected', $req->fresh()->status);

        $approvedReq = $this->pendingRequest();
        $this->actingAs($admin, 'sanctum')->postJson("/api/v1/admin/gym-registration-requests/{$approvedReq->id}/approve")->assertOk();
        $this->actingAs($admin, 'sanctum')
            ->postJson("/api/v1/admin/gym-registration-requests/{$approvedReq->id}/reject")
            ->assertStatus(422);
        $this->assertSame('approved', $approvedReq->fresh()->status);
    }

    // -----------------------------------------------------------------
    // end-to-end: the applicant gets Gym Web access after approval
    // -----------------------------------------------------------------

    public function test_after_approval_the_applicant_can_administer_their_gym_but_no_other(): void
    {
        $admin = $this->platformAdmin();
        $applicant = User::factory()->create();
        $req = $this->pendingRequest($applicant);

        // Another, unrelated gym.
        $otherGym = Gym::create(['name' => 'OTRO']);

        $approve = $this->actingAs($admin, 'sanctum')->postJson("/api/v1/admin/gym-registration-requests/{$req->id}/approve");
        $approve->assertOk();
        $gymId = $approve->json('gym_registration_request.gym.id');

        // The applicant now sees the gym_admin assignment...
        $assignments = $this->actingAs($applicant, 'sanctum')->getJson('/api/v1/me/gym-assignments');
        $assignments->assertOk();
        $assignments->assertJsonPath('gym_assignments.0.role', 'gym_admin');
        $assignments->assertJsonPath('gym_assignments.0.gym.id', $gymId);

        // ...can administer their own gym...
        $this->actingAs($applicant, 'sanctum')->getJson("/api/v1/me/gym/{$gymId}/members")->assertOk();

        // ...but not another gym (anti-IDOR gate unchanged).
        $this->actingAs($applicant, 'sanctum')->getJson("/api/v1/me/gym/{$otherGym->id}/members")->assertStatus(404);
    }

    public function test_isolation_between_two_approved_gyms(): void
    {
        $admin = $this->platformAdmin();

        $a = User::factory()->create();
        $b = User::factory()->create();
        $reqA = $this->pendingRequest($a);
        $reqB = GymRegistrationRequest::create(['user_id' => $b->id, 'status' => 'pending', 'gym_name' => 'GYM B', 'branch_name' => 'Sur']);

        $gymA = $this->actingAs($admin, 'sanctum')->postJson("/api/v1/admin/gym-registration-requests/{$reqA->id}/approve")->json('gym_registration_request.gym.id');
        $gymB = $this->actingAs($admin, 'sanctum')->postJson("/api/v1/admin/gym-registration-requests/{$reqB->id}/approve")->json('gym_registration_request.gym.id');

        $this->actingAs($a, 'sanctum')->getJson("/api/v1/me/gym/{$gymA}/members")->assertOk();
        $this->actingAs($a, 'sanctum')->getJson("/api/v1/me/gym/{$gymB}/members")->assertStatus(404);
        $this->actingAs($b, 'sanctum')->getJson("/api/v1/me/gym/{$gymB}/members")->assertOk();
        $this->actingAs($b, 'sanctum')->getJson("/api/v1/me/gym/{$gymA}/members")->assertStatus(404);
    }
}
