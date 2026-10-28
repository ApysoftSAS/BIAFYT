<?php

namespace Tests\Feature\Api\V1;

use App\Models\Equipment;
use App\Models\Gym;
use App\Models\GymAssignment;
use App\Models\GymEquipment;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Gym inventory management (slice D-GYM-INVENTORY): only an active
 * gym_admin of the gym in the route may read the annotated catalog and
 * add / toggle / remove inventory rows. Anyone else — plain user, coach,
 * gym_admin of another gym — gets a 404 (never 403), same anti-IDOR
 * posture as the rest of GymAdminController.
 */
class GymEquipmentApiTest extends TestCase
{
    use RefreshDatabase;

    private function admin(Gym $gym): User
    {
        $user = User::factory()->create();
        GymAssignment::create([
            'user_id' => $user->id,
            'gym_id' => $gym->id,
            'branch_id' => null,
            'role' => GymAssignment::ROLE_GYM_ADMIN,
            'status' => GymAssignment::STATUS_ACTIVE,
        ]);

        return $user;
    }

    private function press(): Equipment
    {
        return Equipment::create(['slug' => 'm-press-pecho', 'name' => 'PRESS DE PECHO']);
    }

    // ---------------- gate ----------------

    public function test_requires_auth(): void
    {
        $this->getJson('/api/v1/me/gym/1/equipment')->assertStatus(401);
        $this->putJson('/api/v1/me/gym/1/equipment/1')->assertStatus(401);
        $this->deleteJson('/api/v1/me/gym/1/equipment/1')->assertStatus(401);
    }

    public function test_404_for_a_plain_user(): void
    {
        $gym = Gym::create(['name' => 'KAIROS']);
        $item = $this->press();
        $user = User::factory()->create();

        $this->actingAs($user)->getJson("/api/v1/me/gym/{$gym->id}/equipment")->assertNotFound();
        $this->actingAs($user)->putJson("/api/v1/me/gym/{$gym->id}/equipment/{$item->id}", ['available' => true])->assertNotFound();
    }

    public function test_404_for_gym_admin_of_another_gym(): void
    {
        $a = Gym::create(['name' => 'Gym A']);
        $b = Gym::create(['name' => 'Gym B']);
        $item = $this->press();
        $adminA = $this->admin($a);

        $this->actingAs($adminA)->getJson("/api/v1/me/gym/{$b->id}/equipment")->assertNotFound();
        $this->actingAs($adminA)->putJson("/api/v1/me/gym/{$b->id}/equipment/{$item->id}", ['available' => true])->assertNotFound();
    }

    public function test_inactive_gym_admin_is_404(): void
    {
        $gym = Gym::create(['name' => 'KAIROS']);
        $item = $this->press();
        $user = User::factory()->create();
        GymAssignment::create([
            'user_id' => $user->id, 'gym_id' => $gym->id, 'branch_id' => null,
            'role' => GymAssignment::ROLE_GYM_ADMIN, 'status' => GymAssignment::STATUS_INACTIVE,
        ]);

        $this->actingAs($user)->getJson("/api/v1/me/gym/{$gym->id}/equipment")->assertNotFound();
    }

    // ---------------- read: annotated catalog ----------------

    public function test_admin_sees_whole_catalog_annotated_with_inventory_state(): void
    {
        $gym = $this->admin($gymModel = Gym::create(['name' => 'KAIROS']));
        $press = Equipment::create(['slug' => 'm-press-pecho', 'name' => 'PRESS DE PECHO']);
        $prensa = Equipment::create(['slug' => 'm-prensa', 'name' => 'PRENSA DE PIERNAS']);
        $cinta = Equipment::create(['slug' => 'm-cinta', 'name' => 'CINTA DE CORRER']);

        GymEquipment::create(['gym_id' => $gymModel->id, 'equipment_id' => $press->id, 'available' => true]);
        GymEquipment::create(['gym_id' => $gymModel->id, 'equipment_id' => $prensa->id, 'available' => false]);

        $items = $this->actingAs($gym)->getJson("/api/v1/me/gym/{$gymModel->id}/equipment")
            ->assertOk()->json('equipment');

        $this->assertCount(3, $items);
        $bySlug = collect($items)->keyBy('slug');
        $this->assertSame(['id', 'slug', 'name', 'in_inventory', 'available'], array_keys($items[0]));

        $this->assertTrue($bySlug['m-press-pecho']['in_inventory']);
        $this->assertTrue($bySlug['m-press-pecho']['available']);

        $this->assertTrue($bySlug['m-prensa']['in_inventory']);
        $this->assertFalse($bySlug['m-prensa']['available']);

        $this->assertFalse($bySlug['m-cinta']['in_inventory']);
        $this->assertFalse($bySlug['m-cinta']['available']);
    }

    // ---------------- write ----------------

    public function test_put_adds_an_item_to_inventory_defaulting_to_available(): void
    {
        $gymModel = Gym::create(['name' => 'KAIROS']);
        $admin = $this->admin($gymModel);
        $item = $this->press();

        $this->actingAs($admin)->putJson("/api/v1/me/gym/{$gymModel->id}/equipment/{$item->id}")
            ->assertStatus(201)
            ->assertJsonPath('equipment.in_inventory', true)
            ->assertJsonPath('equipment.available', true);

        $this->assertDatabaseHas('gym_equipment', [
            'gym_id' => $gymModel->id, 'equipment_id' => $item->id, 'available' => true,
        ]);
    }

    public function test_put_can_mark_an_item_unavailable_and_is_idempotent(): void
    {
        $gymModel = Gym::create(['name' => 'KAIROS']);
        $admin = $this->admin($gymModel);
        $item = $this->press();

        $this->actingAs($admin)->putJson("/api/v1/me/gym/{$gymModel->id}/equipment/{$item->id}", ['available' => true])->assertStatus(201);
        $this->actingAs($admin)->putJson("/api/v1/me/gym/{$gymModel->id}/equipment/{$item->id}", ['available' => false])
            ->assertStatus(200)
            ->assertJsonPath('equipment.available', false);

        $this->assertDatabaseCount('gym_equipment', 1);
    }

    public function test_delete_removes_the_inventory_row_only(): void
    {
        $gymModel = Gym::create(['name' => 'KAIROS']);
        $admin = $this->admin($gymModel);
        $item = $this->press();
        GymEquipment::create(['gym_id' => $gymModel->id, 'equipment_id' => $item->id, 'available' => true]);

        $this->actingAs($admin)->deleteJson("/api/v1/me/gym/{$gymModel->id}/equipment/{$item->id}")->assertNoContent();

        $this->assertDatabaseMissing('gym_equipment', ['gym_id' => $gymModel->id, 'equipment_id' => $item->id]);
        $this->assertDatabaseHas('equipment', ['id' => $item->id]);
    }

    public function test_put_unknown_equipment_is_404(): void
    {
        $gymModel = Gym::create(['name' => 'KAIROS']);
        $admin = $this->admin($gymModel);

        $this->actingAs($admin)->putJson("/api/v1/me/gym/{$gymModel->id}/equipment/9999", ['available' => true])->assertNotFound();
    }

    public function test_non_numeric_equipment_segment_is_404_at_router(): void
    {
        $gymModel = Gym::create(['name' => 'KAIROS']);
        $admin = $this->admin($gymModel);

        $this->actingAs($admin)->putJson("/api/v1/me/gym/{$gymModel->id}/equipment/abc", ['available' => true])->assertNotFound();
    }
}
