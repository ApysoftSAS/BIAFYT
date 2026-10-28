<?php

namespace Tests\Feature\Api\V1;

use App\Models\Duel;
use App\Models\Gym;
use App\Models\GymAssignment;
use App\Models\PointTransaction;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Real duels (roadmap 3b). Focus: real-user participants, the state
 * machine, head-to-head resolution, the best-effort points ledger, and the
 * anti-IDOR gate (a non-participant is indistinguishable from a missing
 * duel — always 404, never 403).
 */
class DuelApiTest extends TestCase
{
    use RefreshDatabase;

    private function gym(string $name = 'Gym One'): Gym
    {
        return Gym::create(['name' => $name]);
    }

    private function member(Gym $gym, ?string $name = null, int $balance = 5000): User
    {
        $user = User::factory()->create($name ? ['name' => $name] : []);
        GymAssignment::create([
            'user_id' => $user->id,
            'gym_id' => $gym->id,
            'branch_id' => null,
            'role' => GymAssignment::ROLE_COACH,
            'status' => GymAssignment::STATUS_ACTIVE,
        ]);

        // A4 gives the challenger a points balance to stake. The 3b
        // state-machine tests fund generously so the balance check never
        // stands in their way; the A4 tests pass an exact `$balance`.
        if ($balance !== 0) {
            $user->pointTransactions()->create([
                'amount' => $balance,
                'reason' => PointTransaction::REASON_WORKOUT_COMPLETED,
                'idempotency_key' => "seed:{$user->id}",
            ]);
        }

        return $user;
    }

    /** @return array<string, int|bool> */
    private function runPayload(array $overrides = []): array
    {
        return array_merge([
            'duration_seconds' => 1800,
            'exercises_completed' => 6,
            'sets_completed' => 18,
            'valid_reps' => 120,
            'consistency' => 80,
            'penalties' => 0,
            'competitive_eligible' => true,
        ], $overrides);
    }

    private function makeDuel(User $challenger, User $opponent, string $status = Duel::STATUS_PENDING, int $stake = 100): Duel
    {
        return Duel::create([
            'challenger_user_id' => $challenger->id,
            'opponent_user_id' => $opponent->id,
            'gym_id' => null,
            'modality' => 'routine',
            'stake' => $stake,
            'status' => $status,
            'accepted_at' => $status === Duel::STATUS_PENDING ? null : now(),
        ]);
    }

    // -----------------------------------------------------------------
    // auth + creation
    // -----------------------------------------------------------------

    public function test_endpoints_require_authentication(): void
    {
        $this->getJson('/api/v1/me/duels')->assertStatus(401);
        $this->postJson('/api/v1/me/duels', [])->assertStatus(401);
    }

    public function test_challenger_creates_a_pending_duel_against_a_gym_mate(): void
    {
        $gym = $this->gym();
        $challenger = $this->member($gym, 'Challenger');
        $opponent = $this->member($gym, 'Opponent');

        $response = $this->actingAs($challenger)->postJson('/api/v1/me/duels', [
            'opponent_user_id' => $opponent->id,
            'modality' => 'routine',
            'stake' => 100,
        ]);

        $response->assertCreated()
            ->assertJsonPath('duel.status', Duel::STATUS_PENDING)
            ->assertJsonPath('duel.viewer_role', 'challenger')
            ->assertJsonPath('duel.challenger.id', $challenger->id)
            ->assertJsonPath('duel.opponent.id', $opponent->id)
            ->assertJsonPath('duel.stake', 100);

        $this->assertDatabaseHas('duels', [
            'challenger_user_id' => $challenger->id,
            'opponent_user_id' => $opponent->id,
            'gym_id' => $gym->id,
            'status' => Duel::STATUS_PENDING,
        ]);
    }

    public function test_stake_and_challenger_identity_are_never_taken_from_the_client(): void
    {
        $gym = $this->gym();
        $challenger = $this->member($gym);
        $opponent = $this->member($gym);

        $this->actingAs($challenger)->postJson('/api/v1/me/duels', [
            'opponent_user_id' => $opponent->id,
            'modality' => 'routine',
            'stake' => 100,
            'challenger_user_id' => $opponent->id,
            'status' => Duel::STATUS_FINISHED,
            'winner_user_id' => $challenger->id,
        ])->assertCreated()
            ->assertJsonPath('duel.status', Duel::STATUS_PENDING)
            ->assertJsonPath('duel.challenger.id', $challenger->id)
            ->assertJsonPath('duel.winner_user_id', null);
    }

