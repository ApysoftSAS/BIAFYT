<?php

namespace Tests\Feature\Api\V1;

use App\Models\Activity;
use App\Models\CheckIn;
use App\Models\CoachAthleteRelationship;
use App\Models\CoachNote;
use App\Models\Gym;
use App\Models\GymAssignment;
use App\Models\PointTransaction;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

/**
 * Coach MVP slice: a coach with a currently `active` relationship reads an
 * athlete's information and leaves feedback notes. Focus of these tests is
 * the authorization gate (anti-IDOR): a missing / pending / revoked
 * relationship must 404, and one coach must never reach another coach's
 * athletes or notes.
 */
class CoachAthleteApiTest extends TestCase
{
    use RefreshDatabase;

    private function makeCoach(): User
    {
        $coach = User::factory()->create();
        $gym = Gym::create(['name' => 'Gym One']);
        GymAssignment::create([
            'user_id' => $coach->id,
            'gym_id' => $gym->id,
            'branch_id' => null,
            'role' => GymAssignment::ROLE_COACH,
            'status' => GymAssignment::STATUS_ACTIVE,
        ]);

        return $coach;
    }

    private function relate(User $coach, User $athlete, string $status): CoachAthleteRelationship
    {
        return CoachAthleteRelationship::create([
            'coach_user_id' => $coach->id,
            'athlete_user_id' => $athlete->id,
            'status' => $status,
            'requested_at' => now()->subDay(),
            'activated_at' => $status === CoachAthleteRelationship::STATUS_PENDING ? null : now()->subDay(),
            'revoked_at' => $status === CoachAthleteRelationship::STATUS_REVOKED ? now() : null,
        ]);
    }

    // -----------------------------------------------------------------
    // index()
    // -----------------------------------------------------------------

    public function test_index_rejects_unauthenticated_requests(): void
    {
        $this->getJson('/api/v1/me/coach/athletes')->assertStatus(401);
    }

    public function test_index_lists_only_active_athletes_of_the_calling_coach(): void
    {
        $coach = $this->makeCoach();
        $activeAthlete = User::factory()->create(['name' => 'Active Athlete']);
        $pendingAthlete = User::factory()->create();
        $revokedAthlete = User::factory()->create();

        $this->relate($coach, $activeAthlete, CoachAthleteRelationship::STATUS_ACTIVE);
        $this->relate($coach, $pendingAthlete, CoachAthleteRelationship::STATUS_PENDING);
        $this->relate($coach, $revokedAthlete, CoachAthleteRelationship::STATUS_REVOKED);

        // A relationship where the coach is instead the athlete must not leak here.
        $otherCoach = $this->makeCoach();
        $this->relate($otherCoach, $coach, CoachAthleteRelationship::STATUS_ACTIVE);

        $response = $this->actingAs($coach, 'sanctum')->getJson('/api/v1/me/coach/athletes');

        $response->assertOk();
        $response->assertJsonCount(1, 'athletes');
        $response->assertJsonPath('athletes.0.athlete.id', $activeAthlete->id);
        $response->assertJsonPath('athletes.0.athlete.name', 'Active Athlete');
    }

    // -----------------------------------------------------------------
    // show() — authorization gate
    // -----------------------------------------------------------------

    public function test_show_rejects_unauthenticated_requests(): void
    {
        $this->getJson('/api/v1/me/coach/athletes/1')->assertStatus(401);
    }

    public function test_show_404s_without_any_relationship(): void
    {
        $coach = $this->makeCoach();
        $athlete = User::factory()->create();

        $this->actingAs($coach, 'sanctum')
            ->getJson("/api/v1/me/coach/athletes/{$athlete->id}")
            ->assertStatus(404);
    }

    public function test_show_404s_with_a_pending_relationship(): void
    {
        $coach = $this->makeCoach();
        $athlete = User::factory()->create();
        $this->relate($coach, $athlete, CoachAthleteRelationship::STATUS_PENDING);

        $this->actingAs($coach, 'sanctum')
            ->getJson("/api/v1/me/coach/athletes/{$athlete->id}")
            ->assertStatus(404);
    }

