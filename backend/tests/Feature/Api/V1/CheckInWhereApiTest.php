<?php

namespace Tests\Feature\Api\V1;

use App\Models\Branch;
use App\Models\CheckIn;
use App\Models\Gym;
use App\Models\GymAssignment;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/** Dónde se hizo el check-in (gym_id / branch_id) y cómo lo usan los reportes. */
class CheckInWhereApiTest extends TestCase
{
    use RefreshDatabase;

    private function join(User $u, Gym $g, ?Branch $b = null): void
    {
        $b ??= Branch::create(['gym_id' => $g->id, 'name' => 'Sede '.$g->id]);
        GymAssignment::create([
            'user_id' => $u->id, 'gym_id' => $g->id, 'branch_id' => $b->id,
            'role' => GymAssignment::ROLE_MEMBER, 'status' => GymAssignment::STATUS_ACTIVE,
        ]);
    }

    public function test_single_membership_is_used_automatically(): void
    {
        $gym = Gym::create(['name' => 'KAIROS']);
        $branch = Branch::create(['gym_id' => $gym->id, 'name' => 'Norte']);
        $u = User::factory()->create();
        $this->join($u, $gym, $branch);

        $this->actingAs($u, 'sanctum')->postJson('/api/v1/me/check-ins')
            ->assertCreated()->assertJsonPath('check_in.gym_id', $gym->id)->assertJsonPath('check_in.branch_id', $branch->id);
    }

    public function test_no_membership_or_ambiguous_leaves_gym_empty(): void
    {
        $u = User::factory()->create();
        $this->actingAs($u, 'sanctum')->postJson('/api/v1/me/check-ins')->assertCreated()->assertJsonPath('check_in.gym_id', null);

        $a = Gym::create(['name' => 'A']);
        $b = Gym::create(['name' => 'B']);
        $v = User::factory()->create();
        $this->join($v, $a);
        $this->join($v, $b);
        $this->actingAs($v, 'sanctum')->postJson('/api/v1/me/check-ins')->assertCreated()->assertJsonPath('check_in.gym_id', null);
    }

    public function test_explicit_gym_must_be_an_active_membership_and_branch_must_belong(): void
    {
        $a = Gym::create(['name' => 'A']);
        $b = Gym::create(['name' => 'B']);
        $branchB = Branch::create(['gym_id' => $b->id, 'name' => 'X']);
        $u = User::factory()->create();
        $this->join($u, $a);
        $this->join($u, $b);

        $this->actingAs($u, 'sanctum')->postJson('/api/v1/me/check-ins', ['gym_id' => Gym::create(['name' => 'C'])->id])
            ->assertStatus(422)->assertJsonValidationErrors('gym_id');
        $this->postJson('/api/v1/me/check-ins', ['gym_id' => $a->id, 'branch_id' => $branchB->id])
            ->assertStatus(422)->assertJsonValidationErrors('branch_id');
        $this->postJson('/api/v1/me/check-ins', ['branch_id' => $branchB->id])
            ->assertStatus(422)->assertJsonValidationErrors('branch_id');
        $this->assertDatabaseCount('check_ins', 0);

        $this->postJson('/api/v1/me/check-ins', ['gym_id' => $b->id, 'branch_id' => $branchB->id])
            ->assertCreated()->assertJsonPath('check_in.gym_id', $b->id);
    }

    public function test_report_ignores_check_ins_made_at_another_gym(): void
    {
        $a = Gym::create(['name' => 'A']);
        $b = Gym::create(['name' => 'B']);
        $admin = User::factory()->create();
        GymAssignment::create([
            'user_id' => $admin->id, 'gym_id' => $a->id, 'branch_id' => null,
            'role' => GymAssignment::ROLE_GYM_ADMIN, 'status' => GymAssignment::STATUS_ACTIVE,
        ]);
        $u = User::factory()->create();
        $this->join($u, $a);
        $this->join($u, $b);
        $this->travel(1)->days(); // la alta cuenta desde su día

        CheckIn::create(['user_id' => $u->id, 'gym_id' => $b->id, 'check_in_date' => now()->toDateString(), 'checked_in_at' => now()]);
        $total = fn () => $this->actingAs($admin, 'sanctum')->getJson("/api/v1/me/gym/{$a->id}/reports")->json('report.totals.check_ins');
        $this->assertSame(0, $total());

        CheckIn::query()->delete();
        CheckIn::create(['user_id' => $u->id, 'gym_id' => $a->id, 'check_in_date' => now()->toDateString(), 'checked_in_at' => now()]);
        $this->assertSame(1, $total());
    }
}
