<?php

namespace Tests\Feature\Api\V1\Admin;

use App\Models\Equipment;
use App\Models\Gym;
use App\Models\GymAssignment;
use App\Models\GymEquipment;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * BIAFYT Admin side of the GLOBAL equipment catalog. Gated by
 * `User::is_platform_admin` (404 for anyone else). This is the ONLY place
 * `equipment` is written; a gym_admin can never reach it.
 */
class EquipmentCatalogApiTest extends TestCase
{
    use RefreshDatabase;

    private function platformAdmin(): User
    {
        $user = User::factory()->create();
        $user->forceFill(['is_platform_admin' => true])->save();

        return $user;
    }

    // ---------------- gate ----------------

    public function test_requires_auth(): void
    {
        $this->getJson('/api/v1/admin/equipment')->assertStatus(401);
    }

    public function test_non_admin_gets_404_everywhere(): void
    {
        $user = User::factory()->create();
        $item = Equipment::create(['slug' => 'm-prensa', 'name' => 'Prensa']);

        $this->actingAs($user)->getJson('/api/v1/admin/equipment')->assertNotFound();
        $this->actingAs($user)->postJson('/api/v1/admin/equipment', ['name' => 'X'])->assertNotFound();
        $this->actingAs($user)->getJson("/api/v1/admin/equipment/{$item->id}")->assertNotFound();
        $this->actingAs($user)->patchJson("/api/v1/admin/equipment/{$item->id}", ['name' => 'X'])->assertNotFound();
    }

    public function test_a_gym_admin_still_cannot_write_the_catalog(): void
    {
        // gym_admin is not is_platform_admin — the admin surface is invisible.
        $gym = Gym::create(['name' => 'KAIROS']);
        $user = User::factory()->create();
        GymAssignment::create([
            'user_id' => $user->id, 'gym_id' => $gym->id, 'branch_id' => null,
            'role' => GymAssignment::ROLE_GYM_ADMIN, 'status' => 'active',
        ]);

        $this->actingAs($user)->postJson('/api/v1/admin/equipment', ['name' => 'Nueva'])->assertNotFound();
    }

    // ---------------- CRUD ----------------

    public function test_create_derives_a_unique_slug_and_defaults_to_active(): void
    {
        $admin = $this->platformAdmin();

        $a = $this->actingAs($admin)->postJson('/api/v1/admin/equipment', [
            'name' => 'Prensa 45°', 'brand' => 'Hammer', 'category' => 'Piernas',
        ])->assertStatus(201)
            ->assertJsonPath('equipment.slug', 'prensa-45')
            ->assertJsonPath('equipment.is_active', true)
            ->assertJsonPath('equipment.gym_count', 0);

        $b = $this->actingAs($admin)->postJson('/api/v1/admin/equipment', ['name' => 'Prensa 45°'])
            ->assertStatus(201)->assertJsonPath('equipment.slug', 'prensa-45-2');

        $this->assertNotSame($a->json('equipment.slug'), $b->json('equipment.slug'));
    }

    public function test_update_edits_fields_but_never_the_slug(): void
    {
        $admin = $this->platformAdmin();
        $item = Equipment::create(['slug' => 'm-prensa', 'name' => 'Prensa']);

        $this->actingAs($admin)->patchJson("/api/v1/admin/equipment/{$item->id}", [
            'slug' => 'hacked', 'name' => 'Prensa de piernas', 'description' => 'desc', 'is_active' => false,
        ])->assertOk()
            ->assertJsonPath('equipment.slug', 'm-prensa')
            ->assertJsonPath('equipment.name', 'Prensa de piernas')
            ->assertJsonPath('equipment.is_active', false);
    }

