<?php

namespace Tests\Feature\Api\V1;

use App\Models\CoachAthleteRelationship;
use App\Models\Equipment;
use App\Models\Exercise;
use App\Models\Gym;
use App\Models\GymAssignment;
use App\Models\GymEquipment;
use App\Models\Program;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Slice D-COACH-PROGRAMS: a coach with an active coach<->athlete
 * relationship authors training programs for the athlete. The relationship
 * is the ONLY authorization gate (no GymAssignment). An optional reference
 * gym must belong to the coach; the athlete need not belong to it.
 */
class CoachAthleteProgramApiTest extends TestCase
{
    use RefreshDatabase;

    private function coach(?Gym $gym = null): User
    {
        $coach = User::factory()->create();
        $gym ??= Gym::create(['name' => 'Coach Gym']);
        GymAssignment::create([
            'user_id' => $coach->id, 'gym_id' => $gym->id, 'branch_id' => null,
            'role' => GymAssignment::ROLE_COACH, 'status' => GymAssignment::STATUS_ACTIVE,
        ]);

        return $coach;
    }

    private function relate(User $coach, User $athlete, string $status): void
    {
        CoachAthleteRelationship::create([
            'coach_user_id' => $coach->id,
            'athlete_user_id' => $athlete->id,
            'status' => $status,
            'requested_at' => now()->subDay(),
            'activated_at' => $status === CoachAthleteRelationship::STATUS_PENDING ? null : now()->subDay(),
            'revoked_at' => $status === CoachAthleteRelationship::STATUS_REVOKED ? now() : null,
        ]);
    }

    private function squat(): Exercise
    {
        return Exercise::firstOrCreate(['slug' => 'ex-sentadilla'], ['name' => 'Sentadilla', 'type' => 'fuerza']);
    }

    private function prensa(): Exercise
    {
        return Exercise::firstOrCreate(['slug' => 'ex-prensa'], ['name' => 'Prensa', 'type' => 'fuerza', 'machine_id' => 'm-prensa']);
    }

    private function dayPayload(Exercise ...$exercises): array
    {
        return [[
            'name' => 'Día 1',
            'position' => 1,
            'exercises' => array_map(
                fn (Exercise $e, int $i) => ['exercise_id' => $e->id, 'position' => $i + 1],
                $exercises,
                array_keys($exercises),
            ),
        ]];
    }

    // ---------------- happy paths ----------------

    public function test_related_coach_creates_a_program_for_the_athlete(): void
    {
        $coach = $this->coach();
        $athlete = User::factory()->create();
        $this->relate($coach, $athlete, CoachAthleteRelationship::STATUS_ACTIVE);

        $res = $this->actingAs($coach)->postJson("/api/v1/me/coach/athletes/{$athlete->id}/programs", [
            'name' => 'Fuerza base',
            'days' => $this->dayPayload($this->squat()),
        ])->assertStatus(201);

        $programId = $res->json('program.id');
        $this->assertDatabaseHas('programs', [
            'id' => $programId,
            'user_id' => $athlete->id,
            'created_by_user_id' => $coach->id,
            'reference_gym_id' => null,
        ]);
        $res->assertJsonPath('program.created_by.id', $coach->id);
        $res->assertJsonPath('program.reference_gym', null);
    }

    public function test_coach_can_create_a_program_for_an_athlete_with_no_gym(): void
    {
        $coach = $this->coach();
        $athlete = User::factory()->create(); // no GymAssignment at all
        $this->relate($coach, $athlete, CoachAthleteRelationship::STATUS_ACTIVE);

        $this->actingAs($coach)->postJson("/api/v1/me/coach/athletes/{$athlete->id}/programs", [
            'name' => 'Sin gym',
            'days' => $this->dayPayload($this->squat()),
        ])->assertStatus(201);
    }

    public function test_coach_may_reference_their_own_gym_even_if_the_athlete_does_not_belong_to_it(): void
    {
        $gymA = Gym::create(['name' => 'Gym A']);
        $coach = $this->coach($gymA);
        $athlete = User::factory()->create(); // not in Gym A
        $this->relate($coach, $athlete, CoachAthleteRelationship::STATUS_ACTIVE);

        // Gym A has the machine the program needs.
        $prensa = $this->prensa();
        $equipment = Equipment::create(['slug' => 'm-prensa', 'name' => 'PRENSA DE PIERNAS']);
        GymEquipment::create(['gym_id' => $gymA->id, 'equipment_id' => $equipment->id, 'available' => true]);

        $this->actingAs($coach)->postJson("/api/v1/me/coach/athletes/{$athlete->id}/programs", [
            'name' => 'Entrenar en Gym A',
            'reference_gym_id' => $gymA->id,
            'days' => $this->dayPayload($prensa),
        ])->assertStatus(201)->assertJsonPath('program.reference_gym.id', $gymA->id);
    }

