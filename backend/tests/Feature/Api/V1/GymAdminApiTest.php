<?php

namespace Tests\Feature\Api\V1;

use App\Models\Activity;
use App\Models\Branch;
use App\Models\CheckIn;
use App\Models\CoachAthleteRelationship;
use App\Models\Gym;
use App\Models\GymAssignment;
use App\Models\PointTransaction;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

/**
 * Gym MVP slice (D-GYM): a gym_admin manages the member/coach roles of
 * their own gym and reads a member's shadow-quality training snapshot.
 * Focus: the per-gym gym_admin gate (anti-IDOR — 404 for anyone else),
 * the member/coach-only role restriction (no gym_admin/staff escalation),
 * and cross-gym isolation.
 */
class GymAdminApiTest extends TestCase
{
    use RefreshDatabase;

    private function gym(string $name = 'KAIROS'): Gym
    {
        return Gym::create(['name' => $name]);
    }

    private function branch(Gym $gym, string $name = 'Norte'): Branch
    {
        return Branch::create(['gym_id' => $gym->id, 'name' => $name]);
    }

    private function assign(User $user, Gym $gym, string $role, ?Branch $branch = null, string $status = GymAssignment::STATUS_ACTIVE): GymAssignment
    {
        return GymAssignment::create([
            'user_id' => $user->id,
            'gym_id' => $gym->id,
            'branch_id' => $branch?->id,
            'role' => $role,
            'status' => $status,
        ]);
    }

    private function admin(Gym $gym): User
    {
        $user = User::factory()->create();
        $this->assign($user, $gym, GymAssignment::ROLE_GYM_ADMIN);

        return $user;
    }

    // -----------------------------------------------------------------
    // members() / coaches() — gate
    // -----------------------------------------------------------------

    public function test_members_rejects_unauthenticated_requests(): void
    {
        $this->getJson('/api/v1/me/gym/1/members')->assertStatus(401);
        $this->getJson('/api/v1/me/gym/1/coaches')->assertStatus(401);
    }

    public function test_members_404_for_a_plain_user(): void
    {
        $gym = $this->gym();
        $user = User::factory()->create();

        $this->actingAs($user, 'sanctum')->getJson("/api/v1/me/gym/{$gym->id}/members")->assertStatus(404);
    }

    public function test_members_404_for_gym_admin_of_another_gym(): void
    {
        $gymA = $this->gym('A');
        $gymB = $this->gym('B');
        $adminB = $this->admin($gymB);

        $this->actingAs($adminB, 'sanctum')->getJson("/api/v1/me/gym/{$gymA->id}/members")->assertStatus(404);
    }

    public function test_members_404_for_nonexistent_gym(): void
    {
        $gym = $this->gym();
        $admin = $this->admin($gym);

        $this->actingAs($admin, 'sanctum')->getJson('/api/v1/me/gym/999999/members')->assertStatus(404);
    }

    public function test_members_404_for_a_non_numeric_gym_segment(): void
    {
        $admin = $this->admin($this->gym());

        $this->actingAs($admin, 'sanctum')->getJson('/api/v1/me/gym/abc/members')->assertStatus(404);
    }

    public function test_members_404_when_gym_admin_assignment_is_inactive(): void
    {
        $gym = $this->gym();
        $user = User::factory()->create();
        $this->assign($user, $gym, GymAssignment::ROLE_GYM_ADMIN, null, GymAssignment::STATUS_INACTIVE);

        $this->actingAs($user, 'sanctum')->getJson("/api/v1/me/gym/{$gym->id}/members")->assertStatus(404);
    }

    // -----------------------------------------------------------------
    // members() / coaches() — payload
    // -----------------------------------------------------------------

