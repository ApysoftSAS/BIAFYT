<?php

namespace Tests\Feature\Api\V1;

use App\Models\Exercise;
use App\Models\ExercisePerformance;
use App\Models\User;
use App\Models\Workout;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ExercisePerformanceApiTest extends TestCase
{
    use RefreshDatabase;

    // 401 sin auth.
    public function test_all_exercise_performance_endpoints_reject_unauthenticated_requests(): void
    {
        $user = User::factory()->create();
        $exercise = Exercise::create(['slug' => 'squat', 'name' => 'Squat', 'type' => 'strength']);
        $workout = Workout::create(['user_id' => $user->id, 'started_at' => now()]);
        $we = $workout->workoutExercises()->create(['exercise_id' => $exercise->id, 'position' => 1]);
        $performance = $we->performances()->create(['set_number' => 1, 'reps' => 8]);

        $this->postJson("/api/v1/me/workout-exercises/{$we->id}/performances", ['reps' => 8])->assertStatus(401);
        $this->patchJson("/api/v1/me/exercise-performances/{$performance->id}", ['reps' => 5])->assertStatus(401);
        $this->deleteJson("/api/v1/me/exercise-performances/{$performance->id}")->assertStatus(401);
    }

    // Crear performance bajo WorkoutExercise propio -> 201; bajo ajeno -> 404.
    public function test_create_performance_under_own_workout_exercise_succeeds_and_under_another_users_fails(): void
    {
        $user = User::factory()->create();
        $otherUser = User::factory()->create();
        $exercise = Exercise::create(['slug' => 'squat', 'name' => 'Squat', 'type' => 'strength']);

        $ownWorkout = Workout::create(['user_id' => $user->id, 'started_at' => now()]);
        $ownWe = $ownWorkout->workoutExercises()->create(['exercise_id' => $exercise->id, 'position' => 1]);

        $otherWorkout = Workout::create(['user_id' => $otherUser->id, 'started_at' => now()]);
        $otherWe = $otherWorkout->workoutExercises()->create(['exercise_id' => $exercise->id, 'position' => 1]);

        $ownResponse = $this->actingAs($user, 'sanctum')->postJson("/api/v1/me/workout-exercises/{$ownWe->id}/performances", [
            'set_number' => 1,
            'reps' => 8,
            'load' => 60,
        ]);
        $ownResponse->assertStatus(201);
        $ownResponse->assertJsonPath('exercise_performance.set_number', 1);
        $this->assertDatabaseHas('exercise_performances', ['workout_exercise_id' => $ownWe->id, 'reps' => 8]);

        $otherResponse = $this->actingAs($user, 'sanctum')->postJson("/api/v1/me/workout-exercises/{$otherWe->id}/performances", [
            'set_number' => 1,
            'reps' => 8,
        ]);
        $otherResponse->assertStatus(404);
        $this->assertDatabaseMissing('exercise_performances', ['workout_exercise_id' => $otherWe->id]);
    }

    // set_number auto-asignado si se omite (MAX+1).
    public function test_set_number_is_auto_assigned_when_omitted(): void
    {
        $user = User::factory()->create();
        $exercise = Exercise::create(['slug' => 'squat', 'name' => 'Squat', 'type' => 'strength']);
        $workout = Workout::create(['user_id' => $user->id, 'started_at' => now()]);
        $we = $workout->workoutExercises()->create(['exercise_id' => $exercise->id, 'position' => 1]);

        $first = $this->actingAs($user, 'sanctum')->postJson("/api/v1/me/workout-exercises/{$we->id}/performances", [
            'reps' => 8,
        ]);
        $first->assertStatus(201);
        $first->assertJsonPath('exercise_performance.set_number', 1);

        $second = $this->actingAs($user, 'sanctum')->postJson("/api/v1/me/workout-exercises/{$we->id}/performances", [
            'reps' => 6,
        ]);
        $second->assertStatus(201);
        $second->assertJsonPath('exercise_performance.set_number', 2);
    }

    // set_number duplicado -> 422 (no 500), sin fila nueva creada.
    public function test_create_performance_with_conflicting_set_number_returns_422(): void
    {
        $user = User::factory()->create();
        $exercise = Exercise::create(['slug' => 'squat', 'name' => 'Squat', 'type' => 'strength']);
        $workout = Workout::create(['user_id' => $user->id, 'started_at' => now()]);
        $we = $workout->workoutExercises()->create(['exercise_id' => $exercise->id, 'position' => 1]);
        $we->performances()->create(['set_number' => 1, 'reps' => 8]);

        $response = $this->actingAs($user, 'sanctum')->postJson("/api/v1/me/workout-exercises/{$we->id}/performances", [
            'set_number' => 1,
            'reps' => 5,
        ]);

        $response->assertStatus(422);
        $this->assertSame(1, $we->performances()->count());
    }

    // Rangos inválidos de reps/load/duration_seconds/rpe -> 422.
    public function test_invalid_ranges_return_422(): void
    {
        $user = User::factory()->create();
        $exercise = Exercise::create(['slug' => 'squat', 'name' => 'Squat', 'type' => 'strength']);
        $workout = Workout::create(['user_id' => $user->id, 'started_at' => now()]);
        $we = $workout->workoutExercises()->create(['exercise_id' => $exercise->id, 'position' => 1]);

        $response = $this->actingAs($user, 'sanctum')->postJson("/api/v1/me/workout-exercises/{$we->id}/performances", [
            'reps' => -1,
            'load' => -10,
            'duration_seconds' => -1,
            'rpe' => 15,
        ]);

        $response->assertStatus(422);
        $response->assertJsonValidationErrors(['reps', 'load', 'duration_seconds', 'rpe']);
        $this->assertDatabaseCount('exercise_performances', 0);
    }

    // PATCH/DELETE con aislamiento entre usuarios -> 404.
    public function test_user_cannot_patch_or_delete_another_users_performance(): void
    {
        $userA = User::factory()->create();
        $userB = User::factory()->create();
        $exercise = Exercise::create(['slug' => 'squat', 'name' => 'Squat', 'type' => 'strength']);
        $workoutA = Workout::create(['user_id' => $userA->id, 'started_at' => now()]);
        $weA = $workoutA->workoutExercises()->create(['exercise_id' => $exercise->id, 'position' => 1]);
        $performanceA = $weA->performances()->create(['set_number' => 1, 'reps' => 8]);

        $this->actingAs($userB, 'sanctum')
            ->patchJson("/api/v1/me/exercise-performances/{$performanceA->id}", ['reps' => 1])
            ->assertStatus(404);

        $this->actingAs($userB, 'sanctum')
            ->deleteJson("/api/v1/me/exercise-performances/{$performanceA->id}")
            ->assertStatus(404);

        $this->assertDatabaseHas('exercise_performances', ['id' => $performanceA->id, 'reps' => 8]);
    }

    public function test_patch_and_delete_on_own_performance_succeed(): void
    {
        $user = User::factory()->create();
        $exercise = Exercise::create(['slug' => 'squat', 'name' => 'Squat', 'type' => 'strength']);
        $workout = Workout::create(['user_id' => $user->id, 'started_at' => now()]);
        $we = $workout->workoutExercises()->create(['exercise_id' => $exercise->id, 'position' => 1]);
        $performance = $we->performances()->create(['set_number' => 1, 'reps' => 8]);

        $patchResponse = $this->actingAs($user, 'sanctum')->patchJson("/api/v1/me/exercise-performances/{$performance->id}", [
            'reps' => 10,
            'rpe' => 8.5,
        ]);
        $patchResponse->assertOk();
        $patchResponse->assertJsonPath('exercise_performance.reps', 10);
        $patchResponse->assertJsonPath('exercise_performance.rpe', 8.5);

        $deleteResponse = $this->actingAs($user, 'sanctum')->deleteJson("/api/v1/me/exercise-performances/{$performance->id}");
        $deleteResponse->assertStatus(204);
        $this->assertDatabaseMissing('exercise_performances', ['id' => $performance->id]);
    }

    // Mutación de ExercisePerformance sobre Workout finalizado -> 409.
    public function test_mutating_a_performance_of_a_finished_workout_returns_409(): void
    {
        $user = User::factory()->create();
        $exercise = Exercise::create(['slug' => 'squat', 'name' => 'Squat', 'type' => 'strength']);
        $workout = Workout::create([
            'user_id' => $user->id,
            'started_at' => '2026-08-26T10:00:00Z',
            'finished_at' => '2026-08-26T11:00:00Z',
        ]);
        $we = $workout->workoutExercises()->create(['exercise_id' => $exercise->id, 'position' => 1]);
        $performance = $we->performances()->create(['set_number' => 1, 'reps' => 8]);

        $this->actingAs($user, 'sanctum')
            ->postJson("/api/v1/me/workout-exercises/{$we->id}/performances", ['reps' => 5])
            ->assertStatus(409);

        $this->actingAs($user, 'sanctum')
            ->patchJson("/api/v1/me/exercise-performances/{$performance->id}", ['reps' => 5])
            ->assertStatus(409);

        $this->actingAs($user, 'sanctum')
            ->deleteJson("/api/v1/me/exercise-performances/{$performance->id}")
            ->assertStatus(409);

        $this->assertDatabaseHas('exercise_performances', ['id' => $performance->id, 'reps' => 8]);
    }

    // JSON no expone timestamps ni FKs internas no listadas.
    public function test_performance_json_shape_hides_internal_fields(): void
    {
        $user = User::factory()->create();
        $exercise = Exercise::create(['slug' => 'squat', 'name' => 'Squat', 'type' => 'strength']);
        $workout = Workout::create(['user_id' => $user->id, 'started_at' => now()]);
        $we = $workout->workoutExercises()->create(['exercise_id' => $exercise->id, 'position' => 1]);

        $response = $this->actingAs($user, 'sanctum')->postJson("/api/v1/me/workout-exercises/{$we->id}/performances", [
            'set_number' => 1,
            'reps' => 8,
            'load' => 60,
            'rpe' => 7.5,
        ]);

        $response->assertStatus(201);
        $performance = $response->json('exercise_performance');
        $this->assertSame(['id', 'set_number', 'reps', 'load', 'duration_seconds', 'rpe'], array_keys($performance));
        $this->assertArrayNotHasKey('workout_exercise_id', $performance);
        $this->assertArrayNotHasKey('created_at', $performance);
        $this->assertArrayNotHasKey('updated_at', $performance);
    }
}