    public function test_show_404s_with_a_revoked_relationship(): void
    {
        $coach = $this->makeCoach();
        $athlete = User::factory()->create();
        $this->relate($coach, $athlete, CoachAthleteRelationship::STATUS_REVOKED);

        $this->actingAs($coach, 'sanctum')
            ->getJson("/api/v1/me/coach/athletes/{$athlete->id}")
            ->assertStatus(404);
    }

    public function test_show_404s_when_another_coach_owns_the_relationship(): void
    {
        $coachA = $this->makeCoach();
        $coachB = $this->makeCoach();
        $athlete = User::factory()->create();
        $this->relate($coachB, $athlete, CoachAthleteRelationship::STATUS_ACTIVE);

        $this->actingAs($coachA, 'sanctum')
            ->getJson("/api/v1/me/coach/athletes/{$athlete->id}")
            ->assertStatus(404);
    }

    public function test_show_404s_for_a_nonexistent_athlete(): void
    {
        $coach = $this->makeCoach();

        $this->actingAs($coach, 'sanctum')
            ->getJson('/api/v1/me/coach/athletes/999999')
            ->assertStatus(404);
    }

    // -----------------------------------------------------------------
    // show() — payload
    // -----------------------------------------------------------------

    public function test_show_returns_profile_activity_streak_and_points_for_an_active_athlete(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-08-28T12:00:00Z'));

        $coach = $this->makeCoach();
        $athlete = User::factory()->create(['name' => 'Nadia']);
        $this->relate($coach, $athlete, CoachAthleteRelationship::STATUS_ACTIVE);

        $athlete->profile()->create([
            'age' => 30,
            'weight' => 62.5,
            'height' => 168,
            'months_training' => 14,
            'level' => 'intermedio',
            'focus_id' => 'fuerza',
        ]);

        $older = Activity::create([
            'user_id' => $athlete->id, 'routine_label' => 'Fuerza A',
            'started_at' => '2026-08-26T10:00:00Z', 'finished_at' => '2026-08-26T11:00:00Z',
            'duration_seconds' => 3600, 'sets_completed' => 10, 'exercises_completed' => 4,
        ]);
        $older->pointTransactions()->create([
            'user_id' => $athlete->id, 'amount' => 100, 'reason' => PointTransaction::REASON_WORKOUT_COMPLETED,
        ]);
        $newer = Activity::create([
            'user_id' => $athlete->id, 'routine_label' => 'Fuerza B',
            'started_at' => '2026-08-27T10:00:00Z', 'finished_at' => '2026-08-27T11:00:00Z',
            'duration_seconds' => 1800, 'sets_completed' => 6, 'exercises_completed' => 3,
        ]);
        $newer->pointTransactions()->create([
            'user_id' => $athlete->id, 'amount' => 60, 'reason' => PointTransaction::REASON_WORKOUT_COMPLETED,
        ]);

        CheckIn::create(['user_id' => $athlete->id, 'check_in_date' => '2026-08-27', 'checked_in_at' => '2026-08-27T09:00:00Z']);
        CheckIn::create(['user_id' => $athlete->id, 'check_in_date' => '2026-08-28', 'checked_in_at' => '2026-08-28T09:00:00Z']);

        $response = $this->actingAs($coach, 'sanctum')->getJson("/api/v1/me/coach/athletes/{$athlete->id}");

        $response->assertOk();
        $response->assertJsonPath('athlete.id', $athlete->id);
        $response->assertJsonPath('athlete.name', 'Nadia');
        $response->assertJsonPath('profile.level', 'intermedio');
        $response->assertJsonPath('profile.focus_id', 'fuerza');
        $response->assertJsonPath('profile.months_training', 14);
        $response->assertJsonPath('activity_summary.count', 2);
        $response->assertJsonPath('activity_summary.total_sets', 16);
        $response->assertJsonPath('activity_summary.total_exercises', 7);
        $response->assertJsonPath('activity_summary.total_duration_seconds', 5400);
        // Newest first.
        $response->assertJsonPath('activity_summary.recent.0.id', $newer->id);
        $response->assertJsonPath('activity_summary.recent.0.points_awarded', 60);
        $response->assertJsonPath('activity_summary.recent.1.id', $older->id);
        $response->assertJsonPath('streak.current_streak', 2);
        $response->assertJsonPath('streak.longest_streak', 2);
        $response->assertJsonPath('points.balance', 160);

        Carbon::setTestNow();
    }

