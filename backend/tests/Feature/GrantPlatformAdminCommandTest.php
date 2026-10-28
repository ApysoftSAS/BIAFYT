<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The `BIAFYT:grant-platform-admin` ops command.
 */
class GrantPlatformAdminCommandTest extends TestCase
{
    use RefreshDatabase;

    public function test_fails_when_the_user_does_not_exist(): void
    {
        $this->artisan('BIAFYT:grant-platform-admin', ['email' => 'ghost@example.test'])
            ->assertExitCode(Command::FAILURE);
    }

    public function test_grants_the_platform_admin_flag(): void
    {
        $user = User::factory()->create(['email' => 'admin@BIAFYT.test']);
        $this->assertFalse((bool) $user->is_platform_admin);

        $this->artisan('BIAFYT:grant-platform-admin', ['email' => 'admin@BIAFYT.test'])
            ->assertExitCode(Command::SUCCESS);

        $this->assertTrue((bool) $user->fresh()->is_platform_admin);
    }

    public function test_is_idempotent(): void
    {
        $user = User::factory()->create(['email' => 'admin@BIAFYT.test']);

        $this->artisan('BIAFYT:grant-platform-admin', ['email' => 'admin@BIAFYT.test'])->assertExitCode(0);
        $this->artisan('BIAFYT:grant-platform-admin', ['email' => 'admin@BIAFYT.test'])->assertExitCode(0);

        $this->assertTrue((bool) $user->fresh()->is_platform_admin);
    }

    public function test_can_revoke(): void
    {
        $user = User::factory()->create(['email' => 'admin@BIAFYT.test']);
        $user->forceFill(['is_platform_admin' => true])->save();

        $this->artisan('BIAFYT:grant-platform-admin', ['email' => 'admin@BIAFYT.test', '--revoke' => true])
            ->assertExitCode(Command::SUCCESS);

        $this->assertFalse((bool) $user->fresh()->is_platform_admin);
    }
}
