<?php

namespace Tests\Feature;

use App\Models\Exercise;
use App\Models\User;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Production hardening fixes F1–F3 (see docs/PRODUCTION_HARDENING_DISCOVERY.md).
 */
class ProductionHardeningTest extends TestCase
{
    use RefreshDatabase;

    // -----------------------------------------------------------------
    // F1 — baseline API rate limiting
    // -----------------------------------------------------------------

    public function test_the_api_group_carries_a_120_per_minute_rate_limit(): void
    {
        $response = $this->getJson('/api/v1/exercises');

        $response->assertOk();
        $response->assertHeader('X-RateLimit-Limit', 120);
    }

    public function test_the_stricter_auth_throttle_still_governs_login(): void
    {
        // routes/api.php puts throttle:6,1 on register + login; F1's group
        // throttle (120/min) must not loosen that.
        for ($i = 0; $i < 6; $i++) {
            $this->postJson('/api/v1/auth/login', [
                'email' => 'nobody@example.test',
                'password' => 'wrong-password',
            ])->assertStatus(422);
        }

        $this->postJson('/api/v1/auth/login', [
            'email' => 'nobody@example.test',
            'password' => 'wrong-password',
        ])->assertStatus(429);
    }

    // -----------------------------------------------------------------
    // F2 — JSON responses even without an Accept header
    // -----------------------------------------------------------------

    public function test_protected_endpoint_without_token_or_accept_header_returns_401_json_not_a_redirect(): void
    {
        // Plain GET with an HTML Accept header — the shape of a browser hitting
        // the API directly. Before F2 this redirected to the non-existent
        // `login` route and surfaced as a 500.
        $response = $this->get('/api/v1/profile', ['Accept' => 'text/html']);

        $response->assertStatus(401);
        $response->assertHeader('content-type', 'application/json');
        $response->assertJson(['message' => 'Unauthenticated.']);
    }

    public function test_a_not_found_route_without_accept_header_still_renders_json(): void
    {
        $response = $this->get('/api/v1/this-route-does-not-exist', ['Accept' => 'text/html']);

        $response->assertStatus(404);
        $response->assertHeader('content-type', 'application/json');
    }

    // -----------------------------------------------------------------
    // F3 — DatabaseSeeder is production-safe
    // -----------------------------------------------------------------

    public function test_database_seeder_skips_the_test_user_in_production_but_still_seeds_exercises(): void
    {
        $this->app->detectEnvironment(fn () => 'production');
        $this->assertTrue($this->app->environment('production'));

        // --force skips the "run in production?" confirmation prompt.
        $this->artisan('db:seed', ['--class' => DatabaseSeeder::class, '--force' => true])
            ->assertExitCode(0);

        $this->assertDatabaseMissing('users', ['email' => 'test@example.com']);
        $this->assertGreaterThan(0, Exercise::count());
    }

    public function test_database_seeder_still_creates_the_test_user_outside_production(): void
    {
        // The default test environment is `testing`.
        $this->seed(DatabaseSeeder::class);

        $this->assertDatabaseHas('users', ['email' => 'test@example.com']);
        $this->assertGreaterThan(0, Exercise::count());
        $this->assertSame(1, User::where('email', 'test@example.com')->count());
    }

    public function test_non_numeric_route_ids_are_404_never_500(): void
    {
        $user = User::factory()->create();

        foreach ([
            ['get', '/api/v1/me/programs/abc'], ['patch', '/api/v1/me/programs/abc'], ['post', '/api/v1/me/programs/abc/import'],
            ['delete', '/api/v1/me/program-days/abc'], ['get', '/api/v1/me/workouts/abc'], ['delete', '/api/v1/me/exercise-performances/abc'],
            ['post', '/api/v1/me/coach-relationships/abc/accept'], ['delete', '/api/v1/me/gym-assignments/abc'], ['delete', '/api/v1/me/coach/notes/abc'],
            ['get', '/api/v1/me/vouchers/abc'], ['delete', '/api/v1/me/coach/videos/abc'], ['post', '/api/v1/me/duels/abc/accept'],
            ['get', '/api/v1/me/gym/abc/members'], ['get', '/api/v1/me/coach/athletes/abc'],
        ] as [$method, $url]) {
            $this->actingAs($user)->json(strtoupper($method), $url)->assertStatus(404);
        }
    }
}
