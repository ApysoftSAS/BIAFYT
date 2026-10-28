<?php

namespace Tests\Feature\Api\V1;

use App\Models\Exercise;
use App\Models\Program;
use App\Models\User;
use App\Models\Workout;
use App\Models\WorkoutExercise;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class WorkoutApiTest extends TestCase
{
    use RefreshDatabase;

    // 401 sin auth en cada uno de los 5 endpoints de /me/workouts*.
    public function test_all_workout_endpoints_reject_unauthenticated_requests(): void
    {
        $user = User::factory()->create();
        $workout = Workout::create(['user_id' => $user->id, 'started_at' => now()]);

        $this->postJson('/api/v1/me/workouts', ['started_at' => now()->toIso8601String()])->assertStatus(401);
        $this->getJson('/api/v1/me/workouts')->assertStatus(401);
        $this->getJson("/api/v1/me/workouts/{$workout->id}")->assertStatus(401);
        $this->patchJson("/api/v1/me/workouts/{$workout->id}", ['finished_at' => now()->toIso8601String()])->assertStatus(401);
        $this->deleteJson("/api/v1/me/workouts/{$workout->id}")->assertStatus(401);
    }

    // Usuario sin Workouts -> GET /me/workouts = {"workouts":[]}.
    public function test_user_without_workouts_gets_an_empty_list(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user, 'sanctum')->getJson('/api/v1/me/workouts');

        $response->assertOk();
        $response->assertExactJson(['workouts' => []]);
    }

    // Crear Workout standalone (sin program_day_id) -> 201.
    public function test_create_standalone_workout(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user, 'sanctum')->postJson('/api/v1/me/workouts', [
            'started_at' => '2026-08-26T10:00:00Z',
        ]);

        $response->assertStatus(201);
        $response->assertJsonPath('workout.program_day_id', null);
        $response->assertJsonPath('workout.finished_at', null);
        $response->assertJsonPath('workout.exercises', []);
        $this->assertDatabaseHas('workouts', ['user_id' => $user->id, 'program_day_id' => null]);
    }

    // Crear Workout válido desde ProgramDay propio -> 201.
    public function test_create_workout_from_own_program_day(): void
    {
        $user = User::factory()->create();
        $program = Program::create(['user_id' => $user->id, 'name' => 'Fuerza']);
        $day = $program->days()->create(['name' => 'Día 1', 'position' => 1]);

        $response = $this->actingAs($user, 'sanctum')->postJson('/api/v1/me/workouts', [
            'program_day_id' => $day->id,
            'started_at' => '2026-08-26T10:00:00Z',
        ]);

        $response->assertStatus(201);
        $response->assertJsonPath('workout.program_day_id', $day->id);
        $this->assertDatabaseHas('workouts', ['user_id' => $user->id, 'program_day_id' => $day->id]);
    }

    // Creación anidada completa Workout -> WorkoutExercise -> ExercisePerformance, shape exacto.
    public function test_create_nested_workout_with_exercises_and_performances_returns_exact_shape(): void
    {
        $user = User::factory()->create();
        $program = Program::create(['user_id' => $user->id, 'name' => 'Fuerza']);
        $day = $program->days()->create(['name' => 'Día 1', 'position' => 1]);
        $exerciseA = Exercise::create(['slug' => 'squat', 'name' => 'Squat', 'type' => 'strength', 'machine_id' => null]);
        $programExercise = $day->exercises()->create(['exercise_id' => $exerciseA->id, 'position' => 1]);

        $response = $this->actingAs($user, 'sanctum')->postJson('/api/v1/me/workouts', [
            'program_day_id' => $day->id,
            'started_at' => '2026-08-26T10:00:00Z',
            'exercises' => [
                [
                    'exercise_id' => $exerciseA->id,
                    'program_exercise_id' => $programExercise->id,
                    'position' => 1,
                    'performances' => [
                        ['set_number' => 1, 'reps' => 8, 'load' => 60, 'rpe' => 7.5],
                    ],
                ],
            ],
        ]);

        $response->assertStatus(201);

        $workout = $response->json('workout');
        $this->assertSame(['id', 'program_day_id', 'started_at', 'finished_at', 'exercises'], array_keys($workout));
        $this->assertArrayNotHasKey('user_id', $workout);
        $this->assertArrayNotHasKey('created_at', $workout);
        $this->assertArrayNotHasKey('updated_at', $workout);

        $exercise = $workout['exercises'][0];
        $this->assertSame(['id', 'exercise_id', 'program_exercise_id', 'position', 'exercise', 'performances'], array_keys($exercise));
        $this->assertSame($exerciseA->id, $exercise['exercise_id']);
        $this->assertSame($programExercise->id, $exercise['program_exercise_id']);
        $this->assertSame(['id', 'slug', 'name', 'type', 'machine_id'], array_keys($exercise['exercise']));

        $performance = $exercise['performances'][0];
        $this->assertSame(['id', 'set_number', 'reps', 'load', 'duration_seconds', 'rpe'], array_keys($performance));
        $this->assertSame(1, $performance['set_number']);
        $this->assertSame(8, $performance['reps']);
        $this->assertEquals(60.0, $performance['load']);
        $this->assertEquals(7.5, $performance['rpe']);
        $this->assertNull($performance['duration_seconds']);

        $this->assertDatabaseCount('workouts', 1);
        $this->assertDatabaseCount('workout_exercises', 1);
        $this->assertDatabaseCount('exercise_performances', 1);
    }

    // exercise_id inexistente -> 422, rollback completo.
    public function test_nonexistent_exercise_id_returns_422_and_rolls_back(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user, 'sanctum')->postJson('/api/v1/me/workouts', [
            'started_at' => '2026-08-26T10:00:00Z',
            'exercises' => [
                ['exercise_id' => 999999, 'position' => 1],
            ],
        ]);

        $response->assertStatus(422);
        $response->assertJsonValidationErrors(['exercises.0.exercise_id']);
        $this->assertDatabaseCount('workouts', 0);
    }

    // Duplicar position dentro del mismo array exercises -> 422, rollback completo.
    public function test_duplicate_position_within_exercises_returns_422_and_rolls_back(): void
    {
        $user = User::factory()->create();
        $exercise = Exercise::create(['slug' => 'squat', 'name' => 'Squat', 'type' => 'strength']);

        $response = $this->actingAs($user, 'sanctum')->postJson('/api/v1/me/workouts', [
            'started_at' => '2026-08-26T10:00:00Z',
            'exercises' => [
                ['exercise_id' => $exercise->id, 'position' => 1],
                ['exercise_id' => $exercise->id, 'position' => 1],
            ],
        ]);

        $response->assertStatus(422);
        $this->assertDatabaseCount('workouts', 0);
        $this->assertDatabaseCount('workout_exercises', 0);
    }

    // set_number duplicado en payload anidado -> 422, rollback completo.
    public function test_duplicate_set_number_within_performances_returns_422_and_rolls_back(): void
    {
        $user = User::factory()->create();
        $exercise = Exercise::create(['slug' => 'squat', 'name' => 'Squat', 'type' => 'strength']);

        $response = $this->actingAs($user, 'sanctum')->postJson('/api/v1/me/workouts', [
            'started_at' => '2026-08-26T10:00:00Z',
            'exercises' => [
                [
                    'exercise_id' => $exercise->id,
                    'position' => 1,
                    'performances' => [
                        ['set_number' => 1, 'reps' => 8],
                        ['set_number' => 1, 'reps' => 6],
                    ],
                ],
            ],
        ]);

        $response->assertStatus(422);
        $this->assertDatabaseCount('workouts', 0);
        $this->assertDatabaseCount('workout_exercises', 0);
        $this->assertDatabaseCount('exercise_performances', 0);
    }

    // Bug de QA: performances sin set_number explícito antes de una con set_number
    // explícito debe respetar el orden de envío del cliente al auto-asignar, no el
    // orden reordenado por $request->validated() -> conflicto -> 422, rollback total.
    public function test_auto_assigned_set_number_conflicting_with_a_later_explicit_set_number_returns_422(): void
    {
        $user = User::factory()->create();
        $exercise = Exercise::create(['slug' => 'squat', 'name' => 'Squat', 'type' => 'strength']);

        $response = $this->actingAs($user, 'sanctum')->postJson('/api/v1/me/workouts', [
            'started_at' => '2026-08-27T10:00:00Z',
            'exercises' => [
                [
                    'exercise_id' => $exercise->id,
                    'position' => 1,
                    'performances' => [
                        ['reps' => 1],
                        ['reps' => 2],
                        ['set_number' => 1, 'reps' => 3],
                    ],
                ],
            ],
        ]);

        $response->assertStatus(422);
        $this->assertDatabaseCount('workouts', 0);
        $this->assertDatabaseCount('workout_exercises', 0);
        $this->assertDatabaseCount('exercise_performances', 0);
    }

    // Contraparte válida: mismo tipo de mezcla auto/explícito pero sin conflicto,
    // debe crearse en el orden semántico en que el cliente envió cada performance.
    public function test_mixed_auto_and_explicit_set_numbers_without_conflict_are_created_in_client_order(): void
    {
        $user = User::factory()->create();
        $exercise = Exercise::create(['slug' => 'squat', 'name' => 'Squat', 'type' => 'strength']);

        $response = $this->actingAs($user, 'sanctum')->postJson('/api/v1/me/workouts', [
            'started_at' => '2026-08-27T10:00:00Z',
            'exercises' => [
                [
                    'exercise_id' => $exercise->id,
                    'position' => 1,
                    'performances' => [
                        ['set_number' => 1, 'reps' => 1],
                        ['reps' => 2],
                        ['reps' => 3],
                    ],
                ],
            ],
        ]);

        $response->assertStatus(201);

        $performances = $response->json('workout.exercises.0.performances');
        $this->assertSame([1, 2, 3], array_column($performances, 'set_number'));
        $this->assertSame([1, 2, 3], array_column($performances, 'reps'));
        $this->assertDatabaseCount('exercise_performances', 3);
    }

    // Auto-assigned exercise position colliding with a later explicit position -> 422 (no 500), rollback.
    public function test_auto_assigned_exercise_position_colliding_with_a_later_explicit_position_returns_422(): void
    {
        $user = User::factory()->create();
        $exercise = Exercise::create(['slug' => 'squat', 'name' => 'Squat', 'type' => 'strength']);

        $response = $this->actingAs($user, 'sanctum')->postJson('/api/v1/me/workouts', [
            'started_at' => '2026-08-26T10:00:00Z',
            'exercises' => [
                ['exercise_id' => $exercise->id],
                ['exercise_id' => $exercise->id, 'position' => 1],
            ],
        ]);

        $response->assertStatus(422);
        $this->assertDatabaseCount('workouts', 0);
        $this->assertDatabaseCount('workout_exercises', 0);
    }

    // program_day_id de otro usuario -> 422.
    public function test_program_day_id_belonging_to_another_user_returns_422(): void
    {
        $user = User::factory()->create();
        $otherUser = User::factory()->create();
        $otherProgram = Program::create(['user_id' => $otherUser->id, 'name' => 'Ajeno']);
        $otherDay = $otherProgram->days()->create(['name' => 'Día 1', 'position' => 1]);

        $response = $this->actingAs($user, 'sanctum')->postJson('/api/v1/me/workouts', [
            'program_day_id' => $otherDay->id,
            'started_at' => '2026-08-26T10:00:00Z',
        ]);

        $response->assertStatus(422);
        $response->assertJsonValidationErrors(['program_day_id']);
        $this->assertDatabaseCount('workouts', 0);
    }

    // program_exercise_id de otro usuario -> 422.
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

        $response = $this->actingAs($user, 'sanctum')->postJson('/api/v1/me/workouts', [
            'program_day_id' => $day->id,
            'started_at' => '2026-08-26T10:00:00Z',
            'exercises' => [
                ['exercise_id' => $exercise->id, 'program_exercise_id' => $otherProgramExercise->id, 'position' => 1],
            ],
        ]);

        $response->assertStatus(422);
        $this->assertDatabaseCount('workouts', 0);
    }

    // program_exercise_id fuera del ProgramDay indicado -> 422.
    public function test_program_exercise_id_outside_the_indicated_program_day_returns_422(): void
    {
        $user = User::factory()->create();
        $exercise = Exercise::create(['slug' => 'squat', 'name' => 'Squat', 'type' => 'strength']);
        $program = Program::create(['user_id' => $user->id, 'name' => 'Propio']);
        $dayA = $program->days()->create(['name' => 'Día 1', 'position' => 1]);
        $dayB = $program->days()->create(['name' => 'Día 2', 'position' => 2]);
        $programExerciseInDayB = $dayB->exercises()->create(['exercise_id' => $exercise->id, 'position' => 1]);

        $response = $this->actingAs($user, 'sanctum')->postJson('/api/v1/me/workouts', [
            'program_day_id' => $dayA->id,
            'started_at' => '2026-08-26T10:00:00Z',
            'exercises' => [
                ['exercise_id' => $exercise->id, 'program_exercise_id' => $programExerciseInDayB->id, 'position' => 1],
            ],
        ]);

        $response->assertStatus(422);
        $this->assertDatabaseCount('workouts', 0);
    }

    // exercise_id distinto al del ProgramExercise referenciado -> 422.
    public function test_exercise_id_mismatch_with_referenced_program_exercise_returns_422(): void
    {
        $user = User::factory()->create();
        $exerciseA = Exercise::create(['slug' => 'squat', 'name' => 'Squat', 'type' => 'strength']);
        $exerciseB = Exercise::create(['slug' => 'bench-press', 'name' => 'Bench Press', 'type' => 'strength']);
        $program = Program::create(['user_id' => $user->id, 'name' => 'Propio']);
        $day = $program->days()->create(['name' => 'Día 1', 'position' => 1]);
        $programExercise = $day->exercises()->create(['exercise_id' => $exerciseA->id, 'position' => 1]);

        $response = $this->actingAs($user, 'sanctum')->postJson('/api/v1/me/workouts', [
            'program_day_id' => $day->id,
            'started_at' => '2026-08-26T10:00:00Z',
            'exercises' => [
                ['exercise_id' => $exerciseB->id, 'program_exercise_id' => $programExercise->id, 'position' => 1],
            ],
        ]);

        $response->assertStatus(422);
        $this->assertDatabaseCount('workouts', 0);
    }

    // Workout standalone + program_exercise_id no-null en algún exercise -> 422.
    public function test_standalone_workout_with_a_non_null_program_exercise_id_returns_422(): void
    {
        $user = User::factory()->create();
        $exercise = Exercise::create(['slug' => 'squat', 'name' => 'Squat', 'type' => 'strength']);
        $program = Program::create(['user_id' => $user->id, 'name' => 'Propio']);
        $day = $program->days()->create(['name' => 'Día 1', 'position' => 1]);
        $programExercise = $day->exercises()->create(['exercise_id' => $exercise->id, 'position' => 1]);

        $response = $this->actingAs($user, 'sanctum')->postJson('/api/v1/me/workouts', [
            'started_at' => '2026-08-26T10:00:00Z',
            'exercises' => [
                ['exercise_id' => $exercise->id, 'program_exercise_id' => $programExercise->id, 'position' => 1],
            ],
        ]);

        $response->assertStatus(422);
        $this->assertDatabaseCount('workouts', 0);
    }

    // Rangos inválidos de reps/load/duration_seconds/rpe -> 422.
    public function test_invalid_performance_ranges_return_422(): void
    {
        $user = User::factory()->create();
        $exercise = Exercise::create(['slug' => 'squat', 'name' => 'Squat', 'type' => 'strength']);

        $response = $this->actingAs($user, 'sanctum')->postJson('/api/v1/me/workouts', [
            'started_at' => '2026-08-26T10:00:00Z',
            'exercises' => [
                [
                    'exercise_id' => $exercise->id,
                    'position' => 1,
                    'performances' => [
                        ['set_number' => 1, 'reps' => -1, 'load' => -5, 'duration_seconds' => -1, 'rpe' => 11],
                    ],
                ],
            ],
        ]);

        $response->assertStatus(422);
        $response->assertJsonValidationErrors([
            'exercises.0.performances.0.reps',
            'exercises.0.performances.0.load',
            'exercises.0.performances.0.duration_seconds',
            'exercises.0.performances.0.rpe',
        ]);
        $this->assertDatabaseCount('workouts', 0);
    }

    // finished_at anterior a started_at -> 422.
    public function test_finished_at_before_started_at_returns_422_on_create(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user, 'sanctum')->postJson('/api/v1/me/workouts', [
            'started_at' => '2026-08-26T10:00:00Z',
            'finished_at' => '2026-08-26T09:00:00Z',
        ]);

        $response->assertStatus(422);
        $response->assertJsonValidationErrors(['finished_at']);
        $this->assertDatabaseCount('workouts', 0);
    }

    // Usuario A no puede GET/PATCH/DELETE el Workout de Usuario B (404 en los tres).
    public function test_user_cannot_access_another_users_workout(): void
    {
        $userA = User::factory()->create();
        $userB = User::factory()->create();
        $workoutB = Workout::create(['user_id' => $userB->id, 'started_at' => now()]);

        $this->actingAs($userA, 'sanctum')
            ->getJson("/api/v1/me/workouts/{$workoutB->id}")
            ->assertStatus(404);

        $this->actingAs($userA, 'sanctum')
            ->patchJson("/api/v1/me/workouts/{$workoutB->id}", ['finished_at' => now()->toIso8601String()])
            ->assertStatus(404);

        $this->actingAs($userA, 'sanctum')
            ->deleteJson("/api/v1/me/workouts/{$workoutB->id}")
            ->assertStatus(404);

        $this->assertDatabaseHas('workouts', ['id' => $workoutB->id]);
    }

    // POST /me/workouts con user_id inyectado -> se ignora, pertenece al usuario autenticado.
    public function test_create_workout_ignores_a_user_id_in_the_payload(): void
    {
        $user = User::factory()->create();
        $otherUser = User::factory()->create();

        $response = $this->actingAs($user, 'sanctum')->postJson('/api/v1/me/workouts', [
            'user_id' => $otherUser->id,
            'started_at' => '2026-08-26T10:00:00Z',
        ]);

        $response->assertStatus(201);
        $this->assertDatabaseHas('workouts', ['user_id' => $user->id]);
        $this->assertDatabaseMissing('workouts', ['user_id' => $otherUser->id]);
    }

    // PATCH abierto: actualiza started_at/finished_at.
    public function test_patch_open_workout_updates_started_at_and_finished_at(): void
    {
        $user = User::factory()->create();
        $workout = Workout::create(['user_id' => $user->id, 'started_at' => '2026-08-26T10:00:00Z']);

        $response = $this->actingAs($user, 'sanctum')->patchJson("/api/v1/me/workouts/{$workout->id}", [
            'finished_at' => '2026-08-26T11:00:00Z',
        ]);

        $response->assertOk();
        $response->assertJsonPath('workout.finished_at', fn ($value) => $value !== null);
        $this->assertNotNull($workout->fresh()->finished_at);
    }

    // finished_at anterior a started_at en PATCH -> 422.
    public function test_patch_finished_at_before_started_at_returns_422(): void
    {
        $user = User::factory()->create();
        $workout = Workout::create(['user_id' => $user->id, 'started_at' => '2026-08-26T10:00:00Z']);

        $response = $this->actingAs($user, 'sanctum')->patchJson("/api/v1/me/workouts/{$workout->id}", [
            'finished_at' => '2026-08-26T09:00:00Z',
        ]);

        $response->assertStatus(422);
        $this->assertNull($workout->fresh()->finished_at);
    }

    // Mutación (PATCH/DELETE) sobre Workout finalizado -> 409, sin importar el payload.
    public function test_mutating_a_finished_workout_returns_409(): void
    {
        $user = User::factory()->create();
        $workout = Workout::create([
            'user_id' => $user->id,
            'started_at' => '2026-08-26T10:00:00Z',
            'finished_at' => '2026-08-26T11:00:00Z',
        ]);

        // Even an invalid payload still 409s, not 422 — the state guard runs first.
        $this->actingAs($user, 'sanctum')
            ->patchJson("/api/v1/me/workouts/{$workout->id}", ['started_at' => 'not-a-date'])
            ->assertStatus(409);

        $this->actingAs($user, 'sanctum')
            ->deleteJson("/api/v1/me/workouts/{$workout->id}")
            ->assertStatus(409);

        $this->assertDatabaseHas('workouts', ['id' => $workout->id]);
    }

    // No hay forma de reabrir un Workout finalizado.
    public function test_a_finished_workout_cannot_be_reopened(): void
    {
        $user = User::factory()->create();
        $workout = Workout::create([
            'user_id' => $user->id,
            'started_at' => '2026-08-26T10:00:00Z',
            'finished_at' => '2026-08-26T11:00:00Z',
        ]);

        $this->actingAs($user, 'sanctum')
            ->patchJson("/api/v1/me/workouts/{$workout->id}", ['finished_at' => null])
            ->assertStatus(409);

        $this->assertNotNull($workout->fresh()->finished_at);
    }

    // DELETE sobre Workout abierto -> 204, cascada real.
    public function test_delete_open_workout_cascades_and_returns_204(): void
    {
        $user = User::factory()->create();
        $exercise = Exercise::create(['slug' => 'squat', 'name' => 'Squat', 'type' => 'strength']);
        $workout = Workout::create(['user_id' => $user->id, 'started_at' => now()]);
        $we = $workout->workoutExercises()->create(['exercise_id' => $exercise->id, 'position' => 1]);
        $we->performances()->create(['set_number' => 1, 'reps' => 8]);

        $response = $this->actingAs($user, 'sanctum')->deleteJson("/api/v1/me/workouts/{$workout->id}");

        $response->assertStatus(204);
        $this->assertDatabaseMissing('workouts', ['id' => $workout->id]);
        $this->assertSame(0, WorkoutExercise::count());
        $this->assertDatabaseHas('exercises', ['id' => $exercise->id]);
    }

    // Cambios posteriores en Program/ProgramDay no alteran el snapshot de un Workout ya creado.
    public function test_deleting_the_referenced_program_day_after_workout_creation_keeps_the_snapshot_intact(): void
    {
        $user = User::factory()->create();
        $exercise = Exercise::create(['slug' => 'squat', 'name' => 'Squat', 'type' => 'strength']);
        $program = Program::create(['user_id' => $user->id, 'name' => 'Fuerza']);
        $day = $program->days()->create(['name' => 'Día 1', 'position' => 1]);
        $programExercise = $day->exercises()->create(['exercise_id' => $exercise->id, 'position' => 1]);

        $createResponse = $this->actingAs($user, 'sanctum')->postJson('/api/v1/me/workouts', [
            'program_day_id' => $day->id,
            'started_at' => '2026-08-26T10:00:00Z',
            'exercises' => [
                ['exercise_id' => $exercise->id, 'program_exercise_id' => $programExercise->id, 'position' => 1],
            ],
        ]);
        $workoutId = $createResponse->json('workout.id');

        $day->delete();

        $showResponse = $this->actingAs($user, 'sanctum')->getJson("/api/v1/me/workouts/{$workoutId}");
        $showResponse->assertOk();
        $showResponse->assertJsonPath('workout.program_day_id', null);
        $showResponse->assertJsonPath('workout.exercises.0.exercise_id', $exercise->id);
        $showResponse->assertJsonPath('workout.exercises.0.program_exercise_id', null);
        $showResponse->assertJsonPath('workout.exercises.0.position', 1);
    }

    // Query count razonable en GET /me/workouts con datos anidados (evitar N+1).
    public function test_index_uses_eager_loading_to_avoid_n_plus_one(): void
    {
        $user = User::factory()->create();
        $exerciseA = Exercise::create(['slug' => 'squat', 'name' => 'Squat', 'type' => 'strength']);
        $exerciseB = Exercise::create(['slug' => 'bench-press', 'name' => 'Bench Press', 'type' => 'strength']);

        foreach (range(1, 3) as $i) {
            $workout = Workout::create(['user_id' => $user->id, 'started_at' => now()]);
            $we = $workout->workoutExercises()->create(['exercise_id' => $exerciseA->id, 'position' => 1]);
            $workout->workoutExercises()->create(['exercise_id' => $exerciseB->id, 'position' => 2]);
            $we->performances()->create(['set_number' => 1, 'reps' => 8]);
        }

        $queryCount = 0;
        DB::listen(function () use (&$queryCount) {
            $queryCount++;
        });

        $response = $this->actingAs($user, 'sanctum')->getJson('/api/v1/me/workouts');

        $response->assertOk();

        // 1 query for workouts + 1 for workout_exercises + 1 for the catalog
        // exercises + 1 for performances, regardless of how many rows exist.
        $this->assertLessThanOrEqual(4, $queryCount);
    }
}
