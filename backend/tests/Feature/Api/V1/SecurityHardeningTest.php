<?php

namespace Tests\Feature\Api\V1;

use App\Models\AuditLog;
use App\Models\Branch;
use App\Models\CheckIn;
use App\Models\Gym;
use App\Models\GymAssignment;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use LogicException;
use Tests\TestCase;

/** SOC 2 / ISO 27001 / ISO 27701: auditoría, bloqueo por cuenta y derechos del titular. */
class SecurityHardeningTest extends TestCase
{
    use RefreshDatabase;

    private function user(string $email = 'ana@example.com'): User
    {
        return User::factory()->create(['email' => $email, 'password' => Hash::make('Password123')]);
    }

    public function test_auth_events_are_audited_without_pii(): void
    {
        $this->postJson('/api/v1/auth/register', ['name' => 'Ana', 'email' => 'reg@example.com', 'password' => 'Password123'])->assertCreated();
        $this->postJson('/api/v1/auth/login', ['email' => 'reg@example.com', 'password' => 'bad'])->assertStatus(422);
        $token = $this->postJson('/api/v1/auth/login', ['email' => 'reg@example.com', 'password' => 'Password123'])->json('token');
        $this->withHeader('Authorization', "Bearer {$token}")->postJson('/api/v1/auth/logout')->assertOk();

        $this->assertEqualsCanonicalizing(
            ['auth.register', 'auth.login_failed', 'auth.login', 'auth.logout'],
            AuditLog::pluck('event')->all()
        );
        $all = json_encode(AuditLog::all()->toArray());
        $this->assertStringNotContainsString('reg@example.com', $all);
        $this->assertStringNotContainsString('Password123', $all);
    }

    public function test_account_locks_after_five_failures_from_any_ip(): void
    {
        $this->user();
        for ($i = 0; $i < 5; $i++) {
            $this->withServerVariables(['REMOTE_ADDR' => "10.0.0.{$i}"])
                ->postJson('/api/v1/auth/login', ['email' => 'ana@example.com', 'password' => 'nope'])->assertStatus(422);
        }
        // Ni siquiera la contraseña correcta entra mientras dura el bloqueo.
        $this->withServerVariables(['REMOTE_ADDR' => '10.0.0.99'])
            ->postJson('/api/v1/auth/login', ['email' => 'ana@example.com', 'password' => 'Password123'])
            ->assertStatus(429)->assertHeader('Retry-After');
        $this->assertDatabaseHas('audit_logs', ['event' => 'auth.login_locked']);

        $this->travel(16)->minutes();
        $this->postJson('/api/v1/auth/login', ['email' => 'ana@example.com', 'password' => 'Password123'])->assertOk();
    }

    public function test_audit_log_is_append_only(): void
    {
        $log = AuditLog::create(['event' => 'x']);
        $this->expectException(LogicException::class);
        $log->update(['event' => 'y']);
    }

    public function test_data_export_contains_only_my_data(): void
    {
        $me = $this->user();
        $other = $this->user('other@example.com');
        CheckIn::create(['user_id' => $me->id, 'check_in_date' => '2026-11-10', 'checked_in_at' => '2026-11-10 10:00:00']);
        CheckIn::create(['user_id' => $other->id, 'check_in_date' => '2026-11-10', 'checked_in_at' => '2026-11-10 10:00:00']);

        $r = $this->actingAs($me, 'sanctum')->getJson('/api/v1/me/data-export')->assertOk();
        $r->assertJsonPath('user.email', 'ana@example.com');
        $this->assertCount(1, $r->json('check_ins'));
        $this->assertStringNotContainsString('other@example.com', $r->getContent());
        $this->assertStringNotContainsString('password', $r->getContent());
        $this->assertDatabaseHas('audit_logs', ['event' => 'account.export', 'user_id' => $me->id]);
    }

    public function test_export_and_delete_require_auth(): void
    {
        $this->getJson('/api/v1/me/data-export')->assertStatus(401);
        $this->deleteJson('/api/v1/me/account')->assertStatus(401);
    }