    public function test_program_without_reference_gym_ignores_equipment_availability(): void
    {
        $coach = $this->coach();
        $athlete = User::factory()->create();
        $this->relate($coach, $athlete, CoachAthleteRelationship::STATUS_ACTIVE);

        // machine exists but is in no gym inventory — still fine without a reference gym
        Equipment::create(['slug' => 'm-prensa', 'name' => 'PRENSA DE PIERNAS']);

        $this->actingAs($coach)->postJson("/api/v1/me/coach/athletes/{$athlete->id}/programs", [
            'name' => 'Catálogo global',
            'days' => $this->dayPayload($this->prensa()),
        ])->assertStatus(201);
    }

    public function test_coach_can_replace_a_program_to_improve_it(): void
    {
        $coach = $this->coach();
        $athlete = User::factory()->create();
        $this->relate($coach, $athlete, CoachAthleteRelationship::STATUS_ACTIVE);

        $create = $this->actingAs($coach)->postJson("/api/v1/me/coach/athletes/{$athlete->id}/programs", [
            'name' => 'v1',
            'days' => $this->dayPayload($this->squat()),
        ])->assertStatus(201);
        $programId = $create->json('program.id');

        $this->actingAs($coach)->putJson("/api/v1/me/coach/athletes/{$athlete->id}/programs/{$programId}", [
            'name' => 'v2 mejorada',
            'days' => [
                ['name' => 'Día 1', 'position' => 1, 'exercises' => [['exercise_id' => $this->squat()->id, 'position' => 1]]],
                ['name' => 'Día 2', 'position' => 2, 'exercises' => [['exercise_id' => $this->squat()->id, 'position' => 1]]],
            ],
        ])->assertOk()->assertJsonPath('program.name', 'v2 mejorada')
            ->assertJsonCount(2, 'program.days');

        $this->assertSame(2, Program::find($programId)->days()->count());
    }

    // ---------------- authorization ----------------

    public function test_unrelated_coach_is_404(): void
    {
        $coach = $this->coach();
        $athlete = User::factory()->create();
        // no relationship

        $this->actingAs($coach)->getJson("/api/v1/me/coach/athletes/{$athlete->id}/programs")->assertNotFound();
        $this->actingAs($coach)->postJson("/api/v1/me/coach/athletes/{$athlete->id}/programs", [
            'name' => 'x', 'days' => $this->dayPayload($this->squat()),
        ])->assertNotFound();
    }

    public function test_pending_or_revoked_relationship_is_404(): void
    {
        $coach = $this->coach();
        $pending = User::factory()->create();
        $revoked = User::factory()->create();
        $this->relate($coach, $pending, CoachAthleteRelationship::STATUS_PENDING);
        $this->relate($coach, $revoked, CoachAthleteRelationship::STATUS_REVOKED);

        $this->actingAs($coach)->postJson("/api/v1/me/coach/athletes/{$pending->id}/programs", [
            'name' => 'x', 'days' => $this->dayPayload($this->squat()),
        ])->assertNotFound();
        $this->actingAs($coach)->postJson("/api/v1/me/coach/athletes/{$revoked->id}/programs", [
            'name' => 'x', 'days' => $this->dayPayload($this->squat()),
        ])->assertNotFound();
    }

    public function test_a_coach_cannot_touch_a_program_authored_by_another_coach(): void
    {
        $athlete = User::factory()->create();
        $coachA = $this->coach();
        $coachB = $this->coach();
        $this->relate($coachA, $athlete, CoachAthleteRelationship::STATUS_ACTIVE);
        $this->relate($coachB, $athlete, CoachAthleteRelationship::STATUS_ACTIVE);

        $programId = $this->actingAs($coachA)->postJson("/api/v1/me/coach/athletes/{$athlete->id}/programs", [
            'name' => 'de A', 'days' => $this->dayPayload($this->squat()),
        ])->json('program.id');

        $this->actingAs($coachB)->getJson("/api/v1/me/coach/athletes/{$athlete->id}/programs/{$programId}")->assertNotFound();
        $this->actingAs($coachB)->putJson("/api/v1/me/coach/athletes/{$athlete->id}/programs/{$programId}", [
            'name' => 'secuestrada', 'days' => $this->dayPayload($this->squat()),
        ])->assertNotFound();
        $this->actingAs($coachB)->deleteJson("/api/v1/me/coach/athletes/{$athlete->id}/programs/{$programId}")->assertNotFound();

        $this->assertSame('de A', Program::find($programId)->name);
    }

    public function test_user_id_and_author_in_the_body_are_ignored(): void
    {
        $coach = $this->coach();
        $athlete = User::factory()->create();
        $intruder = User::factory()->create();
        $this->relate($coach, $athlete, CoachAthleteRelationship::STATUS_ACTIVE);

        $id = $this->actingAs($coach)->postJson("/api/v1/me/coach/athletes/{$athlete->id}/programs", [
            'name' => 'x',
            'user_id' => $intruder->id,
            'created_by_user_id' => $intruder->id,
            'days' => $this->dayPayload($this->squat()),
        ])->assertStatus(201)->json('program.id');

        $this->assertDatabaseHas('programs', [
            'id' => $id, 'user_id' => $athlete->id, 'created_by_user_id' => $coach->id,
        ]);
    }

