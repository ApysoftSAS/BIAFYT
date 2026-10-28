<?php

namespace Tests\Feature\Api\V1;

use App\Models\Profile;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ProfileTest extends TestCase
{
    use RefreshDatabase;

    public function test_get_profile_returns_null_when_none_exists(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user, 'sanctum')->getJson('/api/v1/profile');

        $response->assertOk();
        $response->assertExactJson(['profile' => null]);
    }

    public function test_patch_profile_creates_a_new_profile(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user, 'sanctum')->patchJson('/api/v1/profile', [
            'age' => 25,
            'weight' => 70.5,
            'height' => 175.5,
            'months_training' => 12,
            'level' => 'Principiante',
            'focus_id' => 'strength',
        ]);

        $response->assertOk();
        $response->assertJsonPath('profile.age', 25);
        $response->assertJsonPath('profile.level', 'Principiante');

        $this->assertDatabaseHas('profiles', [
            'user_id' => $user->id,
            'age' => 25,
            'months_training' => 12,
            'level' => 'Principiante',
            'focus_id' => 'strength',
        ]);
        $this->assertSame(1, $user->fresh()->profile()->count());
    }

    public function test_second_patch_partially_updates_without_duplicating(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user, 'sanctum')->patchJson('/api/v1/profile', [
            'age' => 25,
            'weight' => 70.5,
            'level' => 'Principiante',
        ])->assertOk();

        $response = $this->actingAs($user, 'sanctum')->patchJson('/api/v1/profile', [
            'age' => 26,
        ]);

        $response->assertOk();
        $response->assertJsonPath('profile.age', 26);
        // weight was not sent in the second PATCH, so it must be preserved.
        $response->assertJsonPath('profile.weight', '70.50');
        // level was not sent either, so it must also be preserved.
        $response->assertJsonPath('profile.level', 'Principiante');

        $this->assertSame(1, Profile::where('user_id', $user->id)->count());
    }

    public function test_patch_profile_rejects_invalid_values(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user, 'sanctum')->patchJson('/api/v1/profile', [
            'age' => 11,
            'weight' => 401,
            'height' => 99,
            'months_training' => -1,
            'level' => str_repeat('a', 51),
            'focus_id' => str_repeat('b', 51),
        ]);

        $response->assertStatus(422);
        $response->assertJsonValidationErrors([
            'age',
            'weight',
            'height',
            'months_training',
            'level',
            'focus_id',
        ]);
    }

    public function test_get_profile_rejects_unauthenticated_requests(): void
    {
        $response = $this->getJson('/api/v1/profile');

        $response->assertStatus(401);
    }

    public function test_patch_profile_rejects_unauthenticated_requests(): void
    {
        $response = $this->patchJson('/api/v1/profile', ['age' => 25]);

        $response->assertStatus(401);
    }

    public function test_a_user_cannot_see_another_users_profile(): void
    {
        $userA = User::factory()->create();
        $userB = User::factory()->create();

        $this->actingAs($userA, 'sanctum')->patchJson('/api/v1/profile', [
            'age' => 40,
            'level' => 'Avanzado',
        ])->assertOk();

        $response = $this->actingAs($userB, 'sanctum')->getJson('/api/v1/profile');

        $response->assertOk();
        $response->assertExactJson(['profile' => null]);
    }

    public function test_me_still_works_as_before_and_does_not_include_profile(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user, 'sanctum')->getJson('/api/v1/auth/me');

        $response->assertOk();
        $response->assertJson(['user' => ['id' => $user->id, 'email' => $user->email]]);
        $response->assertJsonMissingPath('user.password');
        $response->assertJsonMissingPath('user.profile');
    }

    public function test_explicit_null_clears_a_field_while_omitted_fields_are_preserved(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user, 'sanctum')->patchJson('/api/v1/profile', [
            'age' => 25,
            'weight' => 80,
            'level' => 'Principiante',
        ])->assertOk();

        $response = $this->actingAs($user, 'sanctum')->patchJson('/api/v1/profile', [
            'weight' => null,
        ]);

        $response->assertOk();
        $response->assertJsonPath('profile.weight', null);
        // age and level were omitted from the second PATCH, so they must be preserved.
        $response->assertJsonPath('profile.age', 25);
        $response->assertJsonPath('profile.level', 'Principiante');

        $this->assertDatabaseHas('profiles', [
            'user_id' => $user->id,
            'weight' => null,
            'age' => 25,
            'level' => 'Principiante',
        ]);
        $this->assertSame(1, Profile::where('user_id', $user->id)->count());
    }

    public function test_age_accepts_the_boundary_values_of_its_valid_range(): void
    {
        $user = User::factory()->create();

        $lower = $this->actingAs($user, 'sanctum')->patchJson('/api/v1/profile', ['age' => 12]);
        $lower->assertOk();
        $lower->assertJsonPath('profile.age', 12);

        $upper = $this->actingAs($user, 'sanctum')->patchJson('/api/v1/profile', ['age' => 100]);
        $upper->assertOk();
        $upper->assertJsonPath('profile.age', 100);
    }

    public function test_patch_profile_rejects_non_numeric_values_for_numeric_fields(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user, 'sanctum')->patchJson('/api/v1/profile', [
            'age' => 'abc',
        ]);

        $response->assertStatus(422);
        $response->assertJsonValidationErrors(['age']);
    }

    public function test_patch_by_one_user_never_touches_another_users_profile(): void
    {
        $userA = User::factory()->create();
        $userB = User::factory()->create();

        $this->actingAs($userA, 'sanctum')->patchJson('/api/v1/profile', [
            'age' => 40,
            'level' => 'Avanzado',
        ])->assertOk();

        $this->actingAs($userB, 'sanctum')->patchJson('/api/v1/profile', [
            'age' => 20,
            'level' => 'Principiante',
        ])->assertOk();

        $this->actingAs($userA, 'sanctum')->patchJson('/api/v1/profile', [
            'age' => 99,
            'level' => 'Intermedio',
            'weight' => 65,
        ])->assertOk();

        // User B's profile must remain exactly as it was before A's PATCH.
        $this->assertDatabaseHas('profiles', [
            'user_id' => $userB->id,
            'age' => 20,
            'level' => 'Principiante',
            'weight' => null,
        ]);
        $this->assertSame(1, Profile::where('user_id', $userB->id)->count());
    }

    public function test_patch_profile_ignores_a_user_id_in_the_payload(): void
    {
        $user = User::factory()->create();
        $otherUser = User::factory()->create();

        $response = $this->actingAs($user, 'sanctum')->patchJson('/api/v1/profile', [
            'user_id' => $otherUser->id,
            'age' => 30,
        ]);

        $response->assertOk();
        $response->assertJsonPath('profile.age', 30);

        $this->assertDatabaseHas('profiles', [
            'user_id' => $user->id,
            'age' => 30,
        ]);
        $this->assertDatabaseMissing('profiles', [
            'user_id' => $otherUser->id,
        ]);
    }
}
