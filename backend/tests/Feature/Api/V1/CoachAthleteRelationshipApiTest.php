<?php

namespace Tests\Feature\Api\V1;

use App\Models\CoachAthleteRelationship;
use App\Models\Gym;
use App\Models\GymAssignment;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class CoachAthleteRelationshipApiTest extends TestCase
{
    use RefreshDatabase;

    private function makeCoach(): User
    {
        $coach = User::factory()->create();
        $gym = Gym::create(['name' => 'Gym One']);
        GymAssignment::create([
            'user_id' => $coach->id,
            'gym_id' => $gym->id,
            'branch_id' => null,
            'role' => GymAssignment::ROLE_COACH,
            'status' => GymAssignment::STATUS_ACTIVE,
        ]);

        return $coach;
    }

    // -----------------------------------------------------------------
    // store()
    // -----------------------------------------------------------------

    public function test_store_rejects_unauthenticated_requests(): void
    {
        $athlete = User::factory()->create();

        $response = $this->postJson('/api/v1/me/coach-relationships', ['athlete_user_id' => $athlete->id]);

        $response->assertStatus(401);
    }

    public function test_store_rejects_a_user_without_active_coach_assignment(): void
    {
        $user = User::factory()->create();
        $athlete = User::factory()->create();

        $response = $this->actingAs($user, 'sanctum')->postJson('/api/v1/me/coach-relationships', [
            'athlete_user_id' => $athlete->id,
        ]);

        $response->assertStatus(422);
        $this->assertSame(0, CoachAthleteRelationship::count());
    }

    public function test_store_allows_a_valid_active_coach_to_request(): void
    {
        $coach = $this->makeCoach();
        $athlete = User::factory()->create();

        $response = $this->actingAs($coach, 'sanctum')->postJson('/api/v1/me/coach-relationships', [
            'athlete_user_id' => $athlete->id,
        ]);

        $response->assertCreated();
        $response->assertJsonPath('coach_relationship.status', 'pending');
        $response->assertJsonPath('coach_relationship.coach.id', $coach->id);
        $response->assertJsonPath('coach_relationship.athlete.id', $athlete->id);
        $response->assertJsonPath('coach_relationship.viewer_role', 'coach');

        $this->assertDatabaseHas('coach_athlete_relationships', [
            'coach_user_id' => $coach->id,
            'athlete_user_id' => $athlete->id,
            'status' => 'pending',
        ]);
    }

    public function test_store_rejects_self_request(): void
    {
        $coach = $this->makeCoach();

        $response = $this->actingAs($coach, 'sanctum')->postJson('/api/v1/me/coach-relationships', [
            'athlete_user_id' => $coach->id,
        ]);

        $response->assertStatus(422);
        $this->assertSame(0, CoachAthleteRelationship::count());
    }

    public function test_store_rejects_duplicate_while_pending_relationship_stands(): void
    {
        $coach = $this->makeCoach();
        $athlete = User::factory()->create();

        $this->actingAs($coach, 'sanctum')->postJson('/api/v1/me/coach-relationships', [
            'athlete_user_id' => $athlete->id,
        ])->assertCreated();

        $response = $this->actingAs($coach, 'sanctum')->postJson('/api/v1/me/coach-relationships', [
            'athlete_user_id' => $athlete->id,
        ]);

        $response->assertStatus(422);
        $this->assertSame(1, CoachAthleteRelationship::where('coach_user_id', $coach->id)
            ->where('athlete_user_id', $athlete->id)
            ->count());
    }

    public function test_store_rejects_duplicate_while_active_relationship_stands(): void
    {
        $coach = $this->makeCoach();
        $athlete = User::factory()->create();
        CoachAthleteRelationship::create([
            'coach_user_id' => $coach->id,
            'athlete_user_id' => $athlete->id,
            'status' => CoachAthleteRelationship::STATUS_ACTIVE,
            'requested_at' => now(),
            'activated_at' => now(),
        ]);

        $response = $this->actingAs($coach, 'sanctum')->postJson('/api/v1/me/coach-relationships', [
            'athlete_user_id' => $athlete->id,
        ]);

        $response->assertStatus(422);
        $this->assertSame(1, CoachAthleteRelationship::count());
    }

    public function test_store_allows_a_new_request_after_the_previous_one_was_revoked(): void
    {
        $coach = $this->makeCoach();
        $athlete = User::factory()->create();
        CoachAthleteRelationship::create([
            'coach_user_id' => $coach->id,
            'athlete_user_id' => $athlete->id,
            'status' => CoachAthleteRelationship::STATUS_REVOKED,
            'requested_at' => now()->subDays(5),
            'activated_at' => now()->subDays(4),
            'revoked_at' => now()->subDay(),
        ]);

        $response = $this->actingAs($coach, 'sanctum')->postJson('/api/v1/me/coach-relationships', [
            'athlete_user_id' => $athlete->id,
        ]);

        $response->assertCreated();
        $this->assertSame(2, CoachAthleteRelationship::where('coach_user_id', $coach->id)
            ->where('athlete_user_id', $athlete->id)
            ->count());
    }

    public function test_store_rejects_nonexistent_athlete(): void
    {
        $coach = $this->makeCoach();

        $response = $this->actingAs($coach, 'sanctum')->postJson('/api/v1/me/coach-relationships', [
            'athlete_user_id' => 999999,
        ]);

        $response->assertStatus(422);
        $response->assertJsonValidationErrors(['athlete_user_id']);
    }

    // -----------------------------------------------------------------
    // index()
    // -----------------------------------------------------------------

    public function test_index_rejects_unauthenticated_requests(): void
    {
        $response = $this->getJson('/api/v1/me/coach-relationships');

        $response->assertStatus(401);
    }

    public function test_athlete_can_see_a_relationship_requested_by_a_coach(): void
    {
        $coach = $this->makeCoach();
        $athlete = User::factory()->create();
        $relationship = CoachAthleteRelationship::create([
            'coach_user_id' => $coach->id,
            'athlete_user_id' => $athlete->id,
            'status' => CoachAthleteRelationship::STATUS_PENDING,
            'requested_at' => now(),
        ]);

        $response = $this->actingAs($athlete, 'sanctum')->getJson('/api/v1/me/coach-relationships');

        $response->assertOk();
        $response->assertJsonCount(1, 'coach_relationships');
        $response->assertJsonPath('coach_relationships.0.id', $relationship->id);
        $response->assertJsonPath('coach_relationships.0.viewer_role', 'athlete');
    }

    public function test_index_lists_relationships_from_both_sides(): void
    {
        $coach = $this->makeCoach();
        $athleteOfCoach = User::factory()->create();
        CoachAthleteRelationship::create([
            'coach_user_id' => $coach->id,
            'athlete_user_id' => $athleteOfCoach->id,
            'status' => CoachAthleteRelationship::STATUS_PENDING,
            'requested_at' => now(),
        ]);

        $otherCoach = $this->makeCoach();
        CoachAthleteRelationship::create([
            'coach_user_id' => $otherCoach->id,
            'athlete_user_id' => $coach->id,
            'status' => CoachAthleteRelationship::STATUS_PENDING,
            'requested_at' => now(),
        ]);

        $response = $this->actingAs($coach, 'sanctum')->getJson('/api/v1/me/coach-relationships');

        $response->assertOk();
        $response->assertJsonCount(2, 'coach_relationships');
        $roles = collect($response->json('coach_relationships'))->pluck('viewer_role')->sort()->values()->all();
        $this->assertSame(['athlete', 'coach'], $roles);
    }

    public function test_index_does_not_leak_relationships_of_unrelated_users(): void
    {
        $coach = $this->makeCoach();
        $athlete = User::factory()->create();
        CoachAthleteRelationship::create([
            'coach_user_id' => $coach->id,
            'athlete_user_id' => $athlete->id,
            'status' => CoachAthleteRelationship::STATUS_PENDING,
            'requested_at' => now(),
        ]);

        $outsider = User::factory()->create();

        $response = $this->actingAs($outsider, 'sanctum')->getJson('/api/v1/me/coach-relationships');

        $response->assertOk();
        $response->assertExactJson(['coach_relationships' => []]);
    }

    // -----------------------------------------------------------------
    // accept()
    // -----------------------------------------------------------------

    public function test_accept_rejects_unauthenticated_requests(): void
    {
        $response = $this->postJson('/api/v1/me/coach-relationships/1/accept');

        $response->assertStatus(401);
    }

    public function test_athlete_can_accept_a_pending_relationship(): void
    {
        $coach = $this->makeCoach();
        $athlete = User::factory()->create();
        $relationship = CoachAthleteRelationship::create([
            'coach_user_id' => $coach->id,
            'athlete_user_id' => $athlete->id,
            'status' => CoachAthleteRelationship::STATUS_PENDING,
            'requested_at' => now(),
        ]);

        $response = $this->actingAs($athlete, 'sanctum')->postJson("/api/v1/me/coach-relationships/{$relationship->id}/accept");

        $response->assertOk();
        $response->assertJsonPath('coach_relationship.status', 'active');
        $this->assertDatabaseHas('coach_athlete_relationships', [
            'id' => $relationship->id,
            'status' => 'active',
        ]);
        $this->assertNotNull($relationship->fresh()->activated_at);
    }

    public function test_coach_cannot_accept_their_own_request(): void
    {
        $coach = $this->makeCoach();
        $athlete = User::factory()->create();
        $relationship = CoachAthleteRelationship::create([
            'coach_user_id' => $coach->id,
            'athlete_user_id' => $athlete->id,
            'status' => CoachAthleteRelationship::STATUS_PENDING,
            'requested_at' => now(),
        ]);

        $response = $this->actingAs($coach, 'sanctum')->postJson("/api/v1/me/coach-relationships/{$relationship->id}/accept");

        $response->assertStatus(404);
        $this->assertDatabaseHas('coach_athlete_relationships', [
            'id' => $relationship->id,
            'status' => 'pending',
        ]);
    }

    public function test_an_unrelated_user_cannot_accept(): void
    {
        $coach = $this->makeCoach();
        $athlete = User::factory()->create();
        $relationship = CoachAthleteRelationship::create([
            'coach_user_id' => $coach->id,
            'athlete_user_id' => $athlete->id,
            'status' => CoachAthleteRelationship::STATUS_PENDING,
            'requested_at' => now(),
        ]);

        $outsider = User::factory()->create();

        $response = $this->actingAs($outsider, 'sanctum')->postJson("/api/v1/me/coach-relationships/{$relationship->id}/accept");

        $response->assertStatus(404);
    }

    public function test_accept_of_an_already_active_relationship_returns_422(): void
    {
        $coach = $this->makeCoach();
        $athlete = User::factory()->create();
        $relationship = CoachAthleteRelationship::create([
            'coach_user_id' => $coach->id,
            'athlete_user_id' => $athlete->id,
            'status' => CoachAthleteRelationship::STATUS_ACTIVE,
            'requested_at' => now(),
            'activated_at' => now(),
        ]);

        $response = $this->actingAs($athlete, 'sanctum')->postJson("/api/v1/me/coach-relationships/{$relationship->id}/accept");

        $response->assertStatus(422);
    }

    // -----------------------------------------------------------------
    // destroy()
    // -----------------------------------------------------------------

    public function test_destroy_rejects_unauthenticated_requests(): void
    {
        $response = $this->deleteJson('/api/v1/me/coach-relationships/1');

        $response->assertStatus(401);
    }

    public function test_coach_can_cancel_their_own_pending_request(): void
    {
        $coach = $this->makeCoach();
        $athlete = User::factory()->create();
        $relationship = CoachAthleteRelationship::create([
            'coach_user_id' => $coach->id,
            'athlete_user_id' => $athlete->id,
            'status' => CoachAthleteRelationship::STATUS_PENDING,
            'requested_at' => now(),
        ]);

        $response = $this->actingAs($coach, 'sanctum')->deleteJson("/api/v1/me/coach-relationships/{$relationship->id}");

        $response->assertStatus(204);
        $this->assertDatabaseHas('coach_athlete_relationships', [
            'id' => $relationship->id,
            'status' => 'revoked',
        ]);
    }

    public function test_athlete_can_reject_a_pending_request(): void
    {
        $coach = $this->makeCoach();
        $athlete = User::factory()->create();
        $relationship = CoachAthleteRelationship::create([
            'coach_user_id' => $coach->id,
            'athlete_user_id' => $athlete->id,
            'status' => CoachAthleteRelationship::STATUS_PENDING,
            'requested_at' => now(),
        ]);

        $response = $this->actingAs($athlete, 'sanctum')->deleteJson("/api/v1/me/coach-relationships/{$relationship->id}");

        $response->assertStatus(204);
        $this->assertDatabaseHas('coach_athlete_relationships', [
            'id' => $relationship->id,
            'status' => 'revoked',
        ]);
    }

    public function test_athlete_can_revoke_an_active_relationship(): void
    {
        $coach = $this->makeCoach();
        $athlete = User::factory()->create();
        $relationship = CoachAthleteRelationship::create([
            'coach_user_id' => $coach->id,
            'athlete_user_id' => $athlete->id,
            'status' => CoachAthleteRelationship::STATUS_ACTIVE,
            'requested_at' => now()->subDay(),
            'activated_at' => now()->subDay(),
        ]);

        $response = $this->actingAs($athlete, 'sanctum')->deleteJson("/api/v1/me/coach-relationships/{$relationship->id}");

        $response->assertStatus(204);
        $fresh = $relationship->fresh();
        $this->assertSame('revoked', $fresh->status);
        $this->assertNotNull($fresh->revoked_at);
    }

    public function test_coach_cannot_revoke_an_active_relationship(): void
    {
        $coach = $this->makeCoach();
        $athlete = User::factory()->create();
        $relationship = CoachAthleteRelationship::create([
            'coach_user_id' => $coach->id,
            'athlete_user_id' => $athlete->id,
            'status' => CoachAthleteRelationship::STATUS_ACTIVE,
            'requested_at' => now()->subDay(),
            'activated_at' => now()->subDay(),
        ]);

        $response = $this->actingAs($coach, 'sanctum')->deleteJson("/api/v1/me/coach-relationships/{$relationship->id}");

        $response->assertStatus(422);
        $this->assertDatabaseHas('coach_athlete_relationships', [
            'id' => $relationship->id,
            'status' => 'active',
        ]);
    }

    public function test_an_unrelated_user_cannot_revoke_returns_404(): void
    {
        $coach = $this->makeCoach();
        $athlete = User::factory()->create();
        $relationship = CoachAthleteRelationship::create([
            'coach_user_id' => $coach->id,
            'athlete_user_id' => $athlete->id,
            'status' => CoachAthleteRelationship::STATUS_ACTIVE,
            'requested_at' => now()->subDay(),
            'activated_at' => now()->subDay(),
        ]);

        $outsider = User::factory()->create();

        $response = $this->actingAs($outsider, 'sanctum')->deleteJson("/api/v1/me/coach-relationships/{$relationship->id}");

        $response->assertStatus(404);
        $this->assertDatabaseHas('coach_athlete_relationships', [
            'id' => $relationship->id,
            'status' => 'active',
        ]);
    }

    public function test_destroy_of_nonexistent_relationship_returns_404(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user, 'sanctum')->deleteJson('/api/v1/me/coach-relationships/999999');

        $response->assertStatus(404);
    }

    public function test_revoking_an_already_revoked_relationship_returns_422(): void
    {
        $coach = $this->makeCoach();
        $athlete = User::factory()->create();
        $relationship = CoachAthleteRelationship::create([
            'coach_user_id' => $coach->id,
            'athlete_user_id' => $athlete->id,
            'status' => CoachAthleteRelationship::STATUS_REVOKED,
            'requested_at' => now()->subDays(3),
            'activated_at' => now()->subDays(2),
            'revoked_at' => now()->subDay(),
        ]);

        $response = $this->actingAs($athlete, 'sanctum')->deleteJson("/api/v1/me/coach-relationships/{$relationship->id}");

        $response->assertStatus(422);
    }

    // -----------------------------------------------------------------
    // Full lifecycle + scope confirmation
    // -----------------------------------------------------------------

    public function test_full_lifecycle_request_accept_revoke_then_reactivate(): void
    {
        $coach = $this->makeCoach();
        $athlete = User::factory()->create();

        $storeResponse = $this->actingAs($coach, 'sanctum')->postJson('/api/v1/me/coach-relationships', [
            'athlete_user_id' => $athlete->id,
        ]);
        $storeResponse->assertCreated();
        $id = $storeResponse->json('coach_relationship.id');

        $this->actingAs($athlete, 'sanctum')->postJson("/api/v1/me/coach-relationships/{$id}/accept")
            ->assertOk()
            ->assertJsonPath('coach_relationship.status', 'active');

        $firstActivatedAt = CoachAthleteRelationship::find($id)->activated_at;

        $this->actingAs($athlete, 'sanctum')->deleteJson("/api/v1/me/coach-relationships/{$id}")
            ->assertStatus(204);

        $this->assertDatabaseHas('coach_athlete_relationships', ['id' => $id, 'status' => 'revoked']);

        // New request after revocation: a brand new row, not a reactivation
        // of the old one.
        $secondStore = $this->actingAs($coach, 'sanctum')->postJson('/api/v1/me/coach-relationships', [
            'athlete_user_id' => $athlete->id,
        ]);
        $secondStore->assertCreated();
        $secondId = $secondStore->json('coach_relationship.id');

        $this->assertNotSame($id, $secondId);

        $this->actingAs($athlete, 'sanctum')->postJson("/api/v1/me/coach-relationships/{$secondId}/accept")
            ->assertOk();

        $secondActivatedAt = CoachAthleteRelationship::find($secondId)->activated_at;

        // Second-precision timestamps can collide within a fast test run;
        // what matters is that the new row's activated_at is its own value
        // (never equal to the old row's revoked_at) and never earlier than
        // the previous cycle's activation.
        $this->assertTrue($secondActivatedAt->greaterThanOrEqualTo($firstActivatedAt));
        $this->assertSame(2, CoachAthleteRelationship::where('coach_user_id', $coach->id)
            ->where('athlete_user_id', $athlete->id)
            ->count());
    }

    public function test_response_never_exposes_internal_or_unrelated_data(): void
    {
        $coach = $this->makeCoach();
        $athlete = User::factory()->create();
        CoachAthleteRelationship::create([
            'coach_user_id' => $coach->id,
            'athlete_user_id' => $athlete->id,
            'status' => CoachAthleteRelationship::STATUS_PENDING,
            'requested_at' => now(),
        ]);

        $response = $this->actingAs($coach, 'sanctum')->getJson('/api/v1/me/coach-relationships');

        $response->assertOk();
        $relationship = $response->json('coach_relationships.0');

        $this->assertSame(
            ['id', 'status', 'viewer_role', 'coach', 'athlete', 'requested_at', 'activated_at', 'revoked_at'],
            array_keys($relationship)
        );
        $this->assertSame(['id', 'name'], array_keys($relationship['coach']));
        $this->assertSame(['id', 'name'], array_keys($relationship['athlete']));
        $this->assertArrayNotHasKey('email', $relationship['coach']);
        $this->assertArrayNotHasKey('email', $relationship['athlete']);
    }
}
