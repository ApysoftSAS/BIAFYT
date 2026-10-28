<?php

namespace Tests\Feature\Api\V1\Admin;

use App\Models\Branch;
use App\Models\Gym;
use App\Models\GymAssignment;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The BIAFYT Admin's read-only gym list.
 */
class GymApiTest extends TestCase
{
    use RefreshDatabase;

    private function platformAdmin(): User
    {
        $user = User::factory()->create();
        $user->forceFill(['is_platform_admin' => true])->save();

        return $user;
    }

    public function test_rejects_unauthenticated_and_non_admin_requests(): void
    {
        $this->getJson('/api/v1/admin/gyms')->assertStatus(401);
        $this->actingAs(User::factory()->create(), 'sanctum')->getJson('/api/v1/admin/gyms')->assertStatus(404);
    }

    public function test_lists_gyms_with_branches_and_active_role_counts_no_personal_data(): void
    {
        $admin = $this->platformAdmin();

        $gym = Gym::create(['name' => 'KAIROS']);
        $branch = Branch::create(['gym_id' => $gym->id, 'name' => 'Norte']);
        GymAssignment::create(['user_id' => User::factory()->create()->id, 'gym_id' => $gym->id, 'branch_id' => null, 'role' => 'gym_admin', 'status' => 'active']);
        GymAssignment::create(['user_id' => User::factory()->create()->id, 'gym_id' => $gym->id, 'branch_id' => null, 'role' => 'coach', 'status' => 'active']);
        GymAssignment::create(['user_id' => User::factory()->create()->id, 'gym_id' => $gym->id, 'branch_id' => $branch->id, 'role' => 'member', 'status' => 'active']);
        GymAssignment::create(['user_id' => User::factory()->create()->id, 'gym_id' => $gym->id, 'branch_id' => $branch->id, 'role' => 'member', 'status' => 'inactive']);

        $response = $this->actingAs($admin, 'sanctum')->getJson('/api/v1/admin/gyms');

        $response->assertOk();
        $response->assertJsonCount(1, 'gyms');
        $row = $response->json('gyms.0');
        $this->assertSame(
            ['id', 'name', 'branches', 'gym_admin_count', 'coach_count', 'member_count', 'created_at'],
            array_keys($row),
        );
        $this->assertSame('KAIROS', $row['name']);
        $this->assertSame([['id' => $branch->id, 'name' => 'Norte']], $row['branches']);
        $this->assertSame(1, $row['gym_admin_count']);
        $this->assertSame(1, $row['coach_count']);
        $this->assertSame(1, $row['member_count']); // inactive excluded
        $this->assertStringNotContainsString('email', json_encode($row));
    }
}
