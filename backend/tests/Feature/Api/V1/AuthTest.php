<?php

namespace Tests\Feature\Api\V1;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\PersonalAccessToken;
use Tests\TestCase;

class AuthTest extends TestCase
{
    use RefreshDatabase;

    public function test_a_user_can_register(): void
    {
        $response = $this->postJson('/api/v1/auth/register', [
            'name' => 'Jane Doe',
            'email' => 'jane@example.com',
            'password' => 'password123',
        ]);

        $response->assertCreated();
        $response->assertJsonStructure(['user' => ['id', 'name', 'email'], 'token']);
        $response->assertJsonMissingPath('user.password');

        $this->assertDatabaseHas('users', [
            'email' => 'jane@example.com',
        ]);
    }

    public function test_registration_requires_valid_input(): void
    {
        $response = $this->postJson('/api/v1/auth/register', [
            'name' => '',
            'email' => 'not-an-email',
            'password' => 'short',
        ]);

        $response->assertStatus(422);
        $response->assertJsonValidationErrors(['name', 'email', 'password']);
    }

    public function test_registration_rejects_duplicate_email(): void
    {
        User::factory()->create(['email' => 'jane@example.com']);

        $response = $this->postJson('/api/v1/auth/register', [
            'name' => 'Jane Doe',
            'email' => 'jane@example.com',
            'password' => 'password123',
        ]);

        $response->assertStatus(422);
        $response->assertJsonValidationErrors(['email']);
    }

    public function test_a_user_can_login_with_correct_credentials(): void
    {
        User::factory()->create([
            'email' => 'jane@example.com',
            'password' => Hash::make('password123'),
        ]);

        $response = $this->postJson('/api/v1/auth/login', [
            'email' => 'jane@example.com',
            'password' => 'password123',
        ]);

        $response->assertOk();
        $response->assertJsonStructure(['user' => ['id', 'name', 'email'], 'token']);
        $response->assertJsonMissingPath('user.password');
    }

    public function test_login_fails_with_incorrect_credentials(): void
    {
        User::factory()->create([
            'email' => 'jane@example.com',
            'password' => Hash::make('password123'),
        ]);

        $response = $this->postJson('/api/v1/auth/login', [
            'email' => 'jane@example.com',
            'password' => 'wrong-password',
        ]);

        $response->assertStatus(422);
        $response->assertJsonValidationErrors(['email']);
    }

    public function test_authenticated_user_can_fetch_their_profile(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user, 'sanctum')->getJson('/api/v1/auth/me');

        $response->assertOk();
        $response->assertJson(['user' => ['id' => $user->id, 'email' => $user->email]]);
        $response->assertJsonMissingPath('user.password');
    }

    public function test_me_rejects_unauthenticated_requests(): void
    {
        $response = $this->getJson('/api/v1/auth/me');

        $response->assertStatus(401);
    }

    public function test_logout_revokes_the_current_token(): void
    {
        $user = User::factory()->create();
        $token = $user->createToken('auth_token')->plainTextToken;

        $response = $this->withHeader('Authorization', "Bearer {$token}")
            ->postJson('/api/v1/auth/logout');

        $response->assertOk();

        $tokenId = (int) explode('|', $token)[0];
        $this->assertNull(PersonalAccessToken::find($tokenId));

        // The auth guard resolved during the request above caches the
        // authenticated user on the guard instance, which otherwise
        // persists across sequential calls within the same test process.
        // Forget it so the next call re-resolves the (now revoked) token.
        $this->app['auth']->forgetGuards();

        $followUp = $this->withHeader('Authorization', "Bearer {$token}")
            ->getJson('/api/v1/auth/me');

        $followUp->assertStatus(401);
    }

    public function test_logout_only_revokes_the_current_token_not_other_sessions(): void
    {
        $user = User::factory()->create();
        $tokenA = $user->createToken('device_a')->plainTextToken;
        $tokenB = $user->createToken('device_b')->plainTextToken;

        $response = $this->withHeader('Authorization', "Bearer {$tokenA}")
            ->postJson('/api/v1/auth/logout');

        $response->assertOk();

        // The auth guard resolved during the request above caches the
        // authenticated user on the guard instance, which otherwise
        // persists across sequential calls within the same test process.
        // Forget it so the next calls re-resolve their tokens.
        $this->app['auth']->forgetGuards();

        $followUpA = $this->withHeader('Authorization', "Bearer {$tokenA}")
            ->getJson('/api/v1/auth/me');
        $followUpA->assertStatus(401);

        $this->app['auth']->forgetGuards();

        $followUpB = $this->withHeader('Authorization', "Bearer {$tokenB}")
            ->getJson('/api/v1/auth/me');
        $followUpB->assertOk();
    }

    public function test_logout_rejects_unauthenticated_requests(): void
    {
        $response = $this->postJson('/api/v1/auth/logout');

        $response->assertStatus(401);
    }

    public function test_full_register_login_me_logout_flow(): void
    {
        $register = $this->postJson('/api/v1/auth/register', [
            'name' => 'Flow User',
            'email' => 'flow@example.com',
            'password' => 'password123',
        ]);
        $register->assertCreated();

        $login = $this->postJson('/api/v1/auth/login', [
            'email' => 'flow@example.com',
            'password' => 'password123',
        ]);
        $login->assertOk();
        $token = $login->json('token');

        $me = $this->withHeader('Authorization', "Bearer {$token}")->getJson('/api/v1/auth/me');
        $me->assertOk();
        $me->assertJson(['user' => ['email' => 'flow@example.com']]);

        $logout = $this->withHeader('Authorization', "Bearer {$token}")->postJson('/api/v1/auth/logout');
        $logout->assertOk();

        $this->app['auth']->forgetGuards();

        $meAfterLogout = $this->withHeader('Authorization', "Bearer {$token}")->getJson('/api/v1/auth/me');
        $meAfterLogout->assertStatus(401);
    }
}