    public function test_cannot_duel_yourself(): void
    {
        $gym = $this->gym();
        $user = $this->member($gym);

        $this->actingAs($user)->postJson('/api/v1/me/duels', [
            'opponent_user_id' => $user->id,
            'modality' => 'routine',
            'stake' => 10,
        ])->assertStatus(422)->assertJsonValidationErrors('opponent_user_id');
    }

    public function test_rejects_unknown_modality_and_over_max_stake(): void
    {
        $gym = $this->gym();
        $challenger = $this->member($gym);
        $opponent = $this->member($gym);

        $this->actingAs($challenger)->postJson('/api/v1/me/duels', [
            'opponent_user_id' => $opponent->id,
            'modality' => 'telekinesis',
            'stake' => 10,
        ])->assertStatus(422)->assertJsonValidationErrors('modality');

        $this->actingAs($challenger)->postJson('/api/v1/me/duels', [
            'opponent_user_id' => $opponent->id,
            'modality' => 'consistency',
            'stake' => 999,
        ])->assertStatus(422)->assertJsonValidationErrors('stake');
    }

    public function test_cannot_duel_someone_from_another_gym(): void
    {
        $challenger = $this->member($this->gym('A'));
        $stranger = $this->member($this->gym('B'));

        $this->actingAs($challenger)->postJson('/api/v1/me/duels', [
            'opponent_user_id' => $stranger->id,
            'modality' => 'routine',
            'stake' => 10,
        ])->assertStatus(422)->assertJsonValidationErrors('opponent_user_id');
    }

    public function test_cannot_open_a_second_duel_with_the_same_user(): void
    {
        $gym = $this->gym();
        $challenger = $this->member($gym);
        $opponent = $this->member($gym);
        $this->makeDuel($challenger, $opponent, Duel::STATUS_ACCEPTED);

        // Same pair, reversed direction, still blocked.
        $this->actingAs($opponent)->postJson('/api/v1/me/duels', [
            'opponent_user_id' => $challenger->id,
            'modality' => 'routine',
            'stake' => 10,
        ])->assertStatus(422)->assertJsonValidationErrors('opponent_user_id');
    }

    // -----------------------------------------------------------------
    // opponents list
    // -----------------------------------------------------------------

    public function test_opponents_lists_gym_mates_excluding_self_and_standing_duels(): void
    {
        $gym = $this->gym();
        $me = $this->member($gym, 'Me');
        $available = $this->member($gym, 'Available');
        $busy = $this->member($gym, 'Busy');
        $this->member($this->gym('Other'), 'Outsider');

        $this->makeDuel($me, $busy, Duel::STATUS_PENDING);

        $response = $this->actingAs($me)->getJson('/api/v1/me/duels/opponents')->assertOk();

        $names = collect($response->json('opponents'))->pluck('name');
        $this->assertTrue($names->contains('Available'));
        $this->assertFalse($names->contains('Me'));
        $this->assertFalse($names->contains('Busy'));
        $this->assertFalse($names->contains('Outsider'));
    }

    public function test_opponents_is_empty_without_an_active_gym_membership(): void
    {
        $loner = User::factory()->create();

        $this->actingAs($loner)->getJson('/api/v1/me/duels/opponents')
            ->assertOk()
            ->assertExactJson(['opponents' => []]);
    }

    // -----------------------------------------------------------------
    // anti-IDOR
    // -----------------------------------------------------------------

    public function test_non_participant_cannot_see_or_act_on_a_duel(): void
    {
        $gym = $this->gym();
        $challenger = $this->member($gym);
        $opponent = $this->member($gym);
        $outsider = $this->member($gym);
        $duel = $this->makeDuel($challenger, $opponent);

        $this->actingAs($outsider)->getJson("/api/v1/me/duels/{$duel->id}")->assertStatus(404);
        $this->actingAs($outsider)->postJson("/api/v1/me/duels/{$duel->id}/accept")->assertStatus(404);
        $this->actingAs($outsider)->postJson("/api/v1/me/duels/{$duel->id}/cancel")->assertStatus(404);
        $this->actingAs($outsider)->postJson("/api/v1/me/duels/{$duel->id}/run", $this->runPayload())->assertStatus(404);
    }

