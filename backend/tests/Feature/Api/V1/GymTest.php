<?php

namespace Tests\Feature\Api\V1;

use App\Models\Branch;
use App\Models\Gym;
use App\Models\GymAssignment;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class GymTest extends TestCase
{
    use RefreshDatabase;

    public function test_index_is_public_and_returns_ok_without_a_token(): void
    {
        Gym::create(['name' => 'Gym One']);

        $response = $this->getJson('/api/v1/gyms');

        $response->assertOk();
    }

    public function test_index_returns_gyms_with_nested_branches_in_the_expected_shape(): void
    {
        $gym = Gym::create(['name' => 'Gym One']);
        $branch = Branch::create(['gym_id' => $gym->id, 'name' => 'Main Branch']);

        $response = $this->getJson('/api/v1/gyms');

        $response->assertOk();
        $gyms = $response->json('gyms');

        $this->assertCount(1, $gyms);
        $this->assertSame(['id', 'name', 'branches'], array_keys($gyms[0]));
        $this->assertSame($gym->id, $gyms[0]['id']);
        $this->assertSame('Gym One', $gyms[0]['name']);

        $this->assertCount(1, $gyms[0]['branches']);
        $this->assertSame(['id', 'name'], array_keys($gyms[0]['branches'][0]));
        $this->assertSame($branch->id, $gyms[0]['branches'][0]['id']);
        $this->assertSame('Main Branch', $gyms[0]['branches'][0]['name']);

        // No timestamps or the redundant gym_id should leak into the nested branch.
        $this->assertArrayNotHasKey('gym_id', $gyms[0]['branches'][0]);
        $this->assertArrayNotHasKey('created_at', $gyms[0]['branches'][0]);
        $this->assertArrayNotHasKey('updated_at', $gyms[0]['branches'][0]);
    }

    public function test_a_gym_without_branches_returns_an_empty_branches_array(): void
    {
        Gym::create(['name' => 'Gym Without Branches']);

        $response = $this->getJson('/api/v1/gyms');

        $response->assertOk();
        $gyms = $response->json('gyms');

        $this->assertCount(1, $gyms);
        $this->assertSame([], $gyms[0]['branches']);
    }

    public function test_index_returns_an_empty_list_when_there_are_no_gyms(): void
    {
        $response = $this->getJson('/api/v1/gyms');

        $response->assertOk();
        $response->assertExactJson(['gyms' => []]);
    }

    public function test_branches_are_not_mixed_between_gyms(): void
    {
        $gymA = Gym::create(['name' => 'Gym A']);
        $gymB = Gym::create(['name' => 'Gym B']);
        $branchA = Branch::create(['gym_id' => $gymA->id, 'name' => 'Branch A']);
        $branchB = Branch::create(['gym_id' => $gymB->id, 'name' => 'Branch B']);

        $response = $this->getJson('/api/v1/gyms');

        $response->assertOk();
        $gyms = collect($response->json('gyms'))->keyBy('id');

        $this->assertSame([$branchA->id], collect($gyms[$gymA->id]['branches'])->pluck('id')->all());
        $this->assertSame([$branchB->id], collect($gyms[$gymB->id]['branches'])->pluck('id')->all());
    }

    public function test_index_does_not_expose_any_gym_assignment_data(): void
    {
        $user = User::factory()->create();
        $gym = Gym::create(['name' => 'Gym One']);
        $branch = Branch::create(['gym_id' => $gym->id, 'name' => 'Main Branch']);
        GymAssignment::create([
            'user_id' => $user->id,
            'gym_id' => $gym->id,
            'branch_id' => $branch->id,
            'role' => GymAssignment::ROLE_MEMBER,
            'status' => GymAssignment::STATUS_ACTIVE,
        ]);

        $response = $this->getJson('/api/v1/gyms');

        $response->assertOk();
        $body = $response->json();

        $this->assertArrayNotHasKey('gym_assignments', $body);
        $this->assertArrayNotHasKey('gymAssignments', $body['gyms'][0]);
        $this->assertArrayNotHasKey('role', $body['gyms'][0]);
        $this->assertArrayNotHasKey('status', $body['gyms'][0]);
        $this->assertArrayNotHasKey('user_id', $body['gyms'][0]);
        $this->assertSame(['id', 'name', 'branches'], array_keys($body['gyms'][0]));
        $this->assertSame(['id', 'name'], array_keys($body['gyms'][0]['branches'][0]));
    }

    public function test_index_returns_gyms_ordered_alphabetically_by_name(): void
    {
        Gym::create(['name' => 'Zeta Gym']);
        Gym::create(['name' => 'Alpha Gym']);
        Gym::create(['name' => 'Mid Gym']);

        $response = $this->getJson('/api/v1/gyms');

        $response->assertOk();
        $names = array_column($response->json('gyms'), 'name');

        $this->assertSame(['Alpha Gym', 'Mid Gym', 'Zeta Gym'], $names);
    }
}