    // ---------------- reference gym scope ----------------

    public function test_coach_cannot_reference_a_gym_they_are_not_assigned_to(): void
    {
        $coach = $this->coach(); // assigned to "Coach Gym"
        $other = Gym::create(['name' => 'Otro Gym']);
        $athlete = User::factory()->create();
        $this->relate($coach, $athlete, CoachAthleteRelationship::STATUS_ACTIVE);

        $this->actingAs($coach)->postJson("/api/v1/me/coach/athletes/{$athlete->id}/programs", [
            'name' => 'x', 'reference_gym_id' => $other->id,
            'days' => $this->dayPayload($this->squat()),
        ])->assertStatus(422)->assertJsonValidationErrorFor('reference_gym_id');
    }

    // ---------------- equipment validation ----------------

    public function test_machine_not_available_in_the_reference_gym_is_422_per_exercise(): void
    {
        $gymA = Gym::create(['name' => 'Gym A']);
        $coach = $this->coach($gymA);
        $athlete = User::factory()->create();
        $this->relate($coach, $athlete, CoachAthleteRelationship::STATUS_ACTIVE);

        $prensa = $this->prensa();
        $equipment = Equipment::create(['slug' => 'm-prensa', 'name' => 'PRENSA DE PIERNAS']);
        // Present but OUT OF SERVICE in Gym A.
        GymEquipment::create(['gym_id' => $gymA->id, 'equipment_id' => $equipment->id, 'available' => false]);

        $this->actingAs($coach)->postJson("/api/v1/me/coach/athletes/{$athlete->id}/programs", [
            'name' => 'x', 'reference_gym_id' => $gymA->id,
            'days' => $this->dayPayload($this->squat(), $prensa),
        ])->assertStatus(422)->assertJsonValidationErrorFor('days.0.exercises.1.exercise_id');

        $this->assertSame(0, Program::count());
    }

    public function test_bodyweight_exercise_is_always_allowed_with_a_reference_gym(): void
    {
        $gymA = Gym::create(['name' => 'Gym A']);
        $coach = $this->coach($gymA);
        $athlete = User::factory()->create();
        $this->relate($coach, $athlete, CoachAthleteRelationship::STATUS_ACTIVE);

        // squat has machine_id = null; Gym A has an empty inventory
        $this->actingAs($coach)->postJson("/api/v1/me/coach/athletes/{$athlete->id}/programs", [
            'name' => 'peso corporal', 'reference_gym_id' => $gymA->id,
            'days' => $this->dayPayload($this->squat()),
        ])->assertStatus(201);
    }

    // ---------------- athlete side ----------------

    public function test_athlete_sees_the_coach_program_in_their_own_list_with_provenance(): void
    {
        $coach = $this->coach();
        $athlete = User::factory()->create();
        $this->relate($coach, $athlete, CoachAthleteRelationship::STATUS_ACTIVE);

        $this->actingAs($coach)->postJson("/api/v1/me/coach/athletes/{$athlete->id}/programs", [
            'name' => 'del coach', 'days' => $this->dayPayload($this->squat()),
        ])->assertStatus(201);

        $programs = $this->actingAs($athlete)->getJson('/api/v1/me/programs')->assertOk()->json('programs');
        $this->assertCount(1, $programs);
        $this->assertSame('del coach', $programs[0]['name']);
        $this->assertSame($coach->id, $programs[0]['created_by']['id']);
    }

    public function test_athlete_cannot_edit_a_coach_program_but_can_delete_it(): void
    {
        $coach = $this->coach();
        $athlete = User::factory()->create();
        $this->relate($coach, $athlete, CoachAthleteRelationship::STATUS_ACTIVE);

        $id = $this->actingAs($coach)->postJson("/api/v1/me/coach/athletes/{$athlete->id}/programs", [
            'name' => 'del coach', 'days' => $this->dayPayload($this->squat()),
        ])->json('program.id');

        $this->actingAs($athlete)->patchJson("/api/v1/me/programs/{$id}", ['name' => 'mía ahora'])->assertStatus(403);
        $this->assertSame('del coach', Program::find($id)->name);

        $this->actingAs($athlete)->deleteJson("/api/v1/me/programs/{$id}")->assertNoContent();
        $this->assertNull(Program::find($id));
    }

    public function test_athlete_can_still_create_and_edit_their_own_routine_with_a_coach_present(): void
    {
        $coach = $this->coach();
        $athlete = User::factory()->create();
        $this->relate($coach, $athlete, CoachAthleteRelationship::STATUS_ACTIVE);

        $id = $this->actingAs($athlete)->postJson('/api/v1/me/programs', [
            'name' => 'mía', 'days' => $this->dayPayload($this->squat()),
        ])->assertStatus(201)->json('program.id');

        $this->actingAs($athlete)->patchJson("/api/v1/me/programs/{$id}", ['name' => 'mía v2'])
            ->assertOk()->assertJsonPath('program.name', 'mía v2');
    }
}