    public function test_show_returns_null_profile_and_zeroed_summary_when_athlete_has_no_data(): void
    {
        $coach = $this->makeCoach();
        $athlete = User::factory()->create();
        $this->relate($coach, $athlete, CoachAthleteRelationship::STATUS_ACTIVE);

        $response = $this->actingAs($coach, 'sanctum')->getJson("/api/v1/me/coach/athletes/{$athlete->id}");

        $response->assertOk();
        $response->assertJsonPath('profile', null);
        $response->assertJsonPath('activity_summary.count', 0);
        $response->assertJsonPath('activity_summary.last_activity_at', null);
        $response->assertJsonPath('activity_summary.recent', []);
        $response->assertJsonPath('streak.current_streak', 0);
        $response->assertJsonPath('points.balance', 0);
    }

    public function test_show_does_not_expose_athlete_email_or_internal_user_ids_in_profile(): void
    {
        $coach = $this->makeCoach();
        $athlete = User::factory()->create();
        $this->relate($coach, $athlete, CoachAthleteRelationship::STATUS_ACTIVE);
        $athlete->profile()->create(['level' => 'novato']);

        $response = $this->actingAs($coach, 'sanctum')->getJson("/api/v1/me/coach/athletes/{$athlete->id}");

        $response->assertOk();
        $this->assertSame(
            ['age', 'weight', 'height', 'months_training', 'level', 'focus_id'],
            array_keys($response->json('profile')),
        );
        $this->assertSame(['id', 'name'], array_keys($response->json('athlete')));
    }

    // -----------------------------------------------------------------
    // notesStore() / notesIndex()
    // -----------------------------------------------------------------

    public function test_notes_store_requires_an_active_relationship(): void
    {
        $coach = $this->makeCoach();
        $athlete = User::factory()->create();
        $this->relate($coach, $athlete, CoachAthleteRelationship::STATUS_PENDING);

        $this->actingAs($coach, 'sanctum')
            ->postJson("/api/v1/me/coach/athletes/{$athlete->id}/notes", ['body' => 'Buen trabajo'])
            ->assertStatus(404);

        $this->assertSame(0, CoachNote::count());
    }

    public function test_notes_store_creates_a_note_scoped_to_coach_and_athlete(): void
    {
        $coach = $this->makeCoach();
        $athlete = User::factory()->create();
        $this->relate($coach, $athlete, CoachAthleteRelationship::STATUS_ACTIVE);

        $response = $this->actingAs($coach, 'sanctum')->postJson(
            "/api/v1/me/coach/athletes/{$athlete->id}/notes",
            ['body' => 'Subir carga en sentadilla la próxima semana', 'coach_user_id' => 999, 'athlete_user_id' => 999],
        );

        $response->assertCreated();
        $response->assertJsonPath('note.body', 'Subir carga en sentadilla la próxima semana');
        $this->assertSame(['id', 'body', 'created_at', 'updated_at'], array_keys($response->json('note')));

        // coach_user_id / athlete_user_id come from the token + route, never the body.
        $this->assertDatabaseHas('coach_notes', [
            'coach_user_id' => $coach->id,
            'athlete_user_id' => $athlete->id,
            'body' => 'Subir carga en sentadilla la próxima semana',
        ]);
    }