    public function test_members_lists_active_member_assignments_with_the_exact_shape(): void
    {
        $gym = $this->gym();
        $branch = $this->branch($gym);
        $admin = $this->admin($gym);
        $member = User::factory()->create(['name' => 'Nadia']);
        $assignment = $this->assign($member, $gym, GymAssignment::ROLE_MEMBER, $branch);

        $response = $this->actingAs($admin, 'sanctum')->getJson("/api/v1/me/gym/{$gym->id}/members");

        $response->assertOk();
        $response->assertJsonCount(1, 'members');
        $row = $response->json('members.0');
        $this->assertSame(['id', 'user', 'role', 'branch', 'since'], array_keys($row));
        $this->assertSame(['id', 'name'], array_keys($row['user']));
        $this->assertSame($assignment->id, $row['id']);
        $this->assertSame($member->id, $row['user']['id']);
        $this->assertSame('Nadia', $row['user']['name']);
        $this->assertSame('member', $row['role']);
        $this->assertSame(['id' => $branch->id, 'name' => 'Norte'], $row['branch']);
        $this->assertArrayNotHasKey('email', $row['user']);
    }

    public function test_members_excludes_inactive_members_and_other_roles(): void
    {
        $gym = $this->gym();
        $branch = $this->branch($gym);
        $admin = $this->admin($gym);

        $this->assign(User::factory()->create(), $gym, GymAssignment::ROLE_MEMBER, $branch);
        $this->assign(User::factory()->create(), $gym, GymAssignment::ROLE_MEMBER, $branch, GymAssignment::STATUS_INACTIVE);
        $this->assign(User::factory()->create(), $gym, GymAssignment::ROLE_COACH);

        $response = $this->actingAs($admin, 'sanctum')->getJson("/api/v1/me/gym/{$gym->id}/members");

        $response->assertOk();
        $response->assertJsonCount(1, 'members');
    }

    public function test_members_does_not_leak_another_gyms_members(): void
    {
        $gymA = $this->gym('A');
        $branchA = $this->branch($gymA);
        $gymB = $this->gym('B');
        $branchB = $this->branch($gymB);

        $admin = $this->admin($gymA);
        $this->assign(User::factory()->create(), $gymA, GymAssignment::ROLE_MEMBER, $branchA);
        $this->assign(User::factory()->create(), $gymB, GymAssignment::ROLE_MEMBER, $branchB);

        $response = $this->actingAs($admin, 'sanctum')->getJson("/api/v1/me/gym/{$gymA->id}/members");

        $response->assertOk();
        $response->assertJsonCount(1, 'members');
    }

    public function test_coaches_lists_only_the_coach_role(): void
    {
        $gym = $this->gym();
        $branch = $this->branch($gym);
        $admin = $this->admin($gym);
        $this->assign(User::factory()->create(), $gym, GymAssignment::ROLE_COACH);
        $this->assign(User::factory()->create(), $gym, GymAssignment::ROLE_MEMBER, $branch);

        $response = $this->actingAs($admin, 'sanctum')->getJson("/api/v1/me/gym/{$gym->id}/coaches");

        $response->assertOk();
        $response->assertJsonCount(1, 'coaches');
        $this->assertSame('coach', $response->json('coaches.0.role'));
    }

    // -----------------------------------------------------------------
    // userLookup()
    // -----------------------------------------------------------------

    public function test_user_lookup_404_for_non_admin(): void
    {
        $gym = $this->gym();
        $user = User::factory()->create();
        $target = User::factory()->create(['email' => 'target@e2e.test']);

        $this->actingAs($user, 'sanctum')
            ->getJson("/api/v1/me/gym/{$gym->id}/user-lookup?email=target@e2e.test")
            ->assertStatus(404);
    }

    public function test_user_lookup_returns_the_minimal_shape_on_an_exact_match(): void
    {
        $gym = $this->gym();
        $admin = $this->admin($gym);
        $target = User::factory()->create(['name' => 'Bruno', 'email' => 'bruno@e2e.test']);

        $response = $this->actingAs($admin, 'sanctum')
            ->getJson("/api/v1/me/gym/{$gym->id}/user-lookup?email=bruno@e2e.test");

        $response->assertOk();
        $this->assertSame(['id', 'name'], array_keys($response->json('user')));
        $response->assertJsonPath('user.id', $target->id);
        $response->assertJsonPath('user.name', 'Bruno');
        $response->assertJsonMissingPath('user.email');
    }