    // -----------------------------------------------------------------
    // accept / reject / cancel
    // -----------------------------------------------------------------

    public function test_only_the_opponent_can_accept_and_only_when_pending(): void
    {
        $gym = $this->gym();
        $challenger = $this->member($gym);
        $opponent = $this->member($gym);
        $duel = $this->makeDuel($challenger, $opponent);

        $this->actingAs($challenger)->postJson("/api/v1/me/duels/{$duel->id}/accept")->assertStatus(422);

        $this->actingAs($opponent)->postJson("/api/v1/me/duels/{$duel->id}/accept")
            ->assertOk()
            ->assertJsonPath('duel.status', Duel::STATUS_ACCEPTED);
        $this->assertNotNull($duel->fresh()->accepted_at);

        // Second accept is no longer valid.
        $this->actingAs($opponent)->postJson("/api/v1/me/duels/{$duel->id}/accept")->assertStatus(422);
    }

    public function test_opponent_can_reject_a_pending_duel(): void
    {
        $gym = $this->gym();
        $challenger = $this->member($gym);
        $opponent = $this->member($gym);
        $duel = $this->makeDuel($challenger, $opponent);

        $this->actingAs($opponent)->postJson("/api/v1/me/duels/{$duel->id}/reject")
            ->assertOk()
            ->assertJsonPath('duel.status', Duel::STATUS_REJECTED);
    }

    public function test_only_the_challenger_can_cancel_and_not_after_finish(): void
    {
        $gym = $this->gym();
        $challenger = $this->member($gym);
        $opponent = $this->member($gym);
        $duel = $this->makeDuel($challenger, $opponent, Duel::STATUS_ACCEPTED);

        $this->actingAs($opponent)->postJson("/api/v1/me/duels/{$duel->id}/cancel")->assertStatus(422);

        $this->actingAs($challenger)->postJson("/api/v1/me/duels/{$duel->id}/cancel")
            ->assertOk()
            ->assertJsonPath('duel.status', Duel::STATUS_CANCELLED);

        $this->actingAs($challenger)->postJson("/api/v1/me/duels/{$duel->id}/cancel")->assertStatus(422);
    }

    // -----------------------------------------------------------------
    // runs + resolution
    // -----------------------------------------------------------------

    public function test_first_run_moves_the_duel_to_in_progress_and_a_second_run_by_same_user_is_rejected(): void
    {
        $gym = $this->gym();
        $challenger = $this->member($gym);
        $opponent = $this->member($gym);
        $duel = $this->makeDuel($challenger, $opponent, Duel::STATUS_ACCEPTED);

        $this->actingAs($challenger)->postJson("/api/v1/me/duels/{$duel->id}/run", $this->runPayload())
            ->assertOk()
            ->assertJsonPath('duel.status', Duel::STATUS_IN_PROGRESS)
            ->assertJsonPath('duel.you_submitted', true)
            ->assertJsonPath('duel.opponent_submitted', false);

        $this->actingAs($challenger)->postJson("/api/v1/me/duels/{$duel->id}/run", $this->runPayload())
            ->assertStatus(422)->assertJsonValidationErrors('run');
    }

    public function test_run_is_rejected_before_the_duel_is_accepted(): void
    {
        $gym = $this->gym();
        $challenger = $this->member($gym);
        $opponent = $this->member($gym);
        $duel = $this->makeDuel($challenger, $opponent, Duel::STATUS_PENDING);

        $this->actingAs($challenger)->postJson("/api/v1/me/duels/{$duel->id}/run", $this->runPayload())
            ->assertStatus(422)->assertJsonValidationErrors('status');
    }