    public function test_index_reports_how_many_gyms_have_each_item_and_filters_by_active(): void
    {
        $admin = $this->platformAdmin();
        $press = Equipment::create(['slug' => 'm-press', 'name' => 'Press', 'is_active' => true]);
        $prensa = Equipment::create(['slug' => 'm-prensa', 'name' => 'Prensa', 'is_active' => true]);
        $old = Equipment::create(['slug' => 'm-old', 'name' => 'Retirada', 'is_active' => false]);

        $g1 = Gym::create(['name' => 'G1']);
        $g2 = Gym::create(['name' => 'G2']);
        GymEquipment::create(['gym_id' => $g1->id, 'equipment_id' => $press->id, 'available' => true]);
        GymEquipment::create(['gym_id' => $g2->id, 'equipment_id' => $press->id, 'available' => false]);
        GymEquipment::create(['gym_id' => $g1->id, 'equipment_id' => $prensa->id, 'available' => true]);

        $all = $this->actingAs($admin)->getJson('/api/v1/admin/equipment')->assertOk()->json('equipment');
        $bySlug = collect($all)->keyBy('slug');
        $this->assertSame(2, $bySlug['m-press']['gym_count']);
        $this->assertSame(1, $bySlug['m-prensa']['gym_count']);
        $this->assertSame(0, $bySlug['m-old']['gym_count']);
        $this->assertTrue($bySlug->has('m-old')); // inactive still listed for the admin

        $activeOnly = $this->actingAs($admin)->getJson('/api/v1/admin/equipment?active=1')->json('equipment');
        $this->assertFalse(collect($activeOnly)->contains('slug', 'm-old'));
    }

    // ---------------- public catalog respects is_active ----------------

    public function test_public_equipment_catalog_hides_inactive_items(): void
    {
        Equipment::create(['slug' => 'm-press', 'name' => 'Press', 'is_active' => true]);
        Equipment::create(['slug' => 'm-old', 'name' => 'Retirada', 'is_active' => false]);

        $items = $this->getJson('/api/v1/equipment')->assertOk()->json('equipment');
        $this->assertSame(['m-press'], collect($items)->pluck('slug')->all());
    }

    public function test_admin_can_set_and_edit_the_educational_fields(): void
    {
        $admin = $this->platformAdmin();

        $created = $this->actingAs($admin)->postJson('/api/v1/admin/equipment', [
            'name' => 'Prensa Hack',
            'purpose' => 'Sentadilla guiada en ángulo.',
            'primary_muscle' => 'Cuádriceps',
            'secondary_muscles' => ['Glúteo mayor', 'Isquiotibiales'],
            'movement' => 'Empuje de tren inferior',
            'level' => 'Intermedio',
            'tips' => ['Pies centrados.', 'Baja controlado.'],
            'mistakes' => ['Rodillas hacia dentro.'],
            'related' => ['Sentadilla', 'Prensa'],
            'art' => 'legPress',
        ])->assertStatus(201);

        $id = $created->json('equipment.id');
        $created->assertJsonPath('equipment.primary_muscle', 'Cuádriceps')
            ->assertJsonPath('equipment.secondary_muscles', ['Glúteo mayor', 'Isquiotibiales'])
            ->assertJsonPath('equipment.art', 'legPress');

        $this->actingAs($admin)->patchJson("/api/v1/admin/equipment/{$id}", [
            'level' => 'Avanzado',
            'tips' => ['Solo una recomendación ahora.'],
        ])->assertOk()
            ->assertJsonPath('equipment.level', 'Avanzado')
            ->assertJsonPath('equipment.tips', ['Solo una recomendación ahora.'])
            ->assertJsonPath('equipment.primary_muscle', 'Cuádriceps'); // unchanged

        // Visible via the public catalog with the same shape.
        $public = collect($this->getJson('/api/v1/equipment')->json('equipment'))->firstWhere('id', $id);
        $this->assertSame('Avanzado', $public['level']);
        $this->assertSame('legPress', $public['art']);
    }

    public function test_public_gym_inventory_hides_an_item_deactivated_globally(): void
    {
        $gym = Gym::create(['name' => 'KAIROS']);
        $live = Equipment::create(['slug' => 'm-press', 'name' => 'Press', 'is_active' => true]);
        $dead = Equipment::create(['slug' => 'm-old', 'name' => 'Retirada', 'is_active' => false]);
        GymEquipment::create(['gym_id' => $gym->id, 'equipment_id' => $live->id, 'available' => true]);
        GymEquipment::create(['gym_id' => $gym->id, 'equipment_id' => $dead->id, 'available' => true]);

        $items = $this->getJson("/api/v1/gyms/{$gym->id}/equipment")->assertOk()->json('equipment');
        $this->assertSame(['m-press'], collect($items)->pluck('slug')->all());
    }
}