    public function test_user_lookup_404_when_no_user_has_that_email(): void
    {
        $gym = $this->gym();
        $admin = $this->admin($gym);

        $this->actingAs($admin, 'sanctum')
            ->getJson("/api/v1/me/gym/{$gym->id}/user-lookup?email=nobody@e2e.test")
            ->assertStatus(404);
    }

    public function test_user_lookup_requires_an_email(): void
    {
        $gym = $this->gym();
        $admin = $this->admin($gym);

        $this->actingAs($admin, 'sanctum')
            ->getJson("/api/v1/me/gym/{$gym->id}/user-lookup")
            ->assertStatus(422)
            ->assertJsonValidationErrors(['email']);
    }

    public function test_user_lookup_is_an_exact_match_not_a_partial_one(): void
    {
        $gym = $this->gym();
        $admin = $this->admin($gym);
        User::factory()->create(['email' => 'annabelle@e2e.test']);

        $this->actingAs($admin, 'sanctum')
            ->getJson("/api/v1/me/gym/{$gym->id}/user-lookup?email=".urlencode('anna@e2e.test'))
            ->assertStatus(404);
    }

    // -----------------------------------------------------------------
    // storeAssignment()
    // -----------------------------------------------------------------

    public function test_store_assignment_404_for_non_admin(): void
    {
        $gym = $this->gym();
        $branch = $this->branch($gym);
        $user = User::factory()->create();
        $target = User::factory()->create();

        $this->actingAs($user, 'sanctum')->postJson("/api/v1/me/gym/{$gym->id}/assignments", [
            'user_id' => $target->id,
            'role' => 'member',
            'branch_id' => $branch->id,
        ])->assertStatus(404);

        $this->assertSame(0, GymAssignment::where('role', 'member')->count());
    }

    public function test_store_assignment_creates_an_active_member(): void
    {
        $gym = $this->gym();
        $branch = $this->branch($gym);
        $admin = $this->admin($gym);
        $target = User::factory()->create(['name' => 'Cora']);

        $response = $this->actingAs($admin, 'sanctum')->postJson("/api/v1/me/gym/{$gym->id}/assignments", [
            'user_id' => $target->id,
            'role' => 'member',
            'branch_id' => $branch->id,
        ]);

        $response->assertCreated();
        $response->assertJsonPath('assignment.user.id', $target->id);
        $response->assertJsonPath('assignment.role', 'member');
        $response->assertJsonPath('assignment.branch.id', $branch->id);
        $this->assertDatabaseHas('gym_assignments', [
            'user_id' => $target->id,
            'gym_id' => $gym->id,
            'branch_id' => $branch->id,
            'role' => 'member',
            'status' => 'active',
        ]);
    }

    public function test_store_assignment_creates_a_gym_wide_coach(): void
    {
        $gym = $this->gym();
        $admin = $this->admin($gym);
        $target = User::factory()->create();

        $response = $this->actingAs($admin, 'sanctum')->postJson("/api/v1/me/gym/{$gym->id}/assignments", [
            'user_id' => $target->id,
            'role' => 'coach',
            'branch_id' => null,
        ]);

        $response->assertCreated();
        $response->assertJsonPath('assignment.role', 'coach');
        $response->assertJsonPath('assignment.branch', null);
        $this->assertDatabaseHas('gym_assignments', [
            'user_id' => $target->id,
            'gym_id' => $gym->id,
            'role' => 'coach',
            'status' => 'active',
        ]);
    }

    public function test_store_assignment_rejects_role_gym_admin(): void
    {
        $gym = $this->gym();
        $admin = $this->admin($gym);
        $target = User::factory()->create();

        $this->actingAs($admin, 'sanctum')->postJson("/api/v1/me/gym/{$gym->id}/assignments", [
            'user_id' => $target->id,
            'role' => 'gym_admin',
        ])->assertStatus(422)->assertJsonValidationErrors(['role']);

        $this->assertDatabaseMissing('gym_assignments', ['user_id' => $target->id, 'role' => 'gym_admin']);
    }

