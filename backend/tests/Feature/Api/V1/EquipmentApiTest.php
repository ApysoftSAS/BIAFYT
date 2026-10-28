<?php

namespace Tests\Feature\Api\V1;

use App\Models\Equipment;
use App\Models\Gym;
use App\Models\GymEquipment;
use App\Models\User;
use Database\Seeders\EquipmentSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class EquipmentApiTest extends TestCase
{
    use RefreshDatabase;

    /**
     * Parse frontend-usuario/src/data/machines.js so the expected catalog is
     * derived from the single real source of truth (same approach as
     * ExerciseTest).
     *
     * @return array<int, array{slug: string, name: string}>
     */
    private static function frontendMachines(): array
    {
        $source = file_get_contents(base_path('../frontend-usuario/src/data/machines.js'));

        preg_match_all(
            '/id:\s*"(m-[^"]+)",\s*\n\s*name:\s*"([^"]+)"/u',
            $source,
            $matches,
            PREG_SET_ORDER
        );

        return array_map(static fn (array $m) => ['slug' => $m[1], 'name' => $m[2]], $matches);
    }

    public function test_global_catalog_is_public_and_returns_ok_without_a_token(): void
    {
        $this->seed(EquipmentSeeder::class);

        $this->getJson('/api/v1/equipment')->assertOk();
    }

    public function test_global_catalog_matches_the_frontend_machines_source(): void
    {
        $this->seed(EquipmentSeeder::class);

        $items = $this->getJson('/api/v1/equipment')->assertOk()->json('equipment');

        $bySlug = collect($items)->keyBy('slug');
        $expected = collect(self::frontendMachines());

        $this->assertNotEmpty($expected, 'Could not parse machines.js');
        $this->assertSame($expected->count(), count($items));

        foreach ($expected as $machine) {
            $this->assertTrue($bySlug->has($machine['slug']), "Missing equipment slug {$machine['slug']}");
            $this->assertSame($machine['name'], $bySlug[$machine['slug']]['name']);
        }

        $this->assertSame([
            'id', 'slug', 'name', 'description', 'brand', 'model', 'category', 'photo_urls',
            'purpose', 'primary_muscle', 'secondary_muscles', 'movement', 'level',
            'tips', 'mistakes', 'related', 'art',
        ], array_keys($items[0]));
    }

    public function test_global_catalog_carries_the_full_educational_shape_from_the_seeder(): void
    {
        $this->seed(EquipmentSeeder::class);

        $items = collect($this->getJson('/api/v1/equipment')->assertOk()->json('equipment'))->keyBy('slug');
        $prensa = $items['m-prensa'];

        $this->assertSame('Cuádriceps', $prensa['primary_muscle']);
        $this->assertSame(['Glúteo mayor', 'Isquiotibiales', 'Aductores'], $prensa['secondary_muscles']);
        $this->assertSame('Empuje de tren inferior', $prensa['movement']);
        $this->assertSame('Principiante', $prensa['level']);
        $this->assertSame('legPress', $prensa['art']);
        $this->assertCount(3, $prensa['tips']);
        $this->assertCount(3, $prensa['mistakes']);
        $this->assertCount(3, $prensa['related']);
        $this->assertNotEmpty($prensa['purpose']);
    }

    public function test_gym_inventory_lists_only_inventoried_items_with_the_available_flag(): void
    {
        $gym = Gym::create(['name' => 'KAIROS']);
        $press = Equipment::create(['slug' => 'm-press-pecho', 'name' => 'Press de pecho']);
        $prensa = Equipment::create(['slug' => 'm-prensa', 'name' => 'Prensa de piernas']);
        $absent = Equipment::create(['slug' => 'm-cinta', 'name' => 'Cinta de correr']);

        GymEquipment::create(['gym_id' => $gym->id, 'equipment_id' => $press->id, 'available' => true]);
        GymEquipment::create(['gym_id' => $gym->id, 'equipment_id' => $prensa->id, 'available' => false]);

        $items = $this->getJson("/api/v1/gyms/{$gym->id}/equipment")->assertOk()->json('equipment');

        $this->assertCount(2, $items);
        $bySlug = collect($items)->keyBy('slug');
        $this->assertTrue($bySlug['m-press-pecho']['available']);
        $this->assertFalse($bySlug['m-prensa']['available']);
        $this->assertFalse($bySlug->has($absent->slug), 'Non-inventoried item must not appear');
        // Same educational shape as the global catalog, plus `available`.
        $this->assertArrayHasKey('available', $items[0]);
        $this->assertArrayHasKey('primary_muscle', $items[0]);
        $this->assertArrayHasKey('art', $items[0]);
    }

    public function test_gym_inventory_is_public(): void
    {
        $gym = Gym::create(['name' => 'KAIROS']);

        $this->getJson("/api/v1/gyms/{$gym->id}/equipment")->assertOk()->assertJsonPath('equipment', []);
    }

    public function test_gym_inventory_is_scoped_to_that_gym(): void
    {
        $a = Gym::create(['name' => 'Gym A']);
        $b = Gym::create(['name' => 'Gym B']);
        $item = Equipment::create(['slug' => 'm-prensa', 'name' => 'Prensa de piernas']);
        GymEquipment::create(['gym_id' => $a->id, 'equipment_id' => $item->id, 'available' => true]);

        $this->getJson("/api/v1/gyms/{$b->id}/equipment")->assertOk()->assertJsonPath('equipment', []);
    }

    public function test_unknown_gym_is_404(): void
    {
        $this->getJson('/api/v1/gyms/9999/equipment')->assertNotFound();
    }

    public function test_non_numeric_gym_segment_is_404_at_the_router(): void
    {
        $this->getJson('/api/v1/gyms/abc/equipment')->assertNotFound();
    }

    public function test_authenticated_client_gets_the_same_catalog(): void
    {
        $this->seed(EquipmentSeeder::class);
        $user = User::factory()->create();

        $guest = $this->getJson('/api/v1/equipment')->json('equipment');
        $authed = $this->actingAs($user)->getJson('/api/v1/equipment')->json('equipment');

        $this->assertSame($guest, $authed);
    }
}
