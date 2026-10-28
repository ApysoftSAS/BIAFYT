<?php

namespace Tests\Feature\Api\V1;

use App\Models\GymRegistrationRequest;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Gym onboarding — applicant side. A user submits a request to register a
 * gym and can see its status. They never decide the outcome and can never
 * self-assign a role.
 */
class GymRegistrationRequestApiTest extends TestCase
{
    use RefreshDatabase;

    private function payload(array $overrides = []): array
    {
        return array_merge([
            'gym_name' => 'KAIROS GYM',
            'branch_name' => 'Norte',
            'applicant_message' => 'Soy el dueño, tenemos 3 sedes en Bogotá.',
        ], $overrides);
    }

    public function test_store_rejects_unauthenticated_requests(): void
    {
        $this->postJson('/api/v1/me/gym-registration-request', $this->payload())->assertStatus(401);
    }

    public function test_a_user_can_submit_a_gym_registration_request(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user, 'sanctum')
            ->postJson('/api/v1/me/gym-registration-request', $this->payload());

        $response->assertCreated();
        $response->assertJsonPath('gym_registration_request.status', 'pending');
        $response->assertJsonPath('gym_registration_request.gym_name', 'KAIROS GYM');
        $response->assertJsonPath('gym_registration_request.branch_name', 'Norte');
        $response->assertJsonPath('gym_registration_request.gym', null);

        $this->assertDatabaseHas('gym_registration_requests', [
            'user_id' => $user->id,
            'status' => 'pending',
            'gym_name' => 'KAIROS GYM',
        ]);
    }

    public function test_store_validates_the_payload(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user, 'sanctum')
            ->postJson('/api/v1/me/gym-registration-request', ['gym_name' => '', 'branch_name' => ''])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['gym_name', 'branch_name']);
    }

    public function test_a_user_cannot_have_two_pending_requests(): void
    {
        $user = User::factory()->create();

        $this->actingAs($user, 'sanctum')
            ->postJson('/api/v1/me/gym-registration-request', $this->payload())
            ->assertCreated();

        $this->actingAs($user, 'sanctum')
            ->postJson('/api/v1/me/gym-registration-request', $this->payload(['gym_name' => 'OTRO GYM']))
            ->assertStatus(422)
            ->assertJsonValidationErrors(['gym_name']);

        $this->assertSame(1, GymRegistrationRequest::where('user_id', $user->id)->count());
    }

    public function test_a_user_can_submit_again_after_a_rejection(): void
    {
        $user = User::factory()->create();
        GymRegistrationRequest::create([
            'user_id' => $user->id,
            'status' => GymRegistrationRequest::STATUS_REJECTED,
            'gym_name' => 'PRIMER GYM',
            'branch_name' => 'Centro',
            'reviewed_at' => now()->subDay(),
        ]);

        $this->actingAs($user, 'sanctum')
            ->postJson('/api/v1/me/gym-registration-request', $this->payload())
            ->assertCreated();

        $this->assertSame(2, GymRegistrationRequest::where('user_id', $user->id)->count());
    }

    public function test_store_ignores_client_supplied_status_user_id_and_gym_id(): void
    {
        $user = User::factory()->create();
        $other = User::factory()->create();

        $response = $this->actingAs($user, 'sanctum')->postJson('/api/v1/me/gym-registration-request', $this->payload([
            'status' => 'approved',
            'user_id' => $other->id,
            'gym_id' => 999,
            'reviewed_by_user_id' => $other->id,
        ]));

        $response->assertCreated();
        $response->assertJsonPath('gym_registration_request.status', 'pending');
        $this->assertDatabaseHas('gym_registration_requests', [
            'user_id' => $user->id,
            'status' => 'pending',
            'gym_id' => null,
        ]);
        $this->assertDatabaseMissing('gym_registration_requests', ['user_id' => $other->id]);
    }

    public function test_index_returns_only_the_callers_requests_newest_first(): void
    {
        $user = User::factory()->create();
        $other = User::factory()->create();

        GymRegistrationRequest::create(['user_id' => $user->id, 'status' => 'rejected', 'gym_name' => 'A', 'branch_name' => 'a', 'reviewed_at' => now()->subDays(2)]);
        $newer = GymRegistrationRequest::create(['user_id' => $user->id, 'status' => 'pending', 'gym_name' => 'B', 'branch_name' => 'b']);
        GymRegistrationRequest::create(['user_id' => $other->id, 'status' => 'pending', 'gym_name' => 'C', 'branch_name' => 'c']);

        $response = $this->actingAs($user, 'sanctum')->getJson('/api/v1/me/gym-registration-request');

        $response->assertOk();
        $response->assertJsonCount(2, 'gym_registration_requests');
        $response->assertJsonPath('gym_registration_requests.0.id', $newer->id);
    }

    public function test_index_never_exposes_user_id_or_reviewer_identity(): void
    {
        $user = User::factory()->create();
        $reviewer = User::factory()->create();
        GymRegistrationRequest::create([
            'user_id' => $user->id,
            'status' => 'rejected',
            'gym_name' => 'A',
            'branch_name' => 'a',
            'review_note' => 'Datos insuficientes',
            'reviewed_by_user_id' => $reviewer->id,
            'reviewed_at' => now(),
        ]);

        $response = $this->actingAs($user, 'sanctum')->getJson('/api/v1/me/gym-registration-request');

        $response->assertOk();
        $row = $response->json('gym_registration_requests.0');
        $this->assertSame(
            ['id', 'status', 'gym_name', 'branch_name', 'applicant_message', 'review_note', 'reviewed_at', 'gym', 'created_at'],
            array_keys($row),
        );
        $this->assertSame('Datos insuficientes', $row['review_note']);
    }
}