    public function test_notes_store_validates_body(): void
    {
        $coach = $this->makeCoach();
        $athlete = User::factory()->create();
        $this->relate($coach, $athlete, CoachAthleteRelationship::STATUS_ACTIVE);

        $this->actingAs($coach, 'sanctum')
            ->postJson("/api/v1/me/coach/athletes/{$athlete->id}/notes", ['body' => ''])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['body']);
    }

    public function test_notes_index_returns_only_this_coachs_notes_for_this_athlete(): void
    {
        $coach = $this->makeCoach();
        $otherCoach = $this->makeCoach();
        $athlete = User::factory()->create();
        $otherAthlete = User::factory()->create();
        $this->relate($coach, $athlete, CoachAthleteRelationship::STATUS_ACTIVE);
        $this->relate($coach, $otherAthlete, CoachAthleteRelationship::STATUS_ACTIVE);

        CoachNote::create(['coach_user_id' => $coach->id, 'athlete_user_id' => $athlete->id, 'body' => 'mía / de este atleta']);
        CoachNote::create(['coach_user_id' => $coach->id, 'athlete_user_id' => $otherAthlete->id, 'body' => 'mía / otro atleta']);
        CoachNote::create(['coach_user_id' => $otherCoach->id, 'athlete_user_id' => $athlete->id, 'body' => 'de otro coach']);

        $response = $this->actingAs($coach, 'sanctum')->getJson("/api/v1/me/coach/athletes/{$athlete->id}/notes");

        $response->assertOk();
        $response->assertJsonCount(1, 'notes');
        $response->assertJsonPath('notes.0.body', 'mía / de este atleta');
    }

    public function test_notes_index_requires_an_active_relationship(): void
    {
        $coach = $this->makeCoach();
        $athlete = User::factory()->create();
        $this->relate($coach, $athlete, CoachAthleteRelationship::STATUS_REVOKED);
        CoachNote::create(['coach_user_id' => $coach->id, 'athlete_user_id' => $athlete->id, 'body' => 'histórica']);

        $this->actingAs($coach, 'sanctum')
            ->getJson("/api/v1/me/coach/athletes/{$athlete->id}/notes")
            ->assertStatus(404);
    }

    // -----------------------------------------------------------------
    // notesDestroy()
    // -----------------------------------------------------------------

    public function test_coach_can_delete_their_own_note(): void
    {
        $coach = $this->makeCoach();
        $athlete = User::factory()->create();
        $this->relate($coach, $athlete, CoachAthleteRelationship::STATUS_ACTIVE);
        $note = CoachNote::create(['coach_user_id' => $coach->id, 'athlete_user_id' => $athlete->id, 'body' => 'borrar']);

        $this->actingAs($coach, 'sanctum')
            ->deleteJson("/api/v1/me/coach/notes/{$note->id}")
            ->assertStatus(204);

        $this->assertDatabaseMissing('coach_notes', ['id' => $note->id]);
    }

    public function test_coach_cannot_delete_another_coachs_note(): void
    {
        $coach = $this->makeCoach();
        $otherCoach = $this->makeCoach();
        $athlete = User::factory()->create();
        $note = CoachNote::create(['coach_user_id' => $otherCoach->id, 'athlete_user_id' => $athlete->id, 'body' => 'ajena']);

        $this->actingAs($coach, 'sanctum')
            ->deleteJson("/api/v1/me/coach/notes/{$note->id}")
            ->assertStatus(404);

        $this->assertDatabaseHas('coach_notes', ['id' => $note->id]);
    }

    public function test_notes_destroy_of_a_nonexistent_note_returns_404(): void
    {
        $coach = $this->makeCoach();

        $this->actingAs($coach, 'sanctum')
            ->deleteJson('/api/v1/me/coach/notes/999999')
            ->assertStatus(404);
    }
}