    public function test_both_eligible_runs_resolve_the_duel_and_write_the_points_ledger(): void
    {
        $gym = $this->gym();
        $challenger = $this->member($gym);
        $opponent = $this->member($gym);
        $duel = $this->makeDuel($challenger, $opponent, Duel::STATUS_ACCEPTED, stake: 150);

        // Challenger clearly outperforms (more reps/exercises, faster).
        $this->actingAs($challenger)->postJson("/api/v1/me/duels/{$duel->id}/run", $this->runPayload([
            'duration_seconds' => 1500, 'exercises_completed' => 8, 'valid_reps' => 160, 'consistency' => 90,
        ]))->assertOk();

        $response = $this->actingAs($opponent)->postJson("/api/v1/me/duels/{$duel->id}/run", $this->runPayload([
            'duration_seconds' => 2100, 'exercises_completed' => 5, 'valid_reps' => 90, 'consistency' => 60,
        ]))->assertOk();

        $response->assertJsonPath('duel.status', Duel::STATUS_FINISHED)
            ->assertJsonPath('duel.outcome', 'challenger')
            ->assertJsonPath('duel.winner_user_id', $challenger->id);

        $this->assertDatabaseHas('point_transactions', [
            'user_id' => $challenger->id,
            'amount' => 150,
            'reason' => PointTransaction::REASON_DUEL_WON,
            'source_type' => Duel::class,
            'source_id' => $duel->id,
        ]);
        $this->assertDatabaseHas('point_transactions', [
            'user_id' => $opponent->id,
            'amount' => -150,
            'reason' => PointTransaction::REASON_DUEL_LOST,
        ]);
    }

    public function test_an_ineligible_run_makes_the_duel_unvalidated_with_no_winner_and_no_ledger(): void
    {
        $gym = $this->gym();
        $challenger = $this->member($gym);
        $opponent = $this->member($gym);
        $duel = $this->makeDuel($challenger, $opponent, Duel::STATUS_ACCEPTED, stake: 150);

        $this->actingAs($challenger)->postJson("/api/v1/me/duels/{$duel->id}/run", $this->runPayload())->assertOk();
        $this->actingAs($opponent)->postJson("/api/v1/me/duels/{$duel->id}/run", $this->runPayload(['competitive_eligible' => false]))
            ->assertOk()
            ->assertJsonPath('duel.status', Duel::STATUS_UNVALIDATED)
            ->assertJsonPath('duel.winner_user_id', null);

        $this->assertDatabaseMissing('point_transactions', ['source_type' => Duel::class, 'source_id' => $duel->id]);
    }

    public function test_identical_runs_draw_with_no_ledger_movement(): void
    {
        $gym = $this->gym();
        $challenger = $this->member($gym);
        $opponent = $this->member($gym);
        $duel = $this->makeDuel($challenger, $opponent, Duel::STATUS_ACCEPTED, stake: 150);

        $this->actingAs($challenger)->postJson("/api/v1/me/duels/{$duel->id}/run", $this->runPayload())->assertOk();
        $this->actingAs($opponent)->postJson("/api/v1/me/duels/{$duel->id}/run", $this->runPayload())
            ->assertOk()
            ->assertJsonPath('duel.status', Duel::STATUS_FINISHED)
            ->assertJsonPath('duel.outcome', 'draw')
            ->assertJsonPath('duel.winner_user_id', null);

        $this->assertDatabaseMissing('point_transactions', ['source_type' => Duel::class, 'source_id' => $duel->id]);
    }

    public function test_index_lists_duels_from_both_sides_newest_first(): void
    {
        $gym = $this->gym();
        $a = $this->member($gym);
        $b = $this->member($gym);
        $old = $this->makeDuel($a, $b);
        $new = $this->makeDuel($b, $a);

        $this->actingAs($a)->getJson('/api/v1/me/duels')
            ->assertOk()
            ->assertJsonPath('duels.0.id', $new->id)
            ->assertJsonPath('duels.1.id', $old->id)
            ->assertJsonPath('duels.0.viewer_role', 'opponent')
            ->assertJsonPath('duels.1.viewer_role', 'challenger');
    }

    // -----------------------------------------------------------------
    // A4 — stake vs. available points balance
    // -----------------------------------------------------------------

