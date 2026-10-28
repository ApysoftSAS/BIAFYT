<?php

namespace Tests\Feature;

use App\Models\CoachAthleteRelationship;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class CoachAthleteRelationshipTest extends TestCase
{
    use RefreshDatabase;

    // 1. Se puede crear una relación pending.
    public function test_a_relationship_can_be_created_as_pending(): void
    {
        $coach = User::factory()->create();
        $athlete = User::factory()->create();

        $relationship = CoachAthleteRelationship::create([
            'coach_user_id' => $coach->id,
            'athlete_user_id' => $athlete->id,
            'status' => CoachAthleteRelationship::STATUS_PENDING,
            'requested_at' => now(),
        ]);

        $this->assertDatabaseHas('coach_athlete_relationships', [
            'id' => $relationship->id,
            'coach_user_id' => $coach->id,
            'athlete_user_id' => $athlete->id,
            'status' => 'pending',
        ]);
    }

    // 2. Relaciones Eloquent (coach/athlete) resuelven correctamente.
    public function test_eloquent_relationships_resolve_correctly(): void
    {
        $coach = User::factory()->create();
        $athlete = User::factory()->create();

        $relationship = CoachAthleteRelationship::create([
            'coach_user_id' => $coach->id,
            'athlete_user_id' => $athlete->id,
            'status' => CoachAthleteRelationship::STATUS_PENDING,
            'requested_at' => now(),
        ]);

        $this->assertTrue($relationship->coach->is($coach));
        $this->assertTrue($relationship->athlete->is($athlete));
        $this->assertTrue($coach->coachRelationshipsAsCoach->contains($relationship));
        $this->assertTrue($athlete->coachRelationshipsAsAthlete->contains($relationship));
        $this->assertSame(0, $coach->coachRelationshipsAsAthlete()->count());
        $this->assertSame(0, $athlete->coachRelationshipsAsCoach()->count());
    }

    // 3. Un usuario eliminado (coach) elimina la relación (cascade).
    public function test_deleting_the_coach_cascades_the_relationship(): void
    {
        $coach = User::factory()->create();
        $athlete = User::factory()->create();
        CoachAthleteRelationship::create([
            'coach_user_id' => $coach->id,
            'athlete_user_id' => $athlete->id,
            'status' => CoachAthleteRelationship::STATUS_PENDING,
            'requested_at' => now(),
        ]);

        $coach->delete();

        $this->assertSame(0, CoachAthleteRelationship::count());
    }

    // 4. Un usuario eliminado (athlete) elimina la relación (cascade).
    public function test_deleting_the_athlete_cascades_the_relationship(): void
    {
        $coach = User::factory()->create();
        $athlete = User::factory()->create();
        CoachAthleteRelationship::create([
            'coach_user_id' => $coach->id,
            'athlete_user_id' => $athlete->id,
            'status' => CoachAthleteRelationship::STATUS_PENDING,
            'requested_at' => now(),
        ]);

        $athlete->delete();

        $this->assertSame(0, CoachAthleteRelationship::count());
    }

    // 5. Múltiples filas históricas son posibles para el mismo par
    // (revoked + una nueva pending), sin UNIQUE bloqueándolo.
    public function test_multiple_historical_rows_are_allowed_for_the_same_pair(): void
    {
        $coach = User::factory()->create();
        $athlete = User::factory()->create();

        CoachAthleteRelationship::create([
            'coach_user_id' => $coach->id,
            'athlete_user_id' => $athlete->id,
            'status' => CoachAthleteRelationship::STATUS_REVOKED,
            'requested_at' => now()->subDays(10),
            'activated_at' => now()->subDays(9),
            'revoked_at' => now()->subDays(1),
        ]);

        $second = CoachAthleteRelationship::create([
            'coach_user_id' => $coach->id,
            'athlete_user_id' => $athlete->id,
            'status' => CoachAthleteRelationship::STATUS_PENDING,
            'requested_at' => now(),
        ]);

        $this->assertSame(2, CoachAthleteRelationship::where('coach_user_id', $coach->id)
            ->where('athlete_user_id', $athlete->id)
            ->count());
        $this->assertNull($second->activated_at);
    }

    // 6. Una reactivación (nueva fila) tiene su propio activated_at,
    // distinto del revoked_at del ciclo anterior.
    public function test_a_new_cycle_has_its_own_activation_window(): void
    {
        $coach = User::factory()->create();
        $athlete = User::factory()->create();

        $firstRevokedAt = now()->subDay();
        CoachAthleteRelationship::create([
            'coach_user_id' => $coach->id,
            'athlete_user_id' => $athlete->id,
            'status' => CoachAthleteRelationship::STATUS_REVOKED,
            'requested_at' => now()->subDays(5),
            'activated_at' => now()->subDays(4),
            'revoked_at' => $firstRevokedAt,
        ]);

        $second = CoachAthleteRelationship::create([
            'coach_user_id' => $coach->id,
            'athlete_user_id' => $athlete->id,
            'status' => CoachAthleteRelationship::STATUS_PENDING,
            'requested_at' => now(),
        ]);
        $second->update(['status' => CoachAthleteRelationship::STATUS_ACTIVE, 'activated_at' => now()]);

        $this->assertNotEquals($firstRevokedAt->timestamp, $second->activated_at->timestamp);
        $this->assertTrue($second->activated_at->greaterThan($firstRevokedAt));
    }
}
