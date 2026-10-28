<?php

namespace Tests\Feature\Api\V1;

use App\Models\Branch;
use App\Models\Gym;
use App\Models\GymAssignment;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class GymAssignmentApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_index_rejects_unauthenticated_requests(): void
    {
        $response = $this->getJson('/api/v1/me/gym-assignments');

        $response->assertStatus(401);
    }

    public function test_user_without_assignments_gets_an_empty_list(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user, 'sanctum')->getJson('/api/v1/me/gym-assignments');

        $response->assertOk();
        $response->assertExactJson(['gym_assignments' => []]);
    }

    public function test_a_single_active_assignment_returns_the_exact_shape(): void
    {
        $user = User::factory()->create();
        $gym = Gym::create(['name' => 'Gym One']);
        $branch = Branch::create(['gym_id' => $gym->id, 'name' => 'Main Branch']);
        $assignment = GymAssignment::create([
            'user_id' => $user->id,
            'gym_id' => $gym->id,
            'branch_id' => $branch->id,
            'role' => GymAssignment::ROLE_MEMBER,
            'status' => GymAssignment::STATUS_ACTIVE,
        ]);

        $response = $this->actingAs($user, 'sanctum')->getJson('/api/v1/me/gym-assignments');

        $response->assertOk();
        $response->assertExactJson([
            'gym_assignments' => [
                [
                    'id' => $assignment->id,
                    'role' => 'member',
                    'gym' => [
                        'id' => $gym->id,
                        'name' => 'Gym One',
                    ],
                    'branch' => [
                        'id' => $branch->id,
                        'name' => 'Main Branch',
                    ],
                ],
            ],
        ]);
    }

    public function test_multiple_assignments_across_gyms_and_roles_are_not_deduplicated(): void
    {
        $user = User::factory()->create();
        $gymA = Gym::create(['name' => 'Gym A']);
        $gymB = Gym::create(['name' => 'Gym B']);
        $branch = Branch::create(['gym_id' => $gymA->id, 'name' => 'Branch A']);

        // Same gym/branch, two different roles for the same user: must yield two entries.
        GymAssignment::create([
            'user_id' => $user->id,
            'gym_id' => $gymA->id,
            'branch_id' => $branch->id,
            'role' => GymAssignment::ROLE_GYM_ADMIN,
            'status' => GymAssignment::STATUS_ACTIVE,
        ]);
        GymAssignment::create([
            'user_id' => $user->id,
            'gym_id' => $gymA->id,
            'branch_id' => $branch->id,
            'role' => GymAssignment::ROLE_COACH,
            'status' => GymAssignment::STATUS_ACTIVE,
        ]);
        GymAssignment::create([
            'user_id' => $user->id,
            'gym_id' => $gymB->id,
            'branch_id' => null,
            'role' => GymAssignment::ROLE_GYM_ADMIN,
            'status' => GymAssignment::STATUS_ACTIVE,
        ]);

        $response = $this->actingAs($user, 'sanctum')->getJson('/api/v1/me/gym-assignments');

        $response->assertOk();
        $roles = collect($response->json('gym_assignments'))->pluck('role')->sort()->values()->all();

        $this->assertCount(3, $response->json('gym_assignments'));
        $this->assertSame(['coach', 'gym_admin', 'gym_admin'], $roles);
    }

    public function test_inactive_assignments_are_excluded(): void
    {
        $user = User::factory()->create();
        $gym = Gym::create(['name' => 'Gym One']);
        GymAssignment::create([
            'user_id' => $user->id,
            'gym_id' => $gym->id,
            'branch_id' => null,
            'role' => GymAssignment::ROLE_STAFF,
            'status' => GymAssignment::STATUS_INACTIVE,
        ]);

        $response = $this->actingAs($user, 'sanctum')->getJson('/api/v1/me/gym-assignments');

        $response->assertOk();
        $response->assertExactJson(['gym_assignments' => []]);
    }

    public function test_null_branch_id_is_returned_as_null_branch(): void
    {
        $user = User::factory()->create();
        $gym = Gym::create(['name' => 'Gym One']);
        GymAssignment::create([
            'user_id' => $user->id,
            'gym_id' => $gym->id,
            'branch_id' => null,
            'role' => GymAssignment::ROLE_GYM_ADMIN,
            'status' => GymAssignment::STATUS_ACTIVE,
        ]);

        $response = $this->actingAs($user, 'sanctum')->getJson('/api/v1/me/gym-assignments');

        $response->assertOk();
        $response->assertJsonPath('gym_assignments.0.branch', null);
    }

    public function test_a_user_only_sees_their_own_assignments(): void
    {
        $userA = User::factory()->create();
        $userB = User::factory()->create();
        $gym = Gym::create(['name' => 'Gym One']);
        $branch = Branch::create(['gym_id' => $gym->id, 'name' => 'Main Branch']);

        $assignmentA = GymAssignment::create([
            'user_id' => $userA->id,
            'gym_id' => $gym->id,
            'branch_id' => $branch->id,
            'role' => GymAssignment::ROLE_MEMBER,
            'status' => GymAssignment::STATUS_ACTIVE,
        ]);
        GymAssignment::create([
            'user_id' => $userB->id,
            'gym_id' => $gym->id,
            'branch_id' => $branch->id,
            'role' => GymAssignment::ROLE_GYM_ADMIN,
            'status' => GymAssignment::STATUS_ACTIVE,
        ]);

        $response = $this->actingAs($userA, 'sanctum')->getJson('/api/v1/me/gym-assignments');

        $response->assertOk();
        $assignments = $response->json('gym_assignments');

        $this->assertCount(1, $assignments);
        $this->assertSame($assignmentA->id, $assignments[0]['id']);
        $this->assertSame('member', $assignments[0]['role']);

        $body = $response->getContent();
        $this->assertStringNotContainsString('gym_admin', $body);
        $this->assertStringNotContainsString((string) $userB->id, $body);
    }

    public function test_response_never_exposes_internal_columns(): void
    {
        $user = User::factory()->create();
        $gym = Gym::create(['name' => 'Gym One']);
        $branch = Branch::create(['gym_id' => $gym->id, 'name' => 'Main Branch']);
        GymAssignment::create([
            'user_id' => $user->id,
            'gym_id' => $gym->id,
            'branch_id' => $branch->id,
            'role' => GymAssignment::ROLE_MEMBER,
            'status' => GymAssignment::STATUS_ACTIVE,
        ]);

        $response = $this->actingAs($user, 'sanctum')->getJson('/api/v1/me/gym-assignments');

        $response->assertOk();
        $assignment = $response->json('gym_assignments.0');

        $this->assertSame(['id', 'role', 'gym', 'branch'], array_keys($assignment));
        $this->assertArrayNotHasKey('user_id', $assignment);
        $this->assertArrayNotHasKey('gym_id', $assignment);
        $this->assertArrayNotHasKey('branch_id', $assignment);
        $this->assertArrayNotHasKey('branch_id_norm', $assignment);
        $this->assertArrayNotHasKey('status', $assignment);
        $this->assertArrayNotHasKey('created_at', $assignment);
        $this->assertArrayNotHasKey('updated_at', $assignment);

        $this->assertSame(['id', 'name'], array_keys($assignment['gym']));
        $this->assertArrayNotHasKey('created_at', $assignment['gym']);
        $this->assertArrayNotHasKey('updated_at', $assignment['gym']);

        $this->assertSame(['id', 'name'], array_keys($assignment['branch']));
        $this->assertArrayNotHasKey('gym_id', $assignment['branch']);
        $this->assertArrayNotHasKey('created_at', $assignment['branch']);
        $this->assertArrayNotHasKey('updated_at', $assignment['branch']);
    }

    public function test_results_are_ordered_by_gym_name_then_branch_name_with_gym_wide_first(): void
    {
        $user = User::factory()->create();

        // Insert gyms/branches deliberately out of alphabetical order.
        $gymZ = Gym::create(['name' => 'Zeta Gym']);
        $gymA = Gym::create(['name' => 'Alpha Gym']);

        $branchZ = Branch::create(['gym_id' => $gymA->id, 'name' => 'Zulu Branch']);
        $branchB = Branch::create(['gym_id' => $gymA->id, 'name' => 'Bravo Branch']);

        // Alpha Gym, gym-wide (branch: null) — must sort before Alpha Gym's named branches.
        GymAssignment::create([
            'user_id' => $user->id,
            'gym_id' => $gymA->id,
            'branch_id' => null,
            'role' => GymAssignment::ROLE_GYM_ADMIN,
            'status' => GymAssignment::STATUS_ACTIVE,
        ]);
        GymAssignment::create([
            'user_id' => $user->id,
            'gym_id' => $gymA->id,
            'branch_id' => $branchZ->id,
            'role' => GymAssignment::ROLE_COACH,
            'status' => GymAssignment::STATUS_ACTIVE,
        ]);
        GymAssignment::create([
            'user_id' => $user->id,
            'gym_id' => $gymA->id,
            'branch_id' => $branchB->id,
            'role' => GymAssignment::ROLE_MEMBER,
            'status' => GymAssignment::STATUS_ACTIVE,
        ]);
        GymAssignment::create([
            'user_id' => $user->id,
            'gym_id' => $gymZ->id,
            'branch_id' => null,
            'role' => GymAssignment::ROLE_STAFF,
            'status' => GymAssignment::STATUS_ACTIVE,
        ]);

        $response = $this->actingAs($user, 'sanctum')->getJson('/api/v1/me/gym-assignments');

        $response->assertOk();
        $assignments = $response->json('gym_assignments');

        $ordering = array_map(
            fn (array $a) => [$a['gym']['name'], $a['branch']['name'] ?? null],
            $assignments
        );

        $this->assertSame([
            ['Alpha Gym', null],
            ['Alpha Gym', 'Bravo Branch'],
            ['Alpha Gym', 'Zulu Branch'],
            ['Zeta Gym', null],
        ], $ordering);
    }

    public function test_query_uses_eager_loading_to_avoid_n_plus_one(): void
    {
        $user = User::factory()->create();
        $gymA = Gym::create(['name' => 'Gym A']);
        $gymB = Gym::create(['name' => 'Gym B']);
        $branchA = Branch::create(['gym_id' => $gymA->id, 'name' => 'Branch A']);
        $branchB = Branch::create(['gym_id' => $gymB->id, 'name' => 'Branch B']);

        GymAssignment::create([
            'user_id' => $user->id,
            'gym_id' => $gymA->id,
            'branch_id' => $branchA->id,
            'role' => GymAssignment::ROLE_MEMBER,
            'status' => GymAssignment::STATUS_ACTIVE,
        ]);
        GymAssignment::create([
            'user_id' => $user->id,
            'gym_id' => $gymB->id,
            'branch_id' => $branchB->id,
            'role' => GymAssignment::ROLE_COACH,
            'status' => GymAssignment::STATUS_ACTIVE,
        ]);

        $queryCount = 0;
        DB::listen(function () use (&$queryCount) {
            $queryCount++;
        });

        $response = $this->actingAs($user, 'sanctum')->getJson('/api/v1/me/gym-assignments');

        $response->assertOk();

        // With eager loading: 1 query for gym_assignments + 1 for gyms + 1 for
        // branches, regardless of how many assignments there are. Without
        // eager loading it would grow with the number of assignments (N+1).
        $this->assertLessThanOrEqual(3, $queryCount);
    }

    // -----------------------------------------------------------------
    // store()
    // -----------------------------------------------------------------

    public function test_store_rejects_unauthenticated_requests(): void
    {
        $response = $this->postJson('/api/v1/me/gym-assignments', ['gym_id' => 1, 'branch_id' => 1]);

        $response->assertStatus(401);
    }

    public function test_store_creates_an_active_member_assignment(): void
    {
        $user = User::factory()->create();
        $gym = Gym::create(['name' => 'Gym One']);
        $branch = Branch::create(['gym_id' => $gym->id, 'name' => 'Main Branch']);

        $response = $this->actingAs($user, 'sanctum')->postJson('/api/v1/me/gym-assignments', [
            'gym_id' => $gym->id,
            'branch_id' => $branch->id,
        ]);

        $response->assertCreated();
        $response->assertJsonPath('gym_assignment.role', 'member');
        $response->assertJsonPath('gym_assignment.gym.id', $gym->id);
        $response->assertJsonPath('gym_assignment.branch.id', $branch->id);

        $this->assertDatabaseHas('gym_assignments', [
            'user_id' => $user->id,
            'gym_id' => $gym->id,
            'branch_id' => $branch->id,
            'role' => 'member',
            'status' => 'active',
        ]);
    }

    public function test_store_without_branch_id_returns_422_not_500(): void
    {
        $user = User::factory()->create();
        $gym = Gym::create(['name' => 'Gym One']);

        $response = $this->actingAs($user, 'sanctum')->postJson('/api/v1/me/gym-assignments', [
            'gym_id' => $gym->id,
        ]);

        $response->assertStatus(422);
        $response->assertJsonValidationErrors(['branch_id']);
    }

    public function test_store_with_nonexistent_gym_id_returns_422(): void
    {
        $user = User::factory()->create();
        $gym = Gym::create(['name' => 'Gym One']);
        $branch = Branch::create(['gym_id' => $gym->id, 'name' => 'Main Branch']);

        $response = $this->actingAs($user, 'sanctum')->postJson('/api/v1/me/gym-assignments', [
            'gym_id' => 999999,
            'branch_id' => $branch->id,
        ]);

        $response->assertStatus(422);
        $response->assertJsonValidationErrors(['gym_id']);
    }

    public function test_store_with_nonexistent_branch_id_returns_422(): void
    {
        $user = User::factory()->create();
        $gym = Gym::create(['name' => 'Gym One']);

        $response = $this->actingAs($user, 'sanctum')->postJson('/api/v1/me/gym-assignments', [
            'gym_id' => $gym->id,
            'branch_id' => 999999,
        ]);

        $response->assertStatus(422);
        $response->assertJsonValidationErrors(['branch_id']);
    }

    public function test_store_with_branch_from_another_gym_returns_422(): void
    {
        $user = User::factory()->create();
        $gymA = Gym::create(['name' => 'Gym A']);
        $gymB = Gym::create(['name' => 'Gym B']);
        $branchOfB = Branch::create(['gym_id' => $gymB->id, 'name' => 'Branch B']);

        $response = $this->actingAs($user, 'sanctum')->postJson('/api/v1/me/gym-assignments', [
            'gym_id' => $gymA->id,
            'branch_id' => $branchOfB->id,
        ]);

        $response->assertStatus(422);
        $response->assertJsonValidationErrors(['branch_id']);
    }

    public function test_store_ignores_client_supplied_role(): void
    {
        $user = User::factory()->create();
        $gym = Gym::create(['name' => 'Gym One']);
        $branch = Branch::create(['gym_id' => $gym->id, 'name' => 'Main Branch']);

        $response = $this->actingAs($user, 'sanctum')->postJson('/api/v1/me/gym-assignments', [
            'gym_id' => $gym->id,
            'branch_id' => $branch->id,
            'role' => 'gym_admin',
        ]);

        $response->assertCreated();
        $response->assertJsonPath('gym_assignment.role', 'member');

        $this->assertDatabaseHas('gym_assignments', [
            'user_id' => $user->id,
            'gym_id' => $gym->id,
            'branch_id' => $branch->id,
            'role' => 'member',
        ]);
        $this->assertDatabaseMissing('gym_assignments', [
            'user_id' => $user->id,
            'gym_id' => $gym->id,
            'branch_id' => $branch->id,
            'role' => 'gym_admin',
        ]);
    }

    public function test_store_ignores_client_supplied_user_id(): void
    {
        $user = User::factory()->create();
        $otherUser = User::factory()->create();
        $gym = Gym::create(['name' => 'Gym One']);
        $branch = Branch::create(['gym_id' => $gym->id, 'name' => 'Main Branch']);

        $response = $this->actingAs($user, 'sanctum')->postJson('/api/v1/me/gym-assignments', [
            'gym_id' => $gym->id,
            'branch_id' => $branch->id,
            'user_id' => $otherUser->id,
        ]);

        $response->assertCreated();

        $this->assertDatabaseHas('gym_assignments', [
            'user_id' => $user->id,
            'gym_id' => $gym->id,
            'branch_id' => $branch->id,
        ]);
        $this->assertDatabaseMissing('gym_assignments', [
            'user_id' => $otherUser->id,
            'gym_id' => $gym->id,
            'branch_id' => $branch->id,
        ]);
    }

    public function test_store_rejects_duplicate_active_assignment(): void
    {
        $user = User::factory()->create();
        $gym = Gym::create(['name' => 'Gym One']);
        $branch = Branch::create(['gym_id' => $gym->id, 'name' => 'Main Branch']);
        GymAssignment::create([
            'user_id' => $user->id,
            'gym_id' => $gym->id,
            'branch_id' => $branch->id,
            'role' => GymAssignment::ROLE_MEMBER,
            'status' => GymAssignment::STATUS_ACTIVE,
        ]);

        $response = $this->actingAs($user, 'sanctum')->postJson('/api/v1/me/gym-assignments', [
            'gym_id' => $gym->id,
            'branch_id' => $branch->id,
        ]);

        $response->assertStatus(422);
        $this->assertSame(1, GymAssignment::where('user_id', $user->id)->count());
    }

    public function test_store_reactivates_a_previously_revoked_assignment(): void
    {
        $user = User::factory()->create();
        $gym = Gym::create(['name' => 'Gym One']);
        $branch = Branch::create(['gym_id' => $gym->id, 'name' => 'Main Branch']);
        $assignment = GymAssignment::create([
            'user_id' => $user->id,
            'gym_id' => $gym->id,
            'branch_id' => $branch->id,
            'role' => GymAssignment::ROLE_MEMBER,
            'status' => GymAssignment::STATUS_INACTIVE,
        ]);

        $response = $this->actingAs($user, 'sanctum')->postJson('/api/v1/me/gym-assignments', [
            'gym_id' => $gym->id,
            'branch_id' => $branch->id,
        ]);

        $response->assertOk();
        $response->assertJsonPath('gym_assignment.id', $assignment->id);

        $this->assertSame(1, GymAssignment::where('user_id', $user->id)->count());
        $this->assertDatabaseHas('gym_assignments', [
            'id' => $assignment->id,
            'status' => 'active',
        ]);
    }

    public function test_store_allows_simultaneous_assignments_across_multiple_gyms(): void
    {
        $user = User::factory()->create();
        $gymA = Gym::create(['name' => 'Gym A']);
        $gymB = Gym::create(['name' => 'Gym B']);
        $branchA = Branch::create(['gym_id' => $gymA->id, 'name' => 'Branch A']);
        $branchB = Branch::create(['gym_id' => $gymB->id, 'name' => 'Branch B']);

        $responseA = $this->actingAs($user, 'sanctum')->postJson('/api/v1/me/gym-assignments', [
            'gym_id' => $gymA->id,
            'branch_id' => $branchA->id,
        ]);
        $responseB = $this->actingAs($user, 'sanctum')->postJson('/api/v1/me/gym-assignments', [
            'gym_id' => $gymB->id,
            'branch_id' => $branchB->id,
        ]);

        $responseA->assertCreated();
        $responseB->assertCreated();
        $this->assertSame(2, GymAssignment::where('user_id', $user->id)->count());
    }

    // -----------------------------------------------------------------
    // destroy()
    // -----------------------------------------------------------------

    public function test_destroy_rejects_unauthenticated_requests(): void
    {
        $response = $this->deleteJson('/api/v1/me/gym-assignments/1');

        $response->assertStatus(401);
    }

    public function test_destroy_revokes_own_member_assignment(): void
    {
        $user = User::factory()->create();
        $gym = Gym::create(['name' => 'Gym One']);
        $branch = Branch::create(['gym_id' => $gym->id, 'name' => 'Main Branch']);
        $assignment = GymAssignment::create([
            'user_id' => $user->id,
            'gym_id' => $gym->id,
            'branch_id' => $branch->id,
            'role' => GymAssignment::ROLE_MEMBER,
            'status' => GymAssignment::STATUS_ACTIVE,
        ]);

        $response = $this->actingAs($user, 'sanctum')->deleteJson("/api/v1/me/gym-assignments/{$assignment->id}");

        $response->assertStatus(204);
        $response->assertNoContent();

        $this->assertDatabaseHas('gym_assignments', [
            'id' => $assignment->id,
            'status' => 'inactive',
        ]);
    }

    public function test_destroy_of_another_users_assignment_returns_404(): void
    {
        $user = User::factory()->create();
        $otherUser = User::factory()->create();
        $gym = Gym::create(['name' => 'Gym One']);
        $branch = Branch::create(['gym_id' => $gym->id, 'name' => 'Main Branch']);
        $assignment = GymAssignment::create([
            'user_id' => $otherUser->id,
            'gym_id' => $gym->id,
            'branch_id' => $branch->id,
            'role' => GymAssignment::ROLE_MEMBER,
            'status' => GymAssignment::STATUS_ACTIVE,
        ]);

        $response = $this->actingAs($user, 'sanctum')->deleteJson("/api/v1/me/gym-assignments/{$assignment->id}");

        $response->assertStatus(404);
        $this->assertDatabaseHas('gym_assignments', [
            'id' => $assignment->id,
            'status' => 'active',
        ]);
    }

    public function test_destroy_of_nonexistent_assignment_returns_404(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user, 'sanctum')->deleteJson('/api/v1/me/gym-assignments/999999');

        $response->assertStatus(404);
    }

    public function test_destroy_of_own_non_member_assignment_returns_404(): void
    {
        $user = User::factory()->create();
        $gym = Gym::create(['name' => 'Gym One']);
        $assignment = GymAssignment::create([
            'user_id' => $user->id,
            'gym_id' => $gym->id,
            'branch_id' => null,
            'role' => GymAssignment::ROLE_COACH,
            'status' => GymAssignment::STATUS_ACTIVE,
        ]);

        $response = $this->actingAs($user, 'sanctum')->deleteJson("/api/v1/me/gym-assignments/{$assignment->id}");

        $response->assertStatus(404);
        $this->assertDatabaseHas('gym_assignments', [
            'id' => $assignment->id,
            'status' => 'active',
        ]);
    }

    public function test_destroy_then_index_no_longer_lists_the_revoked_assignment(): void
    {
        $user = User::factory()->create();
        $gym = Gym::create(['name' => 'Gym One']);
        $branch = Branch::create(['gym_id' => $gym->id, 'name' => 'Main Branch']);
        $assignment = GymAssignment::create([
            'user_id' => $user->id,
            'gym_id' => $gym->id,
            'branch_id' => $branch->id,
            'role' => GymAssignment::ROLE_MEMBER,
            'status' => GymAssignment::STATUS_ACTIVE,
        ]);

        $this->actingAs($user, 'sanctum')->deleteJson("/api/v1/me/gym-assignments/{$assignment->id}")
            ->assertStatus(204);

        $response = $this->actingAs($user, 'sanctum')->getJson('/api/v1/me/gym-assignments');

        $response->assertOk();
        $response->assertExactJson(['gym_assignments' => []]);
    }

    public function test_store_and_destroy_are_isolated_between_users(): void
    {
        $userA = User::factory()->create();
        $userB = User::factory()->create();
        $gym = Gym::create(['name' => 'Gym One']);
        $branch = Branch::create(['gym_id' => $gym->id, 'name' => 'Main Branch']);

        $responseA = $this->actingAs($userA, 'sanctum')->postJson('/api/v1/me/gym-assignments', [
            'gym_id' => $gym->id,
            'branch_id' => $branch->id,
        ]);
        $responseB = $this->actingAs($userB, 'sanctum')->postJson('/api/v1/me/gym-assignments', [
            'gym_id' => $gym->id,
            'branch_id' => $branch->id,
        ]);

        $responseA->assertCreated();
        $responseB->assertCreated();

        $assignmentAId = $responseA->json('gym_assignment.id');
        $assignmentBId = $responseB->json('gym_assignment.id');
        $this->assertNotSame($assignmentAId, $assignmentBId);

        $this->actingAs($userB, 'sanctum')
            ->deleteJson("/api/v1/me/gym-assignments/{$assignmentAId}")
            ->assertStatus(404);

        $this->assertDatabaseHas('gym_assignments', [
            'id' => $assignmentAId,
            'status' => 'active',
        ]);

        $indexA = $this->actingAs($userA, 'sanctum')->getJson('/api/v1/me/gym-assignments');
        $indexA->assertOk();
        $this->assertCount(1, $indexA->json('gym_assignments'));

        $indexB = $this->actingAs($userB, 'sanctum')->getJson('/api/v1/me/gym-assignments');
        $indexB->assertOk();
        $this->assertCount(1, $indexB->json('gym_assignments'));
    }
}