    public function test_store_assignment_rejects_role_staff(): void
    {
        $gym = $this->gym();
        $admin = $this->admin($gym);
        $target = User::factory()->create();

        $this->actingAs($admin, 'sanctum')->postJson("/api/v1/me/gym/{$gym->id}/assignments", [
            'user_id' => $target->id,
            'role' => 'staff',
        ])->assertStatus(422)->assertJsonValidationErrors(['role']);
    }

    public function test_store_assignment_member_requires_a_branch(): void
    {
        $gym = $this->gym();
        $admin = $this->admin($gym);
        $target = User::factory()->create();

        $this->actingAs($admin, 'sanctum')->postJson("/api/v1/me/gym/{$gym->id}/assignments", [
            'user_id' => $target->id,
            'role' => 'member',
            'branch_id' => null,
        ])->assertStatus(422)->assertJsonValidationErrors(['branch_id']);
    }

    public function test_store_assignment_rejects_a_branch_from_another_gym(): void
    {
        $gymA = $this->gym('A');
        $gymB = $this->gym('B');
        $branchB = $this->branch($gymB);
        $admin = $this->admin($gymA);
        $target = User::factory()->create();

        $this->actingAs($admin, 'sanctum')->postJson("/api/v1/me/gym/{$gymA->id}/assignments", [
            'user_id' => $target->id,
            'role' => 'member',
            'branch_id' => $branchB->id,
        ])->assertStatus(422)->assertJsonValidationErrors(['branch_id']);
    }

    public function test_store_assignment_takes_the_gym_from_the_route_not_the_body(): void
    {
        $gymA = $this->gym('A');
        $branchA = $this->branch($gymA);
        $gymB = $this->gym('B');
        $admin = $this->admin($gymA);
        $target = User::factory()->create();

        $this->actingAs($admin, 'sanctum')->postJson("/api/v1/me/gym/{$gymA->id}/assignments", [
            'user_id' => $target->id,
            'role' => 'member',
            'branch_id' => $branchA->id,
            'gym_id' => $gymB->id,
        ])->assertCreated();

        $this->assertDatabaseHas('gym_assignments', ['user_id' => $target->id, 'gym_id' => $gymA->id]);
        $this->assertDatabaseMissing('gym_assignments', ['user_id' => $target->id, 'gym_id' => $gymB->id]);
    }

    public function test_store_assignment_rejects_a_nonexistent_user(): void
    {
        $gym = $this->gym();
        $branch = $this->branch($gym);
        $admin = $this->admin($gym);

        $this->actingAs($admin, 'sanctum')->postJson("/api/v1/me/gym/{$gym->id}/assignments", [
            'user_id' => 999999,
            'role' => 'member',
            'branch_id' => $branch->id,
        ])->assertStatus(422)->assertJsonValidationErrors(['user_id']);
    }

    public function test_store_assignment_rejects_a_duplicate_active_assignment(): void
    {
        $gym = $this->gym();
        $branch = $this->branch($gym);
        $admin = $this->admin($gym);
        $target = User::factory()->create();
        $this->assign($target, $gym, GymAssignment::ROLE_MEMBER, $branch);

        $this->actingAs($admin, 'sanctum')->postJson("/api/v1/me/gym/{$gym->id}/assignments", [
            'user_id' => $target->id,
            'role' => 'member',
            'branch_id' => $branch->id,
        ])->assertStatus(422);

        $this->assertSame(1, GymAssignment::where('user_id', $target->id)->where('role', 'member')->count());
    }

    public function test_store_assignment_reactivates_a_revoked_assignment_in_place(): void
    {
        $gym = $this->gym();
        $branch = $this->branch($gym);
        $admin = $this->admin($gym);
        $target = User::factory()->create();
        $revoked = $this->assign($target, $gym, GymAssignment::ROLE_MEMBER, $branch, GymAssignment::STATUS_INACTIVE);

        $response = $this->actingAs($admin, 'sanctum')->postJson("/api/v1/me/gym/{$gym->id}/assignments", [
            'user_id' => $target->id,
            'role' => 'member',
            'branch_id' => $branch->id,
        ]);

        $response->assertOk();
        $this->assertSame('active', $revoked->fresh()->status);
        $this->assertSame(1, GymAssignment::where('user_id', $target->id)->where('role', 'member')->count());
    }

