<?php

namespace Tests\Feature\Api\V1;

use App\Models\Activity;
use App\Models\PointTransaction;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

/**
 * Roadmap 3c — A2: cursor pagination of `GET /me/points`.
 *
 * `balance` stays a whole-ledger SUM on every page. The list is a cursor
 * page ordered `created_at DESC, id DESC` (stable: no overlaps, gaps or
 * repeats even when timestamps collide). `limit` 1..100 (default 50);
 * a bad `limit` or `cursor` is a 422. A cursor can never reach another
 * user's rows.
 */
class PointsPaginationApiTest extends TestCase
{
    use RefreshDatabase;

    /** @return array<int, int> the created transaction ids, newest first */
    private function seedLedger(User $user, int $count, int $amount = 10, ?Carbon $at = null): array
    {
        $ids = [];
        for ($i = 0; $i < $count; $i++) {
            if ($at === null) {
                Carbon::setTestNow(Carbon::parse('2026-09-01 12:00:00')->addSeconds($i));
            } else {
                Carbon::setTestNow($at);
            }
            $tx = $user->pointTransactions()->create([
                'amount' => $amount,
                'reason' => PointTransaction::REASON_WORKOUT_COMPLETED,
                'idempotency_key' => "seed:{$user->id}:{$i}",
            ]);
            $ids[] = $tx->id;
        }
        Carbon::setTestNow();

        return array_reverse($ids); // newest first
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    // Página 1 sin parámetros: mismos registros y orden que antes + metadata.
    public function test_first_page_returns_the_expected_rows_newest_first(): void
    {
        $user = User::factory()->create();
        $ids = $this->seedLedger($user, 3);

        $response = $this->actingAs($user, 'sanctum')->getJson('/api/v1/me/points');

        $response->assertOk();
        $response->assertJsonPath('balance', 30);
        $response->assertJsonCount(3, 'transactions');
        $this->assertSame($ids, array_column($response->json('transactions'), 'id'));
        $response->assertJsonPath('has_more', false);
        $response->assertJsonPath('next_cursor', null);
    }

    // `limit` se respeta y `has_more` / `next_cursor` reflejan que hay más.
    public function test_limit_is_respected_and_signals_more_pages(): void
    {
        $user = User::factory()->create();
        $this->seedLedger($user, 5);

        $response = $this->actingAs($user, 'sanctum')->getJson('/api/v1/me/points?limit=2');

        $response->assertOk();
        $response->assertJsonCount(2, 'transactions');
        $response->assertJsonPath('has_more', true);
        $this->assertIsString($response->json('next_cursor'));
    }

    // Recorrer todas las páginas con el cursor: sin solapamientos, sin
    // huecos, sin repeticiones; la última página cierra correctamente.
    public function test_paging_through_every_row_has_no_gaps_or_overlaps(): void
    {
        $user = User::factory()->create();
        $allIds = $this->seedLedger($user, 5); // newest first

        $seen = [];
        $cursor = null;
        $pages = 0;

        do {
            $url = '/api/v1/me/points?limit=2'.($cursor ? '&cursor='.urlencode($cursor) : '');
            $response = $this->actingAs($user, 'sanctum')->getJson($url);
            $response->assertOk();
            $response->assertJsonPath('balance', 50); // balance intacto en cada página

            $seen = array_merge($seen, array_column($response->json('transactions'), 'id'));
            $cursor = $response->json('next_cursor');
            $pages++;
        } while ($cursor !== null && $pages < 10);

        $this->assertSame(3, $pages);                 // 2 + 2 + 1
        $this->assertSame($allIds, $seen);            // orden y contenido exactos
        $this->assertSame(count($seen), count(array_unique($seen))); // sin repetidos
        $this->assertFalse($response->json('has_more'));
    }

    // Timestamps idénticos: el desempate por `id` evita duplicados y huecos.
    public function test_identical_timestamps_are_disambiguated_by_id(): void
    {
        $user = User::factory()->create();
        $allIds = $this->seedLedger($user, 6, 10, Carbon::parse('2026-09-01 09:00:00'));

        $seen = [];
        $cursor = null;
        do {
            $url = '/api/v1/me/points?limit=2'.($cursor ? '&cursor='.urlencode($cursor) : '');
            $response = $this->actingAs($user, 'sanctum')->getJson($url);
            $response->assertOk();
            $seen = array_merge($seen, array_column($response->json('transactions'), 'id'));
            $cursor = $response->json('next_cursor');
        } while ($cursor !== null);

        $this->assertSame($allIds, $seen);
        $this->assertSame(count($seen), count(array_unique($seen)));
    }

    // El balance es global aunque se pida una página intermedia.
    public function test_balance_is_the_whole_ledger_on_any_page(): void
    {
        $user = User::factory()->create();
        $this->seedLedger($user, 4, 25); // balance 100

        $first = $this->actingAs($user, 'sanctum')->getJson('/api/v1/me/points?limit=1');
        $first->assertJsonPath('balance', 100);

        $second = $this->actingAs($user, 'sanctum')
            ->getJson('/api/v1/me/points?limit=1&cursor='.urlencode($first->json('next_cursor')));
        $second->assertJsonPath('balance', 100);
        $second->assertJsonCount(1, 'transactions');
    }

    // `limit` fuera de rango o no entero -> 422.
    public function test_invalid_limit_is_rejected(): void
    {
        $user = User::factory()->create();

        foreach (['0', '-3', '101', 'abc', '2.5'] as $bad) {
            $this->actingAs($user, 'sanctum')->getJson("/api/v1/me/points?limit={$bad}")
                ->assertStatus(422)
                ->assertJsonValidationErrors('limit');
        }
    }

    // Cursor malformado -> 422 (no un fallback silencioso a la página 1).
    public function test_a_malformed_cursor_is_rejected(): void
    {
        $user = User::factory()->create();
        $this->seedLedger($user, 3);

        $this->actingAs($user, 'sanctum')->getJson('/api/v1/me/points?cursor=not-a-valid-cursor')
            ->assertStatus(422)
            ->assertJsonValidationErrors('cursor');
    }

    // Un cursor de OTRO endpoint (distinto ORDER BY) -> 422.
    public function test_a_cursor_from_a_different_ordering_is_rejected(): void
    {
        $user = User::factory()->create();
        Activity::create([
            'user_id' => $user->id, 'started_at' => '2026-09-01T10:00:00Z', 'finished_at' => '2026-09-01T11:00:00Z',
            'duration_seconds' => 3600, 'sets_completed' => 1, 'exercises_completed' => 1,
        ]);
        Activity::create([
            'user_id' => $user->id, 'started_at' => '2026-09-02T10:00:00Z', 'finished_at' => '2026-09-02T11:00:00Z',
            'duration_seconds' => 3600, 'sets_completed' => 1, 'exercises_completed' => 1,
        ]);

        $activitiesCursor = $this->actingAs($user, 'sanctum')
            ->getJson('/api/v1/me/activities?limit=1')->json('next_cursor');
        $this->assertIsString($activitiesCursor);

        $this->actingAs($user, 'sanctum')->getJson('/api/v1/me/points?cursor='.urlencode($activitiesCursor))
            ->assertStatus(422)
            ->assertJsonValidationErrors('cursor');
    }

    // Un cursor NUNCA cruza el límite del usuario: user B usando el cursor
    // de user A solo ve filas de B.
    public function test_a_cursor_cannot_cross_the_user_boundary(): void
    {
        $a = User::factory()->create();
        $b = User::factory()->create();
        $this->seedLedger($a, 5, 42);
        $bIds = $this->seedLedger($b, 5, 7);

        $aCursor = $this->actingAs($a, 'sanctum')->getJson('/api/v1/me/points?limit=2')->json('next_cursor');

        $response = $this->actingAs($b, 'sanctum')->getJson('/api/v1/me/points?limit=100&cursor='.urlencode($aCursor));

        $response->assertOk();
        $response->assertJsonPath('balance', 35); // el balance de B, no el de A (210)
        foreach ($response->json('transactions') as $tx) {
            $this->assertContains($tx['id'], $bIds);
            $this->assertSame(7, $tx['amount']);
        }
    }

    // Compatibilidad: el shape de cada transacción no cambió.
    public function test_transaction_shape_is_unchanged(): void
    {
        $user = User::factory()->create();
        $this->actingAs($user, 'sanctum')->postJson('/api/v1/me/activities', [
            'started_at' => '2026-08-28T10:00:00Z', 'finished_at' => '2026-08-28T11:00:00Z',
            'duration_seconds' => 3600, 'sets_completed' => 3, 'exercises_completed' => 2,
        ])->assertStatus(201);

        $response = $this->actingAs($user, 'sanctum')->getJson('/api/v1/me/points');

        $this->assertSame(
            ['id', 'amount', 'reason', 'source_type', 'source_id', 'created_at'],
            array_keys($response->json('transactions.0')),
        );
        $response->assertJsonPath('transactions.0.source_type', 'activity');
    }
}
