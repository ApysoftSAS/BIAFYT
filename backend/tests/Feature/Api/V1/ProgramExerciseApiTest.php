<?php

namespace Tests\Feature\Api\V1;

use App\Models\Exercise;
use App\Models\Program;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ProgramExerciseApiTest extends TestCase
{
    use RefreshDatabase;

    // 29. Crear exercise bajo Day propio -> 201; bajo Day ajeno -> 404.
    public function test_create_exercise_under_own_day_succeeds_and_under_another_users_day_fails(): void
    {
        $user = User::factory()->create();
        $otherUser = User::factory()->create();
        $exercise = Exercise::create(['slug' => 'squat', 'name' => 'Squat', 'type' => 'strength']);

        $ownProgram = Program::create(['user_id' => $user->id, 'name' => 'Propio']);
        $ownDay = $ownProgram->days()->create(['name' => 'Día 1', 'position' => 1]);

        $otherProgram = Program::create(['user_id' => $otherUser->id, 'name' => 'Ajeno']);
        $otherDay = $otherProgram->days()->create(['name' => 'Día 1', 'position' => 1]);

        $ownResponse = $this->actingAs($user, 'sanctum')->postJson("/api/v1/me/program-days/{$ownDay->id}/exercises", [
            'exercise_id' => $exercise->id,
            'position' => 1,
        ]);
        $ownResponse->assertStatus(201);
        $ownResponse->assertJsonPath('program_exercise.exercise.id', $exercise->id);
        $this->assertDatabaseHas('program_exercises', ['program_day_id' => $ownDay->id, 'exercise_id' => $exercise->id]);

        $otherResponse = $this->actingAs($user, 'sanctum')->postJson("/api/v1/me/program-days/{$otherDay->id}/exercises", [
            'exercise_id' => $exercise->id,
            'position' => 1,
        ]);
        $otherResponse->assertStatus(404);
        $this->assertDatabaseMissing('program_exercises', ['program_day_id' => $otherDay->id]);
    }

    // 30. Repetir exercise_id dentro del mismo day vía API -> 201 (confirma la decisión 9 en el contrato HTTP real).
    public function test_repeating_exercise_id_within_the_same_day_is_allowed(): void
    {
        $user = User::factory()->create();
        $exercise = Exercise::create(['slug' => 'squat', 'name' => 'Squat', 'type' => 'strength']);
        $program = Program::create(['user_id' => $user->id, 'name' => 'Rutina']);
        $day = $program->days()->create(['name' => 'Día 1', 'position' => 1]);

        $first = $this->actingAs($user, 'sanctum')->postJson("/api/v1/me/program-days/{$day->id}/exercises", [
            'exercise_id' => $exercise->id,
            'position' => 1,
        ]);
        $first->assertStatus(201);

        $second = $this->actingAs($user, 'sanctum')->postJson("/api/v1/me/program-days/{$day->id}/exercises", [
            'exercise_id' => $exercise->id,
            'position' => 2,
        ]);
        $second->assertStatus(201);

        $this->assertSame(2, $day->exercises()->where('exercise_id', $exercise->id)->count());
    }

    // Fix QA: POST con position explícita que colisiona con un exercise ya
    // existente en BD -> 422 (no 500), sin fila nueva creada.
    public function test_create_exercise_with_position_conflicting_with_existing_exercise_returns_422(): void
    {
        $user = User::factory()->create();
        $exercise = Exercise::create(['slug' => 'squat', 'name' => 'Squat', 'type' => 'strength']);
        $program = Program::create(['user_id' => $user->id, 'name' => 'Rutina']);
        $day = $program->days()->create(['name' => 'Día 1', 'position' => 1]);
        $day->exercises()->create(['exercise_id' => $exercise->id, 'position' => 1]);

        $response = $this->actingAs($user, 'sanctum')->postJson("/api/v1/me/program-days/{$day->id}/exercises", [
            'exercise_id' => $exercise->id,
            'position' => 1,
        ]);

        $response->assertStatus(422);
        $this->assertSame(1, $day->exercises()->count());
    }

    // 31. exercise_id inexistente -> 422.
    public function test_nonexistent_exercise_id_returns_422(): void
    {
        $user = User::factory()->create();
        $program = Program::create(['user_id' => $user->id, 'name' => 'Rutina']);
        $day = $program->days()->create(['name' => 'Día 1', 'position' => 1]);

        $response = $this->actingAs($user, 'sanctum')->postJson("/api/v1/me/program-days/{$day->id}/exercises", [
            'exercise_id' => 999999,
            'position' => 1,
        ]);

        $response->assertStatus(422);
        $response->assertJsonValidationErrors(['exercise_id']);
        $this->assertDatabaseCount('program_exercises', 0);
    }

    // 32. PATCH/DELETE con aislamiento entre usuarios.
    public function test_user_cannot_patch_or_delete_another_users_exercise(): void
    {
        $userA = User::factory()->create();
        $userB = User::factory()->create();
        $exercise = Exercise::create(['slug' => 'squat', 'name' => 'Squat', 'type' => 'strength']);
        $programA = Program::create(['user_id' => $userA->id, 'name' => 'De A']);
        $dayA = $programA->days()->create(['name' => 'Día 1', 'position' => 1]);
        $programExerciseA = $dayA->exercises()->create(['exercise_id' => $exercise->id, 'position' => 1]);

        $this->actingAs($userB, 'sanctum')
            ->patchJson("/api/v1/me/program-exercises/{$programExerciseA->id}", ['position' => 2])
            ->assertStatus(404);

        $this->actingAs($userB, 'sanctum')
            ->deleteJson("/api/v1/me/program-exercises/{$programExerciseA->id}")
            ->assertStatus(404);

        $this->assertDatabaseHas('program_exercises', ['id' => $programExerciseA->id, 'position' => 1]);
    }

    public function test_patch_and_delete_on_own_exercise_succeed(): void
    {
        $user = User::factory()->create();
        $exerciseA = Exercise::create(['slug' => 'squat', 'name' => 'Squat', 'type' => 'strength']);
        $exerciseB = Exercise::create(['slug' => 'bench-press', 'name' => 'Bench Press', 'type' => 'strength']);
        $program = Program::create(['user_id' => $user->id, 'name' => 'Rutina']);
        $day = $program->days()->create(['name' => 'Día 1', 'position' => 1]);
        $programExercise = $day->exercises()->create(['exercise_id' => $exerciseA->id, 'position' => 1]);

        $patchResponse = $this->actingAs($user, 'sanctum')->patchJson("/api/v1/me/program-exercises/{$programExercise->id}", [
            'exercise_id' => $exerciseB->id,
        ]);
        $patchResponse->assertOk();
        $patchResponse->assertJsonPath('program_exercise.exercise.id', $exerciseB->id);

        $deleteResponse = $this->actingAs($user, 'sanctum')->deleteJson("/api/v1/me/program-exercises/{$programExercise->id}");
        $deleteResponse->assertStatus(204);
        $this->assertDatabaseMissing('program_exercises', ['id' => $programExercise->id]);
    }
}
