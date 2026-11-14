<?php

namespace Tests\Feature\Api\V1;

use App\Models\Branch;
use App\Models\Gym;
use App\Models\GymAssignment;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Branch ("sede") management by the gym_admin of the gym — and only that gym.
 */
class GymBranchApiTest extends TestCase
{
    use RefreshDatabase;

    /**
     * @return array{0: User, 1: Gym, 2: Branch}
     */
    private function makeGymWithAdmin(string $name = 'Gym One'): array
    {
        $admin = User::factory()->create();
        $gym = Gym::create(['name' => $name]);
        $branch = Branch::create(['gym_id' => $gym->id, 'name' => 'Norte']);
        GymAssignment::create([
            'user_id' => $admin->id,
            'gym_id' => $gym->id,
            'branch_id' => null,
            'role' => GymAssignment::ROLE_GYM_ADMIN,
            'status' => GymAssignment::STATUS_ACTIVE,
        ]);

        return [$admin, $gym, $branch];
    }

    private function addMember(Gym $gym, Branch $branch, string $status = GymAssignment::STATUS_ACTIVE): void
    {
        GymAssignment::create([
            'user_id' => User::factory()->create()->id,
            'gym_id' => $gym->id,
            'branch_id' => $branch->id,
            'role' => GymAssignment::ROLE_MEMBER,
            'status' => $status,
        ]);
    }

    public function test_admin_lists_creates_and_renames_branches(): void
    {
        [$admin, $gym, $branch] = $this->makeGymWithAdmin();
        $this->addMember($gym, $branch);
        $this->addMember($gym, $branch, GymAssignment::STATUS_INACTIVE);

        $this->actingAs($admin)->getJson("/api/v1/me/gym/{$gym->id}/branches")
            ->assertOk()
            ->assertJsonCount(1, 'branches')
            ->assertJsonPath('branches.0.members_count', 1);

        $this->actingAs($admin)->postJson("/api/v1/me/gym/{$gym->id}/branches", ['name' => ' Sur '])
            ->assertStatus(201)->assertJsonPath('branch.name', 'Sur');
        $this->actingAs($admin)->postJson("/api/v1/me/gym/{$gym->id}/branches", ['name' => 'Sur'])
            ->assertStatus(422)->assertJsonValidationErrors('name');

        $this->actingAs($admin)->patchJson("/api/v1/me/gym/{$gym->id}/branches/{$branch->id}", ['name' => 'Centro'])
            ->assertOk()->assertJsonPath('branch.name', 'Centro');
        // Renaming to its own current name is not a duplicate.
        $this->actingAs($admin)->patchJson("/api/v1/me/gym/{$gym->id}/branches/{$branch->id}", ['name' => 'Centro'])
            ->assertOk();
    }

    public function test_delete_is_refused_for_the_last_branch_or_one_with_assignments(): void
    {
        [$admin, $gym, $norte] = $this->makeGymWithAdmin();

        $this->actingAs($admin)->deleteJson("/api/v1/me/gym/{$gym->id}/branches/{$norte->id}")->assertStatus(422);

        $sur = Branch::create(['gym_id' => $gym->id, 'name' => 'Sur']);
        $this->addMember($gym, $norte, GymAssignment::STATUS_INACTIVE);

        $this->actingAs($admin)->deleteJson("/api/v1/me/gym/{$gym->id}/branches/{$norte->id}")->assertStatus(422);
        $this->actingAs($admin)->deleteJson("/api/v1/me/gym/{$gym->id}/branches/{$sur->id}")->assertStatus(204);
        $this->assertSame(1, Branch::where('gym_id', $gym->id)->count());
    }

    public function test_only_the_gym_admin_of_that_gym_can_manage_its_branches(): void
    {
        [, $gym, $branch] = $this->makeGymWithAdmin();
        [$otherAdmin, $otherGym] = $this->makeGymWithAdmin('Gym Two');

        $this->getJson("/api/v1/me/gym/{$gym->id}/branches")->assertStatus(401);

        foreach ([User::factory()->create(), $otherAdmin] as $intruder) {
            $this->actingAs($intruder)->getJson("/api/v1/me/gym/{$gym->id}/branches")->assertStatus(404);
            $this->actingAs($intruder)->postJson("/api/v1/me/gym/{$gym->id}/branches", ['name' => 'X'])->assertStatus(404);
        }

        // A branch of another gym is a 404 even through the admin's own gym route.
        $this->actingAs($otherAdmin)
            ->patchJson("/api/v1/me/gym/{$otherGym->id}/branches/{$branch->id}", ['name' => 'Hack'])
            ->assertStatus(404);
        $this->actingAs($otherAdmin)
            ->deleteJson("/api/v1/me/gym/{$otherGym->id}/branches/{$branch->id}")
            ->assertStatus(404);
        $this->assertSame('Norte', $branch->fresh()->name);
    }
}