    // -----------------------------------------------------------------
    // destroyAssignment()
    // -----------------------------------------------------------------

    public function test_destroy_assignment_404_for_non_admin(): void
    {
        $gym = $this->gym();
        $branch = $this->branch($gym);
        $user = User::factory()->create();
        $assignment = $this->assign(User::factory()->create(), $gym, GymAssignment::ROLE_MEMBER, $branch);

        $this->actingAs($user, 'sanctum')
            ->deleteJson("/api/v1/me/gym/{$gym->id}/assignments/{$assignment->id}")
            ->assertStatus(404);

        $this->assertSame('active', $assignment->fresh()->status);
    }

    public function test_destroy_revokes_a_member_without_deleting_the_row(): void
    {
        $gym = $this->gym();
        $branch = $this->branch($gym);
        $admin = $this->admin($gym);
        $assignment = $this->assign(User::factory()->create(), $gym, GymAssignment::ROLE_MEMBER, $branch);

        $this->actingAs($admin, 'sanctum')
            ->deleteJson("/api/v1/me/gym/{$gym->id}/assignments/{$assignment->id}")
            ->assertStatus(204);

        $this->assertDatabaseHas('gym_assignments', ['id' => $assignment->id, 'status' => 'inactive']);
    }

    public function test_destroy_revokes_a_coach(): void
    {
        $gym = $this->gym();
        $admin = $this->admin($gym);
        $assignment = $this->assign(User::factory()->create(), $gym, GymAssignment::ROLE_COACH);

        $this->actingAs($admin, 'sanctum')
            ->deleteJson("/api/v1/me/gym/{$gym->id}/assignments/{$assignment->id}")
            ->assertStatus(204);

        $this->assertSame('inactive', $assignment->fresh()->status);
    }

    public function test_destroy_of_a_gym_admin_assignment_is_404(): void
    {
        $gym = $this->gym();
        $admin = $this->admin($gym);
        $otherAdminAssignment = $this->assign(User::factory()->create(), $gym, GymAssignment::ROLE_GYM_ADMIN);

        $this->actingAs($admin, 'sanctum')
            ->deleteJson("/api/v1/me/gym/{$gym->id}/assignments/{$otherAdminAssignment->id}")
            ->assertStatus(404);

        $this->assertSame('active', $otherAdminAssignment->fresh()->status);
    }

    public function test_destroy_of_another_gyms_assignment_is_404(): void
    {
        $gymA = $this->gym('A');
        $gymB = $this->gym('B');
        $branchB = $this->branch($gymB);
        $admin = $this->admin($gymA);
        $assignmentB = $this->assign(User::factory()->create(), $gymB, GymAssignment::ROLE_MEMBER, $branchB);

        $this->actingAs($admin, 'sanctum')
            ->deleteJson("/api/v1/me/gym/{$gymA->id}/assignments/{$assignmentB->id}")
            ->assertStatus(404);

        $this->assertSame('active', $assignmentB->fresh()->status);
    }

    public function test_destroy_of_a_nonexistent_assignment_is_404(): void
    {
        $gym = $this->gym();
        $admin = $this->admin($gym);

        $this->actingAs($admin, 'sanctum')
            ->deleteJson("/api/v1/me/gym/{$gym->id}/assignments/999999")
            ->assertStatus(404);
    }

    public function test_destroy_repeated_is_404_once_already_inactive(): void
    {
        $gym = $this->gym();
        $branch = $this->branch($gym);
        $admin = $this->admin($gym);
        $assignment = $this->assign(User::factory()->create(), $gym, GymAssignment::ROLE_MEMBER, $branch);

        $this->actingAs($admin, 'sanctum')->deleteJson("/api/v1/me/gym/{$gym->id}/assignments/{$assignment->id}")->assertStatus(204);
        $this->actingAs($admin, 'sanctum')->deleteJson("/api/v1/me/gym/{$gym->id}/assignments/{$assignment->id}")->assertStatus(404);
    }

