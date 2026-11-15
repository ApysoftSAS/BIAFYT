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
 * The `staff` role (reception). The gym_admin grants and revokes it; staff
 * can run the member side of the gym (list, look up, add/revoke MEMBERS,
 * read a member's snapshot, mark a voucher used) and nothing else.
 */
class GymStaffApiTest extends TestCase
{
    use RefreshDatabase;

    private Gym $gym;

    private Branch $branch;

    private User $admin;

    private User $staff;

    protected function setUp(): void
    {
        parent::setUp();
        $this->gym = Gym::create(['name' => 'KAIROS']);
        $this->branch = Branch::create(['gym_id' => $this->gym->id, 'name' => 'Norte']);
        $this->admin = $this->holder(GymAssignment::ROLE_GYM_ADMIN);
        $this->staff = $this->holder(GymAssignment::ROLE_STAFF);
    }

    private function holder(string $role, ?Gym $gym = null, string $status = GymAssignment::STATUS_ACTIVE): User
    {
        $user = User::factory()->create();
        GymAssignment::create([
            'user_id' => $user->id,
            'gym_id' => ($gym ?? $this->gym)->id,
            'branch_id' => $role === GymAssignment::ROLE_MEMBER ? $this->branch->id : null,
            'role' => $role,
            'status' => $status,
        ]);

        return $user;
    }

    private function url(string $path): string
    {
        return "/api/v1/me/gym/{$this->gym->id}/{$path}";
    }

    public function test_admin_grants_lists_and_revokes_staff(): void
    {
        $person = User::factory()->create();

        $created = $this->actingAs($this->admin)
            ->postJson($this->url('assignments'), ['user_id' => $person->id, 'role' => 'staff'])
            ->assertStatus(201)->assertJsonPath('assignment.role', 'staff');

        $this->actingAs($this->admin)->getJson($this->url('staff'))
            ->assertOk()->assertJsonCount(2, 'staff'); // setUp staff + the new one

        $this->actingAs($this->admin)->deleteJson($this->url('assignments/'.$created->json('assignment.id')))->assertStatus(204);
        $this->assertDatabaseHas('gym_assignments', ['user_id' => $person->id, 'role' => 'staff', 'status' => 'inactive']);
        $this->actingAs($this->admin)->getJson($this->url('staff'))->assertJsonCount(1, 'staff');
    }

    public function test_gym_admin_still_cannot_be_granted_by_api(): void
    {
        $this->actingAs($this->admin)
            ->postJson($this->url('assignments'), ['user_id' => User::factory()->create()->id, 'role' => 'gym_admin'])
            ->assertStatus(422)->assertJsonValidationErrors('role');
    }

    public function test_staff_runs_the_member_side_of_the_gym(): void
    {
        $member = $this->holder(GymAssignment::ROLE_MEMBER);
        $newcomer = User::factory()->create(['email' => 'nuevo@example.test']);

        $this->actingAs($this->staff)->getJson($this->url('members'))->assertOk()->assertJsonCount(1, 'members');
        $this->actingAs($this->staff)->getJson($this->url('coaches'))->assertOk();
        $this->actingAs($this->staff)->getJson($this->url('user-lookup?email=nuevo@example.test'))
            ->assertOk()->assertJsonPath('user.id', $newcomer->id);
        $this->actingAs($this->staff)->getJson($this->url("members/{$member->id}"))->assertOk()->assertJsonPath('athlete.id', $member->id);

        $added = $this->actingAs($this->staff)
            ->postJson($this->url('assignments'), ['user_id' => $newcomer->id, 'role' => 'member', 'branch_id' => $this->branch->id])
            ->assertStatus(201);
        $this->actingAs($this->staff)->deleteJson($this->url('assignments/'.$added->json('assignment.id')))->assertStatus(204);
    }

    public function test_staff_cannot_grant_or_revoke_coach_or_staff(): void
    {
        $person = User::factory()->create();

        foreach (['coach', 'staff'] as $role) {
            $this->actingAs($this->staff)
                ->postJson($this->url('assignments'), ['user_id' => $person->id, 'role' => $role])
                ->assertStatus(422)->assertJsonValidationErrors('role');
        }
        $this->assertSame(0, GymAssignment::where('user_id', $person->id)->count());

        $coach = $this->holder(GymAssignment::ROLE_COACH);
        $coachRow = GymAssignment::where('user_id', $coach->id)->first();
        $staffRow = GymAssignment::where('user_id', $this->staff->id)->first();
        $this->actingAs($this->staff)->deleteJson($this->url("assignments/{$coachRow->id}"))->assertStatus(404);
        $this->actingAs($this->staff)->deleteJson($this->url("assignments/{$staffRow->id}"))->assertStatus(404);
        $this->assertSame('active', $coachRow->fresh()->status);
    }

    public function test_staff_is_locked_out_of_admin_only_areas(): void
    {
        foreach (['staff', 'branches', 'reports', 'equipment', 'equipment-requests'] as $path) {
            $this->actingAs($this->staff)->getJson($this->url($path))->assertStatus(404);
        }
        $this->actingAs($this->staff)->postJson($this->url('branches'), ['name' => 'X'])->assertStatus(404);
        $this->actingAs($this->staff)->postJson($this->url('vouchers'), [])->assertStatus(404);
    }

    public function test_staff_can_see_and_redeem_vouchers_but_not_revoke_them(): void
    {
        $member = $this->holder(GymAssignment::ROLE_MEMBER);
        $voucher = Voucher::create([
            'code' => 'VCH-STAFF0000001', 'gym_id' => $this->gym->id, 'coach_user_id' => null,
            'issued_by_user_id' => $this->admin->id, 'athlete_user_id' => $member->id,
            'title' => 'Clase gratis', 'benefit_type' => 'text', 'benefit_description' => 'Una clase',
            'status' => Voucher::STATUS_ISSUED,
        ]);

        $this->actingAs($this->staff)->getJson($this->url('vouchers'))->assertOk()->assertJsonCount(1, 'vouchers');
        $this->actingAs($this->staff)->getJson($this->url("vouchers/{$voucher->id}"))->assertOk();
        $this->actingAs($this->staff)->postJson($this->url("vouchers/{$voucher->id}/revoke"), [])->assertStatus(404);
        $this->actingAs($this->staff)->postJson($this->url("vouchers/{$voucher->id}/redeem"), [])
            ->assertOk()->assertJsonPath('voucher.status', 'redeemed');
        $this->assertSame($this->staff->id, $voucher->fresh()->redeemed_by_user_id);
    }

    public function test_staff_of_another_gym_or_inactive_staff_get_404(): void
    {
        $this->getJson($this->url('members'))->assertStatus(401);

        $other = Gym::create(['name' => 'Other']);
        $foreign = $this->holder(GymAssignment::ROLE_STAFF, $other);
        $revoked = $this->holder(GymAssignment::ROLE_STAFF, null, GymAssignment::STATUS_INACTIVE);

        foreach ([$foreign, $revoked, User::factory()->create()] as $user) {
            $this->actingAs($user)->getJson($this->url('members'))->assertStatus(404);
            $this->actingAs($user)->getJson($this->url('vouchers'))->assertStatus(404);
        }
    }

    public function test_a_user_who_is_both_admin_and_staff_keeps_admin_powers(): void
    {
        GymAssignment::create([
            'user_id' => $this->admin->id, 'gym_id' => $this->gym->id, 'branch_id' => null,
            'role' => GymAssignment::ROLE_STAFF, 'status' => GymAssignment::STATUS_ACTIVE,
        ]);

        $this->actingAs($this->admin)
            ->postJson($this->url('assignments'), ['user_id' => User::factory()->create()->id, 'role' => 'coach'])
            ->assertStatus(201);
    }
}
