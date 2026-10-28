<?php

namespace App\Console\Commands;

use App\Models\User;
use Illuminate\Console\Command;

/**
 * Ops-only bootstrap for the "BIAFYT Admin" (platform admin) role.
 *
 * There is deliberately NO API/endpoint that grants `is_platform_admin`
 * (platform authorization is separate from every user-facing flow). This is
 * the controlled, idempotent way to create the first admin on a host — the
 * same pattern as `BIAFYT:grant-gym-admin`.
 *
 *   php artisan BIAFYT:grant-platform-admin admin@BIAFYT.example
 *   php artisan BIAFYT:grant-platform-admin admin@BIAFYT.example --revoke
 */
class GrantPlatformAdmin extends Command
{
    protected $signature = 'BIAFYT:grant-platform-admin
        {email : Email of an EXISTING registered user}
        {--revoke : Remove the platform-admin flag instead of granting it}';

    protected $description = 'Grant or revoke the BIAFYT Admin (platform admin) flag for a user (idempotent, ops-only).';

    public function handle(): int
    {
        $email = $this->argument('email');
        $revoke = (bool) $this->option('revoke');

        $user = User::query()->where('email', $email)->first();

        if ($user === null) {
            $this->error("No registered user with email \"{$email}\". The user must sign up first.");

            return self::FAILURE;
        }

        $target = ! $revoke;

        if ((bool) $user->is_platform_admin === $target) {
            $this->info($target
                ? "Already a BIAFYT Admin: {$user->email}."
                : "Not a BIAFYT Admin: {$user->email} (nothing to revoke).");

            return self::SUCCESS;
        }

        $user->is_platform_admin = $target;
        $user->save();

        $this->info($target
            ? "Granted: {$user->email} is now a BIAFYT Admin."
            : "Revoked: {$user->email} is no longer a BIAFYT Admin.");

        return self::SUCCESS;
    }
}
