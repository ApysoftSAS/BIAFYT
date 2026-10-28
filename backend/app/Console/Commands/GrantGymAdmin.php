<?php

namespace App\Console\Commands;

use App\Models\Branch;
use App\Models\Gym;
use App\Models\GymAssignment;
use App\Models\User;
use Illuminate\Console\Command;

/**
 * F4 (production hardening): the ops-only bootstrap for the first `gym_admin`
 * of a gym.
 *
 * There is deliberately NO API/endpoint for granting `gym_admin` (decisions
 * D-GYM-3 / D-GYM-8). This artisan command is a controlled, idempotent
 * replacement for a hand-written `tinker` session on the production host — it
 * is not a privilege-elevation surface reachable by a user.
 *
 * It creates the Gym and (optionally) the Branch if they do not exist, and
 * creates or reactivates the `gym_admin` GymAssignment. The target user must
 * already be registered.
 */
class GrantGymAdmin extends Command
{
    protected $signature = 'BIAFYT:grant-gym-admin
        {email : Email of an EXISTING registered user}
        {gym-name : Gym name (the gym is created if it does not exist)}
        {--branch= : Branch name within the gym (created if missing). Omit for a gym-wide gym_admin.}';

    protected $description = 'Grant or reactivate the gym_admin role for a user in a gym (idempotent, ops-only bootstrap).';

    public function handle(): int
    {
        $email = $this->argument('email');
        $gymName = $this->argument('gym-name');
        $branchName = $this->option('branch');

        $user = User::query()->where('email', $email)->first();

        if ($user === null) {
            $this->error("No registered user with email \"{$email}\". The user must sign up first.");

            return self::FAILURE;
        }

        $gym = Gym::query()->firstOrCreate(['name' => $gymName]);

        $branchId = null;

        if ($branchName !== null) {
            $branch = Branch::query()->firstOrCreate([
                'gym_id' => $gym->id,
                'name' => $branchName,
            ]);
            $branchId = $branch->id;
        }

        $assignment = GymAssignment::query()->firstOrNew([
            'user_id' => $user->id,
            'gym_id' => $gym->id,
            'branch_id' => $branchId,
            'role' => GymAssignment::ROLE_GYM_ADMIN,
        ]);

        $alreadyActive = $assignment->exists
            && $assignment->status === GymAssignment::STATUS_ACTIVE;

        $assignment->status = GymAssignment::STATUS_ACTIVE;
        $assignment->save();

        $scope = $branchId === null ? 'gym-wide' : "branch \"{$branchName}\"";

        if ($alreadyActive) {
            $this->info("Already active: {$user->email} is gym_admin of \"{$gym->name}\" ({$scope}).");
        } else {
            $this->info("Granted: {$user->email} is now gym_admin of \"{$gym->name}\" ({$scope}). [assignment #{$assignment->id}]");
        }

        return self::SUCCESS;
    }
}