    public function test_delete_account_requires_the_password_and_erases_everything(): void
    {
        $me = $this->user();
        $gym = Gym::create(['name' => 'G']);
        $branch = Branch::create(['gym_id' => $gym->id, 'name' => 'N']);
        GymAssignment::create(['user_id' => $me->id, 'gym_id' => $gym->id, 'branch_id' => $branch->id, 'role' => 'member', 'status' => 'active']);
        CheckIn::create(['user_id' => $me->id, 'gym_id' => $gym->id, 'check_in_date' => '2026-11-10', 'checked_in_at' => '2026-11-10 10:00:00']);
        $token = $me->createToken('t')->plainTextToken;
        $auth = ['Authorization' => "Bearer {$token}"];

        $this->withHeaders($auth)->deleteJson('/api/v1/me/account', ['password' => 'wrong'])->assertStatus(422);
        $this->assertDatabaseHas('users', ['id' => $me->id]);

        $this->withHeaders($auth)->deleteJson('/api/v1/me/account', ['password' => 'Password123'])->assertOk();
        $this->assertDatabaseMissing('users', ['id' => $me->id]);
        $this->assertDatabaseCount('check_ins', 0);
        $this->assertDatabaseCount('gym_assignments', 0);
        $this->assertDatabaseCount('personal_access_tokens', 0);
        $this->assertDatabaseHas('audit_logs', ['event' => 'account.deleted', 'user_id' => null]);
    }

    public function test_sole_gym_admin_and_platform_admin_cannot_delete_their_account(): void
    {
        $gym = Gym::create(['name' => 'G']);
        $admin = $this->user('admin@example.com');
        GymAssignment::create(['user_id' => $admin->id, 'gym_id' => $gym->id, 'branch_id' => null, 'role' => 'gym_admin', 'status' => 'active']);
        $this->actingAs($admin, 'sanctum')->deleteJson('/api/v1/me/account', ['password' => 'Password123'])
            ->assertStatus(422)->assertJsonValidationErrors('account');

        // Con un segundo administrador activo, sí puede.
        $second = $this->user('second@example.com');
        GymAssignment::create(['user_id' => $second->id, 'gym_id' => $gym->id, 'branch_id' => null, 'role' => 'gym_admin', 'status' => 'active']);
        $this->actingAs($admin, 'sanctum')->deleteJson('/api/v1/me/account', ['password' => 'Password123'])->assertOk();

        $platform = $this->user('plat@example.com');
        $platform->forceFill(['is_platform_admin' => true])->save();
        $this->actingAs($platform, 'sanctum')->deleteJson('/api/v1/me/account', ['password' => 'Password123'])->assertStatus(422);
    }

    public function test_role_grant_and_revoke_are_audited(): void
    {
        $gym = Gym::create(['name' => 'G']);
        $branch = Branch::create(['gym_id' => $gym->id, 'name' => 'N']);
        $admin = $this->user('admin@example.com');
        GymAssignment::create(['user_id' => $admin->id, 'gym_id' => $gym->id, 'branch_id' => null, 'role' => 'gym_admin', 'status' => 'active']);
        $target = $this->user('coach@example.com');

        $id = $this->actingAs($admin, 'sanctum')->postJson("/api/v1/me/gym/{$gym->id}/assignments", ['user_id' => $target->id, 'role' => 'coach', 'branch_id' => $branch->id])
            ->assertCreated()->json('assignment.id');
        $this->deleteJson("/api/v1/me/gym/{$gym->id}/assignments/{$id}")->assertNoContent();

        $this->assertDatabaseHas('audit_logs', ['event' => 'gym.role_granted', 'user_id' => $admin->id]);
        $this->assertDatabaseHas('audit_logs', ['event' => 'gym.role_revoked', 'user_id' => $admin->id]);
    }

    public function test_audit_prune_command_removes_only_old_events(): void
    {
        AuditLog::create(['event' => 'old']);
        $this->travel(400)->days();
        AuditLog::create(['event' => 'new']);

        $this->artisan('audit:prune', ['--days' => 365])->assertSuccessful();
        $this->assertSame(['new'], AuditLog::pluck('event')->all());
    }
}