    // -----------------------------------------------------------------
    // memberDetail()
    // -----------------------------------------------------------------

    public function test_member_detail_404_for_non_admin(): void
    {
        $gym = $this->gym();
        $branch = $this->branch($gym);
        $member = User::factory()->create();
        $this->assign($member, $gym, GymAssignment::ROLE_MEMBER, $branch);
        $outsider = User::factory()->create();

        $this->actingAs($outsider, 'sanctum')
            ->getJson("/api/v1/me/gym/{$gym->id}/members/{$member->id}")
            ->assertStatus(404);
    }

    public function test_member_detail_404_for_admin_of_another_gym(): void
    {
        $gymA = $this->gym('A');
        $gymB = $this->gym('B');
        $branchB = $this->branch($gymB);
        $adminA = $this->admin($gymA);
        $member = User::factory()->create();
        $this->assign($member, $gymB, GymAssignment::ROLE_MEMBER, $branchB);

        $this->actingAs($adminA, 'sanctum')
            ->getJson("/api/v1/me/gym/{$gymA->id}/members/{$member->id}")
            ->assertStatus(404);
    }

    public function test_member_detail_404_when_target_is_only_a_coach(): void
    {
        $gym = $this->gym();
        $admin = $this->admin($gym);
        $coach = User::factory()->create();
        $this->assign($coach, $gym, GymAssignment::ROLE_COACH);

        $this->actingAs($admin, 'sanctum')
            ->getJson("/api/v1/me/gym/{$gym->id}/members/{$coach->id}")
            ->assertStatus(404);
    }

    public function test_member_detail_404_when_target_member_is_inactive(): void
    {
        $gym = $this->gym();
        $branch = $this->branch($gym);
        $admin = $this->admin($gym);
        $member = User::factory()->create();
        $this->assign($member, $gym, GymAssignment::ROLE_MEMBER, $branch, GymAssignment::STATUS_INACTIVE);

        $this->actingAs($admin, 'sanctum')
            ->getJson("/api/v1/me/gym/{$gym->id}/members/{$member->id}")
            ->assertStatus(404);
    }

    public function test_member_detail_404_when_target_has_no_assignment_in_this_gym(): void
    {
        $gym = $this->gym();
        $admin = $this->admin($gym);
        $stranger = User::factory()->create();

        $this->actingAs($admin, 'sanctum')
            ->getJson("/api/v1/me/gym/{$gym->id}/members/{$stranger->id}")
            ->assertStatus(404);
    }

    public function test_member_detail_returns_the_shadow_snapshot_shape(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-08-28T12:00:00Z'));

        $gym = $this->gym();
        $branch = $this->branch($gym);
        $admin = $this->admin($gym);
        $member = User::factory()->create(['name' => 'Cora']);
        $this->assign($member, $gym, GymAssignment::ROLE_MEMBER, $branch);

        $member->profile()->create([
            'age' => 24, 'weight' => 58, 'height' => 165,
            'months_training' => 6, 'level' => 'novato', 'focus_id' => 'fatloss',
        ]);
        $activity = Activity::create([
            'user_id' => $member->id, 'routine_label' => 'Cardio',
            'started_at' => '2026-08-27T10:00:00Z', 'finished_at' => '2026-08-27T10:40:00Z',
            'duration_seconds' => 2400, 'sets_completed' => 4, 'exercises_completed' => 3,
        ]);
        $activity->pointTransactions()->create([
            'user_id' => $member->id, 'amount' => 60, 'reason' => PointTransaction::REASON_WORKOUT_COMPLETED,
        ]);
        CheckIn::create(['user_id' => $member->id, 'check_in_date' => '2026-08-28', 'checked_in_at' => '2026-08-28T09:00:00Z']);

        $response = $this->actingAs($admin, 'sanctum')->getJson("/api/v1/me/gym/{$gym->id}/members/{$member->id}");

        $response->assertOk();
        $this->assertSame(
            ['athlete', 'profile', 'activity_summary', 'streak', 'points'],
            array_keys($response->json()),
        );
        $this->assertSame(['id', 'name'], array_keys($response->json('athlete')));
        $response->assertJsonPath('athlete.name', 'Cora');
        $response->assertJsonPath('profile.focus_id', 'fatloss');
        $response->assertJsonPath('activity_summary.count', 1);
        $response->assertJsonPath('activity_summary.recent.0.points_awarded', 60);
        $response->assertJsonPath('streak.current_streak', 1);
        $response->assertJsonPath('points.balance', 60);
        $response->assertJsonMissingPath('athlete.email');

        Carbon::setTestNow();
    }

