<?php

namespace Tests\Feature;

use App\Models\ChallengeClaim;
use App\Models\PointTransaction;
use App\Models\User;
use App\Support\ChallengeRules;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class ChallengeTest extends TestCase
{
    use RefreshDatabase;

    // ---- ChallengeRules (paridad con el frontend `dailyChallengesFor`) ----

    // Ground truth capturado ejecutando `data/community.js#dailyChallengesFor` en node.
    public static function frontendParityCases(): array
    {
        return [
            ['2026-08-28', ['dc-validated', 'dc-sets', 'dc-duration']],
            ['2026-08-29', ['dc-machines', 'dc-validated', 'dc-duration']],
            ['2026-01-01', ['dc-checkin', 'dc-validated', 'dc-duration']],
            ['2025-12-31', ['dc-validated', 'dc-checkin', 'dc-duration']],
        ];
    }

    #[DataProvider('frontendParityCases')]
    public function test_for_date_matches_the_frontend_selection(string $date, array $expectedIds): void
    {
        $ids = array_column(ChallengeRules::forDate($date), 'id');

        $this->assertSame($expectedIds, $ids);
    }

    public function test_for_date_returns_exactly_three_distinct_known_challenges(): void
    {
        $picked = ChallengeRules::forDate('2026-05-15');
        $ids = array_column($picked, 'id');
        $known = array_column(ChallengeRules::TEMPLATES, 'id');

        $this->assertCount(3, $picked);
        $this->assertSame($ids, array_unique($ids));
        foreach ($ids as $id) {
            $this->assertContains($id, $known);
        }
    }

    public function test_for_date_is_deterministic(): void
    {
        $this->assertSame(ChallengeRules::forDate('2026-07-04'), ChallengeRules::forDate('2026-07-04'));
    }

    public function test_reward_for_returns_the_template_reward_only_when_in_the_days_three(): void
    {
        // 2026-08-28 -> dc-validated(100), dc-sets(60), dc-duration(70).
        $this->assertSame(60, ChallengeRules::rewardFor('dc-sets', '2026-08-28'));
        $this->assertSame(100, ChallengeRules::rewardFor('dc-validated', '2026-08-28'));
        $this->assertNull(ChallengeRules::rewardFor('dc-checkin', '2026-08-28'));
        $this->assertNull(ChallengeRules::rewardFor('dc-unknown', '2026-08-28'));
    }

    // ---- ChallengeClaim (esquema / relaciones) ----

    public function test_claim_belongs_to_user(): void
    {
        $user = User::factory()->create();
        $claim = ChallengeClaim::create([
            'user_id' => $user->id, 'challenge_id' => 'dc-sets', 'challenge_date' => '2026-08-28',
        ]);

        $this->assertTrue($claim->user->is($user));
        $this->assertSame('2026-08-28', $claim->challenge_date);
    }

    public function test_unique_user_date_challenge_rejects_a_duplicate(): void
    {
        $user = User::factory()->create();
        ChallengeClaim::create(['user_id' => $user->id, 'challenge_id' => 'dc-sets', 'challenge_date' => '2026-08-28']);

        $this->expectException(QueryException::class);

        ChallengeClaim::create(['user_id' => $user->id, 'challenge_id' => 'dc-sets', 'challenge_date' => '2026-08-28']);
    }

    public function test_same_challenge_different_day_and_different_challenge_same_day_are_allowed(): void
    {
        $user = User::factory()->create();
        $user->challengeClaims()->create(['challenge_id' => 'dc-sets', 'challenge_date' => '2026-08-28']);
        $user->challengeClaims()->create(['challenge_id' => 'dc-sets', 'challenge_date' => '2026-08-29']);
        $user->challengeClaims()->create(['challenge_id' => 'dc-duration', 'challenge_date' => '2026-08-28']);

        $this->assertSame(3, $user->challengeClaims()->count());
    }

    public function test_deleting_the_user_cascades_their_claims(): void
    {
        $user = User::factory()->create();
        ChallengeClaim::create(['user_id' => $user->id, 'challenge_id' => 'dc-sets', 'challenge_date' => '2026-08-28']);

        $user->delete();

        $this->assertSame(0, ChallengeClaim::count());
    }

    public function test_point_transactions_morph_relation_resolves(): void
    {
        $user = User::factory()->create();
        $claim = ChallengeClaim::create(['user_id' => $user->id, 'challenge_id' => 'dc-sets', 'challenge_date' => '2026-08-28']);
        $tx = $claim->pointTransactions()->create([
            'user_id' => $user->id,
            'amount' => 60,
            'reason' => PointTransaction::REASON_CHALLENGE_CLAIMED,
            'idempotency_key' => "challenge:{$user->id}:2026-08-28:dc-sets",
        ]);

        $this->assertSame(1, $claim->pointTransactions()->count());
        $this->assertTrue($tx->fresh()->source->is($claim));
    }

    public function test_challenge_credit_shares_the_ledger_with_the_other_reasons(): void
    {
        $user = User::factory()->create();
        $user->pointTransactions()->createMany([
            ['amount' => 60, 'reason' => PointTransaction::REASON_CHALLENGE_CLAIMED, 'idempotency_key' => 'challenge:1:2026-08-28:dc-sets'],
            ['amount' => 20, 'reason' => PointTransaction::REASON_CHECKIN, 'idempotency_key' => 'checkin:1:2026-08-28'],
            ['amount' => 180, 'reason' => PointTransaction::REASON_WORKOUT_COMPLETED, 'idempotency_key' => 'activity:1'],
        ]);

        $this->assertSame(260, (int) $user->pointTransactions()->sum('amount'));
    }
}
