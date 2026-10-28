<?php

namespace Tests\Feature\Api\V1;

use App\Models\Exercise;
use App\Models\User;
use Database\Seeders\ExerciseSeeder;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ExerciseTest extends TestCase
{
    use RefreshDatabase;

    /**
     * Parse frontend-usuario/src/data/exercises.js so the expected catalog
     * is derived from the single real source of truth instead of being
     * duplicated by hand in this test (which could silently drift from it).
     *
     * @return array<int, array{slug: string, name: string, type: string, machine_id: ?string}>
     */
    private static function frontendExercises(): array
    {
        $path = base_path('../frontend-usuario/src/data/exercises.js');
        $source = file_get_contents($path);

        preg_match_all(
            '/\{\s*id:\s*"([^"]+)",\s*name:\s*"([^"]+)",\s*type:\s*"([^"]+)"(?:,\s*machineId:\s*"([^"]+)")?\s*,?\s*\}/u',
            $source,
            $matches,
            PREG_SET_ORDER
        );

        return array_map(static fn (array $m) => [
            'slug' => $m[1],
            'name' => $m[2],
            'type' => $m[3],
            'machine_id' => $m[4] ?? null,
        ], $matches);
    }

    private function seedExercises(): void
    {
        $this->seed(ExerciseSeeder::class);
    }

    public function test_index_is_public_and_returns_ok_without_a_token(): void
    {
        $this->seedExercises();

        $response = $this->getJson('/api/v1/exercises');

        $response->assertOk();
    }

    public function test_index_returns_the_same_result_for_an_authenticated_client(): void
    {
        $this->seedExercises();
        $user = User::factory()->create();

        $anonymous = $this->getJson('/api/v1/exercises');
        $authenticated = $this->actingAs($user, 'sanctum')->getJson('/api/v1/exercises');

        $authenticated->assertOk();
        $this->assertSame($anonymous->json(), $authenticated->json());
    }

    public function test_index_returns_every_exercise_from_the_frontend_catalog(): void
    {
        $this->seedExercises();
        $expected = self::frontendExercises();

        $response = $this->getJson('/api/v1/exercises');

        $response->assertOk();
        $response->assertJsonCount(count($expected), 'exercises');
    }

    public function test_index_slugs_match_the_frontend_catalog_exactly(): void
    {
        $this->seedExercises();
        $expected = self::frontendExercises();
        $expectedSlugs = array_column($expected, 'slug');

        $response = $this->getJson('/api/v1/exercises');

        $actualSlugs = array_column($response->json('exercises'), 'slug');
        sort($expectedSlugs);
        sort($actualSlugs);

        $this->assertSame($expectedSlugs, $actualSlugs);
    }

    public function test_index_serializes_each_exercise_with_the_expected_fields(): void
    {
        $this->seedExercises();

        $response = $this->getJson('/api/v1/exercises');

        $response->assertOk();
        $exercises = $response->json('exercises');

        $this->assertNotEmpty($exercises);

        foreach ($exercises as $exercise) {
            $this->assertSame(
                ['id', 'slug', 'name', 'type', 'machine_id', 'created_at', 'updated_at'],
                array_keys($exercise)
            );
        }
    }

    public function test_index_machine_id_matches_the_frontend_catalog_per_exercise(): void
    {
        $this->seedExercises();
        $expected = self::frontendExercises();

        $response = $this->getJson('/api/v1/exercises');
        $bySlug = collect($response->json('exercises'))->keyBy('slug');

        foreach ($expected as $exercise) {
            $this->assertSame(
                $exercise['machine_id'],
                $bySlug[$exercise['slug']]['machine_id'],
                "machine_id mismatch for slug {$exercise['slug']}"
            );
        }
    }

    public function test_slug_is_unique_at_the_database_level(): void
    {
        Exercise::create([
            'slug' => 'ex-duplicate',
            'name' => 'Duplicate exercise',
            'type' => 'fuerza',
            'machine_id' => null,
        ]);

        $this->expectException(QueryException::class);

        Exercise::create([
            'slug' => 'ex-duplicate',
            'name' => 'Another name',
            'type' => 'fuerza',
            'machine_id' => null,
        ]);
    }
}
