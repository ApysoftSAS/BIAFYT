<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\Gym;
use App\Models\GymAssignment;
use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * F4 (production hardening): the `BIAFYT:grant-gym-admin` bootstrap command.
 */
class GrantGymAdminCommandTest extends TestCase
{
    use RefreshDatabase;

    public function test_fails_when_the_user_does_not_exist(): void
    {
        $this->artisan('BIAFYT:grant-gym-admin', [
            'email' => 'ghost@example.test',
            'gym-name' => 'KAIROS',
        ])->assertExitCode(Command::FAILURE);

        $this->assertSame(0, GymAssignment::count());
        $this->assertSame(0, Gym::count());
    }

    public function test_grants_a_gym_wide_gym_admin_creating_the_gym(): void
    {
        $user = User::factory()->create(['email' => 'admin@kairos.test']);

        $this->artisan('BIAFYT:grant-gym-admin', [
            'email' => 'admin@kairos.test',
            'gym-name' => 'KAIROS',
        ])->assertExitCode(Command::SUCCESS);

        $gym = Gym::firstWhere('name', 'KAIROS');
        $this->assertNotNull($gym);
        $this->assertDatabaseHas('gym_assignments', [
            'user_id' => $user->id,
            'gym_id' => $gym->id,
            'branch_id' => null,
            'role' => 'gym_admin',
            'status' => 'active',
        ]);
    }

    public function test_grants_a_branch_scoped_gym_admin_creating_the_branch(): void
    {
        $user = User::factory()->create(['email' => 'admin@kairos.test']);

        $this->artisan('BIAFYT:grant-gym-admin', [
            'email' => 'admin@kairos.test',
            'gym-name' => 'KAIROS',
            '--branch' => 'Norte',
        ])->assertExitCode(Command::SUCCESS);

        $gym = Gym::firstWhere('name', 'KAIROS');
        $branch = Branch::firstWhere(['gym_id' => $gym->id, 'name' => 'Norte']);
        $this->assertNotNull($branch);
        $this->assertDatabaseHas('gym_assignments', [
            'user_id' => $user->id,
            'gym_id' => $gym->id,
            'branch_id' => $branch->id,
            'role' => 'gym_admin',
            'status' => 'active',
        ]);
    }

    public function test_is_idempotent(): void
    {
        $user = User::factory()->create(['email' => 'admin@kairos.test']);
        $gym = Gym::create(['name' => 'KAIROS']);

        $args = ['email' => 'admin@kairos.test', 'gym-name' => 'KAIROS'];

        $this->artisan('BIAFYT:grant-gym-admin', $args)->assertExitCode(Command::SUCCESS);
        $this->artisan('BIAFYT:grant-gym-admin', $args)->assertExitCode(Command::SUCCESS);

        $this->assertSame(1, Gym::where('name', 'KAIROS')->count());
        $this->assertSame(1, GymAssignment::where('user_id', $user->id)
            ->where('gym_id', $gym->id)
            ->where('role', 'gym_admin')
            ->count());
    }

    public function test_reactivates_a_previously_inactive_assignment_in_place(): void
    {
        $user = User::factory()->create(['email' => 'admin@kairos.test']);
        $gym = Gym::create(['name' => 'KAIROS']);
        $assignment = GymAssignment::create([
            'user_id' => $user->id,
            'gym_id' => $gym->id,
            'branch_id' => null,
            'role' => 'gym_admin',
            'status' => 'inactive',
        ]);

        $this->artisan('BIAFYT:grant-gym-admin', [
            'email' => 'admin@kairos.test',
            'gym-name' => 'KAIROS',
        ])->assertExitCode(Command::SUCCESS);

        $this->assertSame('active', $assignment->fresh()->status);
        $this->assertSame(1, GymAssignment::count());
    }

    public function test_reuses_an_existing_gym(): void
    {
        $user = User::factory()->create(['email' => 'admin@kairos.test']);
        $gym = Gym::create(['name' => 'KAIROS']);

        $this->artisan('BIAFYT:grant-gym-admin', [
            'email' => 'admin@kairos.test',
            'gym-name' => 'KAIROS',
        ])->assertExitCode(Command::SUCCESS);

        $this->assertSame(1, Gym::count());
        $this->assertSame($gym->id, Gym::firstWhere('name', 'KAIROS')->id);
    }
}