    public function test_stake_over_balance_is_rejected(): void
    {
        $gym = $this->gym();
        $challenger = $this->member($gym, null, 50);
        $opponent = $this->member($gym);

        $this->actingAs($challenger)->postJson('/api/v1/me/duels', [
            'opponent_user_id' => $opponent->id, 'modality' => 'routine', 'stake' => 100,
        ])->assertStatus(422)->assertJsonValidationErrors('stake');

        $this->assertDatabaseCount('duels', 0);
    }

    public function test_stake_equal_to_balance_is_allowed(): void
    {
        $gym = $this->gym();
        $challenger = $this->member($gym, null, 100);
        $opponent = $this->member($gym);

        $this->actingAs($challenger)->postJson('/api/v1/me/duels', [
            'opponent_user_id' => $opponent->id, 'modality' => 'routine', 'stake' => 100,
        ])->assertCreated()->assertJsonPath('duel.stake', 100);
    }

    public function test_stake_below_balance_is_allowed(): void
    {
        $gym = $this->gym();
        $challenger = $this->member($gym, null, 100);
        $opponent = $this->member($gym);

        $this->actingAs($challenger)->postJson('/api/v1/me/duels', [
            'opponent_user_id' => $opponent->id, 'modality' => 'routine', 'stake' => 60,
        ])->assertCreated();
    }

    public function test_zero_balance_rejects_any_positive_stake(): void
    {
        $gym = $this->gym();
        $challenger = $this->member($gym, null, 0);
        $opponent = $this->member($gym);

        $this->actingAs($challenger)->postJson('/api/v1/me/duels', [
            'opponent_user_id' => $opponent->id, 'modality' => 'routine', 'stake' => 10,
        ])->assertStatus(422)->assertJsonValidationErrors('stake');
    }

    // Un segundo duelo abierto no puede sobre-comprometer el saldo: el
    // stake ya comprometido en los duelos abiertos del retador cuenta.
    public function test_a_second_open_duel_cannot_over_commit_the_balance(): void
    {
        $gym = $this->gym();
        $challenger = $this->member($gym, null, 100);
        $oppA = $this->member($gym);
        $oppB = $this->member($gym);

        $this->actingAs($challenger)->postJson('/api/v1/me/duels', [
            'opponent_user_id' => $oppA->id, 'modality' => 'routine', 'stake' => 100,
        ])->assertCreated();

        $this->actingAs($challenger)->postJson('/api/v1/me/duels', [
            'opponent_user_id' => $oppB->id, 'modality' => 'routine', 'stake' => 100,
        ])->assertStatus(422)->assertJsonValidationErrors('stake');

        $this->assertDatabaseCount('duels', 1);
    }

    // Resolver un duelo válido (stake <= balance) nunca deja el ledger negativo.
    public function test_resolving_a_valid_duel_never_leaves_the_ledger_negative(): void
    {
        $gym = $this->gym();
        $challenger = $this->member($gym, null, 100);
        $opponent = $this->member($gym, null, 100);

        $create = $this->actingAs($challenger)->postJson('/api/v1/me/duels', [
            'opponent_user_id' => $opponent->id, 'modality' => 'routine', 'stake' => 100,
        ])->assertCreated();
        $duelId = $create->json('duel.id');

        $this->actingAs($opponent)->postJson("/api/v1/me/duels/{$duelId}/accept")->assertOk();

        // Challenger runs weak, opponent runs strong -> challenger loses 100.
        $this->actingAs($challenger)->postJson("/api/v1/me/duels/{$duelId}/run", $this->runPayload([
            'duration_seconds' => 3000, 'exercises_completed' => 2, 'valid_reps' => 40, 'consistency' => 40,
        ]))->assertOk();
        $this->actingAs($opponent)->postJson("/api/v1/me/duels/{$duelId}/run", $this->runPayload([
            'duration_seconds' => 1400, 'exercises_completed' => 9, 'valid_reps' => 170, 'consistency' => 95,
        ]))->assertOk()->assertJsonPath('duel.winner_user_id', $opponent->id);

        $this->assertSame(0, (int) $challenger->pointTransactions()->sum('amount'));
        $this->assertGreaterThanOrEqual(0, (int) $challenger->pointTransactions()->sum('amount'));
    }
}
