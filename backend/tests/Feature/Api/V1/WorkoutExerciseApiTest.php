<?php

namespace Tests\Feature\Api\V1;

use App\Models\Exercise;
use App\Models\Program;
use App\Models\User;
use App\Models\Workout;
use App\Models\WorkoutExercise;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class WorkoutExerciseApiTest extends TestCase
{
    use RefreshDatabase;

    // 401 sin auth.
    public function test_all_workout_exercise_endpoints_reject_unauthenticated_requests(): void
    {
        $user = User::factory()->create();
        $exercise = Exercise::create(['slug' => 'squat', 'name' => 'Squat', 'type' => 'strength']);
        $workout = Workout::create(['user_id' => $user->id, 'started_at' => now()]);
        $we = $workout->workoutExercises()->create(['exercise_id' => $exercise->id, 'position' => 1]);

        $this->postJson("/api/v1/me/workouts/{$workout->id}/exercises", ['exercise_id' => $exercise->id])->assertStatus(401);
        $this->patchJson("/api/v1/me/workout-exercises/{$we->id}", ['position' => 2])->assertStatus(401);
        $this->deleteJson("/api/v1/me/workout-exercises/{$we->id}")->assertStatus(401);
    }

    // Crear exercise bajo Workout propio -> 201; bajo Workout ajeno -> 404.
    public function test_create_exercise_under_own_workout_succeeds_and_under_another_users_workout_fails(): void
    {
        $user = User::factory()->create();
        $otherUser = User::factory()->create();
        $exercise = Exercise::create(['slug' => 'squat', 'name' => 'Squat', 'type' => 'strength']);

        $ownWorkout = Workout::create(['user_id' => $user->id, 'started_at' => now()]);
        $otherWorkout = Workout::create(['user_id' => $otherUser->id, 'started_at' => now()]);

        $ownResponse = $this->actingAs($user, 'sanctum')->postJson("/api/v1/me/workouts/{$ownWorkout->id}/exercises", [
            'exercise_id' => $exercise->id,
            'position' => 1,
        ]);
        $ownResponse->assertStatus(201);
        $this->assertDatabaseHas('workout_exercises', ['workout_id' => $ownWorkout->id, 'exercise_id' => $exercise->id]);

        $otherResponse = $this->actingAs($user, 'sanctum')->postJson("/api/v1/me/workouts/{$otherWorkout->id}/exercises", [
            'exercise_id' => $exercise->id,
            'position' => 1,
        ]);
        $otherResponse->assertStatus(404);
        $this->assertDatabaseMissing('workout_exercises', ['workout_id' => $otherWorkout->id]);
    }

    // position auto-asignada si se omite (MAX+1).
    public function test_position_is_auto_assigned_when_omitted(): void
    {
        $user = User::factory()->create();
        $exercise = Exercise::create(['slug' => 'squat', 'name' => 'Squat', 'type' => 'strength']);
        $workout = Workout::create(['user_id' => $user->id, 'started_at' => now()]);

        $first = $this->actingAs($user, 'sanctum')->postJson("/api/v1/me/workouts/{$workout->id}/exercises", [
            'exercise_id' => $exercise->id,
        ]);
        $first->assertStatus(201);
        $first->assertJsonPath('workout_exercise.position', 1);

        $second = $this->actingAs($user, 'sanctum')->postJson("/api/v1/me/workouts/{$workout->id}/exercises", [
            'exercise_id' => $exercise->id,
        ]);
        $second->assertStatus(201);
        $second->assertJsonPath('workout_exercise.position', 2);
    }

    // position duplicada -> 422 (no 500), sin fila nueva creada.
    public function test_create_exercise_with_conflicting_position_returns_422(): void
    {
        $user = User::factory()->create();
        $exercise = Exercise::create(['slug' => 'squat', 'name' => 'Squat', 'type' => 'strength']);
        $workout = Workout::create(['user_id' => $user->id, 'started_at' => now()]);
        $workout->workoutExercises()->create(['exercise_id' => $exercise->id, 'position' => 1]);

        $response = $this->actingAs($user, 'sanctum')->postJson("/api/v1/me/workouts/{$workout->id}/exercises", [
            'exercise_id' => $exercise->id,
            'position' => 1,
        ]);

        $response->assertStatus(422);
        $this->assertSame(1, $workout->workoutExercises()->count());
    }

    // exercise_id inexistente -> 422.
    public function test_nonexistent_exercise_id_returns_422(): void
    {
        $user = User::factory()->create();
        $workout = Workout::create(['user_id' => $user->id, 'started_at' => now()]);

        $response = $this->actingAs($user, 'sanctum')->postJson("/api/v1/me/workouts/{$workout->id}/exercises", [
            'exercise_id' => 999999,
        ]);

        $response->assertStatus(422);
        $response->assertJsonValidationErrors(['exercise_id']);
    }

    // Workout standalone + program_exercise_id no-null -> 422.
    public function test_standalone_workout_with_program_exercise_id_returns_422(): void
    {
        $user = User::factory()->create();
        $exercise = Exercise::create(['slug' => 'squat', 'name' => 'Squat', 'type' => 'strength']);
        $program = Program::create(['user_id' => $user->id, 'name' => 'Fuerza']);
        $day = $program->days()->create(['name' => 'Día 1', 'position' => 1]);
        $programExercise = $day->exercises()->create(['exercise_id' => $exercise->id, 'position' => 1]);
        $workout = Workout::create(['user_id' => $user->id, 'started_at' => now()]);

        $response = $this->actingAs($user, 'sanctum')->postJson("/api/v1/me/workouts/{$workout->id}/exercises", [
            'exercise_id' => $exercise->id,
            'program_exercise_id' => $programExercise->id,
        ]);

        $response->assertStatus(422);
        $this->assertDatabaseCount('workout_exercises', 0);
    }

    // program_exercise_id ajeno -> 422.
    public function test_program_exercise_id_belonging_to_another_user_returns_422(): void
    {
        $user = User::factory()->create();
        $otherUser = User::factory()->create();
        $exercise = Exercise::create(['slug' => 'squat', 'name' => 'Squat', 'type' => 'strength']);
        $program = Program::create(['user_id' => $user->id, 'name' => 'Propio']);
        $day = $program->days()->create(['name' => 'Día 1', 'position' => 1]);
        $otherProgram = Program::create(['user_id' => $otherUser->id, 'name' => 'Ajeno']);
        $otherDay = $otherProgram->days()->create(['name' => 'Día 1', 'position' => 1]);
        $otherProgramExercise = $otherDay->exercises()->create(['exercise_id' => $exercise->id, 'position' => 1]);
        $workout = Workout::create(['user_id' => $user->id, 'program_day_id' => $day->id, 'started_at' => now()]);

        $response = $this->actingAs($user, 'sanctum')->postJson("/api/v1/me/workouts/{$workout->id}/exercises", [
            'exercise_id' => $exercise->id,
            'program_exercise_id' => $otherProgramExercise->id,
        ]);

        $response->assertStatus(422);
    }

    // PATCH/DELETE con aislamiento entre usuarios -> 404.
    public function test_user_cannot_patch_or_delete_another_users_workout_exercise(): void
    {
        $userA = User::factory()->create();
        $userB = User::factory()->create();
        $exercise = Exercise::create(['slug' => 'squat', 'name' => 'Squat', 'type' => 'strength']);
        $workoutA = Workout::create(['user_id' => $userA->id, 'started_at' => now()]);
        $weA = $workoutA->workoutExercises()->create(['exercise_id' => $exercise->id, 'position' => 1]);

        $this->actingAs($userB, 'sanctum')
            ->patchJson("/api/v1/me/workout-exercises/{$weA->id}", ['position' => 2])
            ->assertStatus(404);

        $this->actingAs($userB, 'sanctum')
            ->deleteJson("/api/v1/me/workout-exercises/{$weA->id}")
            ->assertStatus(404);

        $this->assertDatabaseHas('workout_exercises', ['id' => $weA->id, 'position' => 1]);
    }

    public function test_patch_and_delete_on_own_workout_exercise_succeed(): void
    {
        $user = User::factory()->create();
        $exerciseA = Exercise::create(['slug' => 'squat', 'name' => 'Squat', 'type' => 'strength']);
        $exerciseB = Exercise::create(['slug' => 'bench-press', 'name' => 'Bench Press', 'type' => 'strength']);
        $workout = Workout::create(['user_id' => $user->id, 'started_at' => now()]);
        $we = $workout->workoutExercises()->create(['exercise_id' => $exerciseA->id, 'position' => 1]);

        $patchResponse = $this->actingAs($user, 'sanctum')->patchJson("/api/v1/me/workout-exercises/{$we->id}", [
            'exercise_id' => $exerciseB->id,
        ]);
        $patchResponse->assertOk();
        $patchResponse->assertJsonPath('workout_exercise.exercise_id', $exerciseB->id);

        $deleteResponse = $this->actingAs($user, 'sanctum')->deleteJson("/api/v1/me/workout-exercises/{$we->id}");
        $deleteResponse->assertStatus(204);
        $this->assertDatabaseMissing('workout_exercises', ['id' => $we->id]);
    }

    // Mutación de WorkoutExercise sobre Workout finalizado -> 409.
    public function test_mutating_a_workout_exercise_of_a_finished_workout_returns_409(): void
    {
        $user = User::factory()->create();
        $exercise = Exercise::create(['slug' => 'squat', 'name' => 'Squat', 'type' => 'strength']);
        $workout = Workout::create([
            'user_id' => $user->id,
            'started_at' => '2026-08-26T10:00:00Z',
            'finished_at' => '2026-08-26T11:00:00Z',
        ]);
        $we = $workout->workoutExercises()->create(['exercise_id' => $exercise->id, 'position' => 1]);

        $this->actingAs($user, 'sanctum')
            ->postJson("/api/v1/me/workouts/{$workout->id}/exercises", ['exercise_id' => $exercise->id])
            ->assertStatus(409);

        $this->actingAs($user, 'sanctum')
            ->patchJson("/api/v1/me/workout-exercises/{$we->id}", ['position' => 5])
            ->assertStatus(409);

        $this->actingAs($user, 'sanctum')
            ->deleteJson("/api/v1/me/workout-exercises/{$we->id}")
            ->assertStatus(409);

        $this->assertDatabaseHas('workout_exercises', ['id' => $we->id, 'position' => 1]);
    }
}