    public function test_member_detail_profile_is_null_and_counters_zero_without_data(): void
    {
        $gym = $this->gym();
        $branch = $this->branch($gym);
        $admin = $this->admin($gym);
        $member = User::factory()->create();
        $this->assign($member, $gym, GymAssignment::ROLE_MEMBER, $branch);

        $response = $this->actingAs($admin, 'sanctum')->getJson("/api/v1/me/gym/{$gym->id}/members/{$member->id}");

        $response->assertOk();
        $response->assertJsonPath('profile', null);
        $response->assertJsonPath('activity_summary.count', 0);
        $response->assertJsonPath('activity_summary.recent', []);
        $response->assertJsonPath('streak.current_streak', 0);
        $response->assertJsonPath('points.balance', 0);
    }

    public function test_member_detail_snapshot_matches_the_coach_surface_shape(): void
    {
        $gym = $this->gym();
        $branch = $this->branch($gym);
        $admin = $this->admin($gym);

        // Same user is a member of the gym AND an athlete of a coach.
        $member = User::factory()->create(['name' => 'Dual']);
        $this->assign($member, $gym, GymAssignment::ROLE_MEMBER, $branch);
        $member->profile()->create(['level' => 'intermedio']);

        $coach = User::factory()->create();
        $this->assign($coach, $gym, GymAssignment::ROLE_COACH);
        CoachAthleteRelationship::create([
            'coach_user_id' => $coach->id,
            'athlete_user_id' => $member->id,
            'status' => CoachAthleteRelationship::STATUS_ACTIVE,
            'requested_at' => now()->subDay(),
            'activated_at' => now()->subDay(),
        ]);

        $gymView = $this->actingAs($admin, 'sanctum')->getJson("/api/v1/me/gym/{$gym->id}/members/{$member->id}")->json();
        $coachView = $this->actingAs($coach, 'sanctum')->getJson("/api/v1/me/coach/athletes/{$member->id}")->json();

        $this->assertSame($coachView, $gymView);
    }

    // -----------------------------------------------------------------
    // Cross-domain isolation
    // -----------------------------------------------------------------

    public function test_revoking_membership_does_not_touch_the_coach_athlete_relationship(): void
    {
        $gym = $this->gym();
        $branch = $this->branch($gym);
        $admin = $this->admin($gym);

        $member = User::factory()->create();
        $memberAssignment = $this->assign($member, $gym, GymAssignment::ROLE_MEMBER, $branch);

        $coach = User::factory()->create();
        $this->assign($coach, $gym, GymAssignment::ROLE_COACH);
        $relationship = CoachAthleteRelationship::create([
            'coach_user_id' => $coach->id,
            'athlete_user_id' => $member->id,
            'status' => CoachAthleteRelationship::STATUS_ACTIVE,
            'requested_at' => now()->subDay(),
            'activated_at' => now()->subDay(),
        ]);

        $this->actingAs($admin, 'sanctum')
            ->deleteJson("/api/v1/me/gym/{$gym->id}/assignments/{$memberAssignment->id}")
            ->assertStatus(204);

        // Membership revoked; the coach relationship is untouched and the
        // coach can still read the (now ex-member) athlete.
        $this->assertSame('inactive', $memberAssignment->fresh()->status);
        $this->assertSame('active', $relationship->fresh()->status);
        $this->actingAs($coach, 'sanctum')
            ->getJson("/api/v1/me/coach/athletes/{$member->id}")
            ->assertOk();
    }
}
