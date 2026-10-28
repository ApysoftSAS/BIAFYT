<?php

namespace Tests\Feature\Api\V1;

use App\Models\Activity;
use App\Models\PointTransaction;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

/**
 * Roadmap 3c — A2: cursor pagination of `GET /me/activities`.
 *
 * Same contract as `GET /me/points`: `?limit=` (1..100, default 50) + an
 * opaque `?cursor=`, response `{ activities, next_cursor, has_more }`,
 * order `finished_at DESC, id DESC` (stable), 422 on bad input, and a
 * cursor that can never reach another user's rows. Activity fields are
 * unchanged and `client_uid` stays hidden.
 */
class ActivitiesPaginationApiTest extends TestCase
{
    use RefreshDatabase;

    /** @return array<int, int> created activity ids, newest first */
    private function seedActivities(User $user, int $count, ?Carbon $finishedAt = null): array
    {
        $ids = [];
        for ($i = 0; $i < $count; $i++) {
            $finish = $finishedAt ?? Carbon::parse('2026-09-01 11:00:00')->addMinutes($i);
            $a = Activity::create([
                'user_id' => $user->id,
                'started_at' => (clone $finish)->subHour(),
                'finished_at' => $finish,
                'duration_seconds' => 3600,
                'sets_completed' => 1,
                'exercises_completed' => 1,
            ]);
            $ids[] = $a->id;
        }

        return array_reverse($ids); // newest first
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    public function test_first_page_returns_the_expected_rows_newest_first(): void
    {
        $user = User::factory()->create();
        $ids = $this->seedActivities($user, 3);

        $response = $this->actingAs($user, 'sanctum')->getJson('/api/v1/me/activities');

        $response->assertOk();
        $response->assertJsonCount(3, 'activities');
        $this->assertSame($ids, array_column($response->json('activities'), 'id'));
        $response->assertJsonPath('has_more', false);
        $response->assertJsonPath('next_cursor', null);
    }

    public function test_limit_is_respected_and_signals_more_pages(): void
    {
        $user = User::factory()->create();
        $this->seedActivities($user, 5);

        $response = $this->actingAs($user, 'sanctum')->getJson('/api/v1/me/activities?limit=2');

        $response->assertOk();
        $response->assertJsonCount(2, 'activities');
        $response->assertJsonPath('has_more', true);
        $this->assertIsString($response->json('next_cursor'));
    }

    public function test_paging_through_every_row_has_no_gaps_or_overlaps(): void
    {
        $user = User::factory()->create();
        $allIds = $this->seedActivities($user, 5);

        $seen = [];
        $cursor = null;
        $pages = 0;

        do {
            $url = '/api/v1/me/activities?limit=2'.($cursor ? '&cursor='.urlencode($cursor) : '');
            $response = $this->actingAs($user, 'sanctum')->getJson($url);
            $response->assertOk();
            $seen = array_merge($seen, array_column($response->json('activities'), 'id'));
            $cursor = $response->json('next_cursor');
            $pages++;
        } while ($cursor !== null && $pages < 10);

        $this->assertSame(3, $pages);
        $this->assertSame($allIds, $seen);
        $this->assertSame(count($seen), count(array_unique($seen)));
        $this->assertFalse($response->json('has_more'));
    }

    public function test_identical_finished_at_is_disambiguated_by_id(): void
    {
        $user = User::factory()->create();
        $allIds = $this->seedActivities($user, 6, Carbon::parse('2026-09-01 08:00:00'));

        $seen = [];
        $cursor = null;
        do {
            $url = '/api/v1/me/activities?limit=2'.($cursor ? '&cursor='.urlencode($cursor) : '');
            $response = $this->actingAs($user, 'sanctum')->getJson($url);
            $response->assertOk();
            $seen = array_merge($seen, array_column($response->json('activities'), 'id'));
            $cursor = $response->json('next_cursor');
        } while ($cursor !== null);

        $this->assertSame($allIds, $seen);
        $this->assertSame(count($seen), count(array_unique($seen)));
    }

    public function test_invalid_limit_is_rejected(): void
    {
        $user = User::factory()->create();

        foreach (['0', '-1', '101', 'abc', '3.5'] as $bad) {
            $this->actingAs($user, 'sanctum')->getJson("/api/v1/me/activities?limit={$bad}")
                ->assertStatus(422)
                ->assertJsonValidationErrors('limit');
        }
    }

    public function test_a_malformed_cursor_is_rejected(): void
    {
        $user = User::factory()->create();
        $this->seedActivities($user, 3);

        $this->actingAs($user, 'sanctum')->getJson('/api/v1/me/activities?cursor=%%%not-valid%%%')
            ->assertStatus(422)
            ->assertJsonValidationErrors('cursor');
    }

    public function test_a_cursor_from_a_different_ordering_is_rejected(): void
    {
        $user = User::factory()->create();
        // Un cursor de /me/points (ordena por created_at) no vale aquí.
        $user->pointTransactions()->createMany([
            ['amount' => 10, 'reason' => PointTransaction::REASON_WORKOUT_COMPLETED, 'idempotency_key' => 'x1'],
            ['amount' => 10, 'reason' => PointTransaction::REASON_WORKOUT_COMPLETED, 'idempotency_key' => 'x2'],
        ]);
        $pointsCursor = $this->actingAs($user, 'sanctum')->getJson('/api/v1/me/points?limit=1')->json('next_cursor');
        $this->assertIsString($pointsCursor);

        $this->actingAs($user, 'sanctum')->getJson('/api/v1/me/activities?cursor='.urlencode($pointsCursor))
            ->assertStatus(422)
            ->assertJsonValidationErrors('cursor');
    }

    public function test_a_cursor_cannot_cross_the_user_boundary(): void
    {
        $a = User::factory()->create();
        $b = User::factory()->create();
        $this->seedActivities($a, 5);
        $bIds = $this->seedActivities($b, 5);

        $aCursor = $this->actingAs($a, 'sanctum')->getJson('/api/v1/me/activities?limit=2')->json('next_cursor');

        $response = $this->actingAs($b, 'sanctum')->getJson('/api/v1/me/activities?limit=100&cursor='.urlencode($aCursor));

        $response->assertOk();
        foreach ($response->json('activities') as $activity) {
            $this->assertContains($activity['id'], $bIds);
        }
    }

    // Compatibilidad: campos de Activity intactos, client_uid oculto, y la
    // primera página coincide con lo que devolvía el endpoint sin paginar.
    public function test_activity_fields_are_unchanged_and_client_uid_is_hidden(): void
    {
        $user = User::factory()->create();
        $create = $this->actingAs($user, 'sanctum')->postJson('/api/v1/me/activities', [
            'client_uid' => 'sess-a2',
            'routine_label' => 'Hipertrofia',
            'started_at' => '2026-08-28T10:00:00Z', 'finished_at' => '2026-08-28T11:00:00Z',
            'duration_seconds' => 3600, 'sets_completed' => 3, 'exercises_completed' => 2,
        ]);
        $create->assertStatus(201);

        $response = $this->actingAs($user, 'sanctum')->getJson('/api/v1/me/activities');

        $response->assertOk();
        $activity = $response->json('activities.0');
        $this->assertSame([
            'id', 'workout_id', 'routine_label', 'started_at', 'finished_at',
            'duration_seconds', 'sets_completed', 'exercises_completed', 'points_awarded', 'created_at',
        ], array_keys($activity));
        $this->assertArrayNotHasKey('client_uid', $activity);
        $this->assertSame(42, $activity['points_awarded']);
        $this->assertStringNotContainsString('client_uid', $response->getContent());
    }

    // A1 sigue funcionando junto con la paginación: un client_uid repetido
    // no crea una segunda Activity ni aparece dos veces en la lista.
    public function test_a1_idempotency_still_holds_with_pagination(): void
    {
        $user = User::factory()->create();
        $payload = [
            'client_uid' => 'sess-a1-a2',
            'started_at' => '2026-08-28T10:00:00Z', 'finished_at' => '2026-08-28T11:00:00Z',
            'duration_seconds' => 3600, 'sets_completed' => 3, 'exercises_completed' => 2,
        ];
        $this->actingAs($user, 'sanctum')->postJson('/api/v1/me/activities', $payload)->assertStatus(201);
        $this->actingAs($user, 'sanctum')->postJson('/api/v1/me/activities', $payload)->assertStatus(200);

        $response = $this->actingAs($user, 'sanctum')->getJson('/api/v1/me/activities?limit=50');

        $response->assertJsonCount(1, 'activities');
        $response->assertJsonPath('has_more', false);
    }
}
