<?php

namespace Tests\Feature\Api\V1;

use App\Models\CoachAthleteRelationship;
use App\Models\Exercise;
use App\Models\Program;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Coach-routine import: the athlete copies a coach-authored program into
 * their own local routines and the "from my coach" tray must stop offering
 * it — persistently, per-athlete, without deleting the coach's original and
 * without a name comparison. The persistence lives on `programs.imported_at`
 * (the athlete's own row).
 */
class ProgramImportApiTest extends TestCase
{
    use RefreshDatabase;

    private function relate(User $coach, User $athlete): void
    {
        CoachAthleteRelationship::create([
            'coach_user_id' => $coach->id,
            'athlete_user_id' => $athlete->id,
            'status' => CoachAthleteRelationship::STATUS_ACTIVE,
            'requested_at' => now()->subDay(),
            'activated_at' => now()->subDay(),
        ]);
    }

    /** A coach-authored program owned by $athlete, with one day + one exercise. */
    private function coachProgram(User $coach, User $athlete, string $name = 'Plan del coach'): Program
    {
        $exercise = Exercise::firstOrCreate(['slug' => 'ex-sentadilla'], ['name' => 'Sentadilla', 'type' => 'fuerza']);

        $program = Program::create([
            'user_id' => $athlete->id,
            'name' => $name,
            'created_by_user_id' => $coach->id,
        ]);
        $day = $program->days()->create(['name' => 'Día 1', 'position' => 1]);
        $day->exercises()->create(['exercise_id' => $exercise->id, 'position' => 1]);

        return $program;
    }

    public function test_import_requires_authentication(): void
    {
        $program = Program::create(['user_id' => User::factory()->create()->id, 'name' => 'X']);

        $this->postJson("/api/v1/me/programs/{$program->id}/import")->assertStatus(401);
    }

    public function test_athlete_imports_a_coach_program_and_it_leaves_the_pending_tray(): void
    {
        $coach = User::factory()->create(['name' => 'Marta']);
        $athlete = User::factory()->create();
        $this->relate($coach, $athlete);
        $program = $this->coachProgram($coach, $athlete);

        // Before: shows in the athlete's list with imported_at = null.
        $this->actingAs($athlete, 'sanctum')->getJson('/api/v1/me/programs')
            ->assertOk()
            ->assertJsonPath('programs.0.created_by.name', 'Marta')
            ->assertJsonPath('programs.0.imported_at', null);

        $this->actingAs($athlete, 'sanctum')->postJson("/api/v1/me/programs/{$program->id}/import")
            ->assertOk()
            ->assertJsonPath('program.id', $program->id)
            ->assertJsonPath('program.created_by.name', 'Marta')
            // still a full program (copy source), just flagged imported
            ->assertJsonPath('program.days.0.exercises.0.exercise.slug', 'ex-sentadilla');

        $program->refresh();
        $this->assertNotNull($program->imported_at);

        // The coach's original program is NOT deleted.
        $this->assertDatabaseHas('programs', ['id' => $program->id, 'created_by_user_id' => $coach->id]);
        $this->assertDatabaseCount('program_days', 1);

        // Reload: still marked imported — never comes back as pending.
        $this->actingAs($athlete, 'sanctum')->getJson('/api/v1/me/programs')
            ->assertOk()
            ->assertJsonPath('programs.0.imported_at', $program->imported_at->toJSON());
    }

    public function test_import_is_idempotent_and_keeps_the_first_timestamp(): void
    {
        $coach = User::factory()->create();
        $athlete = User::factory()->create();
        $this->relate($coach, $athlete);
        $program = $this->coachProgram($coach, $athlete);

        $this->actingAs($athlete, 'sanctum')->postJson("/api/v1/me/programs/{$program->id}/import")->assertOk();
        $firstImportedAt = $program->refresh()->imported_at;

        $this->travel(5)->minutes();
        $this->actingAs($athlete, 'sanctum')->postJson("/api/v1/me/programs/{$program->id}/import")->assertOk();

        $this->assertTrue($firstImportedAt->equalTo($program->refresh()->imported_at));
    }

    public function test_cannot_import_your_own_program(): void
    {
        $athlete = User::factory()->create();
        $ownProgram = Program::create(['user_id' => $athlete->id, 'name' => 'Mía']);

        $this->actingAs($athlete, 'sanctum')->postJson("/api/v1/me/programs/{$ownProgram->id}/import")
            ->assertStatus(422)
            ->assertJsonValidationErrors('program');

        $this->assertNull($ownProgram->refresh()->imported_at);
    }

    public function test_cannot_import_another_athletes_program(): void
    {
        $coach = User::factory()->create();
        $athleteA = User::factory()->create();
        $athleteB = User::factory()->create();
        $this->relate($coach, $athleteA);
        $program = $this->coachProgram($coach, $athleteA);

        $this->actingAs($athleteB, 'sanctum')->postJson("/api/v1/me/programs/{$program->id}/import")
            ->assertStatus(404);

        $this->assertNull($program->refresh()->imported_at);
    }

    public function test_import_is_per_athlete_another_athletes_copy_stays_pending(): void
    {
        $coach = User::factory()->create();
        $athleteA = User::factory()->create();
        $athleteB = User::factory()->create();
        $this->relate($coach, $athleteA);
        $this->relate($coach, $athleteB);

        // Same coach routine, built for each athlete = separate Program rows.
        $programA = $this->coachProgram($coach, $athleteA);
        $programB = $this->coachProgram($coach, $athleteB);

        $this->actingAs($athleteA, 'sanctum')->postJson("/api/v1/me/programs/{$programA->id}/import")->assertOk();

        $this->assertNotNull($programA->refresh()->imported_at);
        $this->assertNull($programB->refresh()->imported_at);

        $this->actingAs($athleteB, 'sanctum')->getJson('/api/v1/me/programs')
            ->assertOk()
            ->assertJsonPath('programs.0.imported_at', null);
    }

    public function test_coach_editing_the_program_afterwards_does_not_reset_the_import(): void
    {
        $coach = User::factory()->create();
        $athlete = User::factory()->create();
        $this->relate($coach, $athlete);
        $program = $this->coachProgram($coach, $athlete);

        $this->actingAs($athlete, 'sanctum')->postJson("/api/v1/me/programs/{$program->id}/import")->assertOk();
        $importedAt = $program->refresh()->imported_at;

        $squat = Exercise::firstOrCreate(['slug' => 'ex-sentadilla'], ['name' => 'Sentadilla', 'type' => 'fuerza']);
        $this->actingAs($coach, 'sanctum')->putJson("/api/v1/me/coach/athletes/{$athlete->id}/programs/{$program->id}", [
            'name' => 'Plan del coach v2',
            'days' => [
                ['name' => 'Día 1', 'position' => 1, 'exercises' => [
                    ['exercise_id' => $squat->id, 'position' => 1],
                    ['exercise_id' => $squat->id, 'position' => 2],
                ]],
            ],
        ])->assertOk();

        $program->refresh();
        $this->assertSame('Plan del coach v2', $program->name);
        $this->assertNotNull($program->imported_at);
        $this->assertTrue($importedAt->equalTo($program->imported_at));

        // Still filtered out for the athlete.
        $this->actingAs($athlete, 'sanctum')->getJson('/api/v1/me/programs')
            ->assertOk()
            ->assertJsonPath('programs.0.name', 'Plan del coach v2')
            ->assertJsonPath('programs.0.imported_at', $program->imported_at->toJSON());
    }
}
