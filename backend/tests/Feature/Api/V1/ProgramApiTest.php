<?php

namespace Tests\Feature\Api\V1;

use App\Models\Branch;
use App\Models\Equipment;
use App\Models\Exercise;
use App\Models\Gym;
use App\Models\GymAssignment;
use App\Models\Program;
use App\Models\ProgramExercise;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class ProgramApiTest extends TestCase
{
    use RefreshDatabase;

    // 10. 401 sin auth en cada uno de los 5 endpoints de /me/programs*.
    public function test_all_program_endpoints_reject_unauthenticated_requests(): void
    {
        $user = User::factory()->create();
        $program = Program::create(['user_id' => $user->id, 'name' => 'Fuerza']);

        $this->postJson('/api/v1/me/programs', ['name' => 'X'])->assertStatus(401);
        $this->getJson('/api/v1/me/programs')->assertStatus(401);
        $this->getJson("/api/v1/me/programs/{$program->id}")->assertStatus(401);
        $this->patchJson("/api/v1/me/programs/{$program->id}", ['name' => 'Y'])->assertStatus(401);
        $this->deleteJson("/api/v1/me/programs/{$program->id}")->assertStatus(401);
    }

    // 11. Usuario sin Programs -> GET /me/programs = {"programs":[]}.
    public function test_user_without_programs_gets_an_empty_list(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user, 'sanctum')->getJson('/api/v1/me/programs');

        $response->assertOk();
        $response->assertExactJson(['programs' => []]);
    }

    // 12. Crear Program vacío (sin days) -> 201, "days":[].
    public function test_create_empty_program_without_days(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user, 'sanctum')->postJson('/api/v1/me/programs', [
            'name' => 'Rutina Vacía',
        ]);

        $response->assertStatus(201);
        $response->assertJsonPath('program.name', 'Rutina Vacía');
        $response->assertJsonPath('program.days', []);
        $this->assertDatabaseHas('programs', ['user_id' => $user->id, 'name' => 'Rutina Vacía']);
    }

    // 13. Crear Program con Days sin Exercises -> 201.
    public function test_create_program_with_days_without_exercises(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user, 'sanctum')->postJson('/api/v1/me/programs', [
            'name' => 'Rutina',
            'days' => [
                ['name' => 'Día 1', 'position' => 1],
            ],
        ]);

        $response->assertStatus(201);
        $response->assertJsonPath('program.days.0.name', 'Día 1');
        $response->assertJsonPath('program.days.0.position', 1);
        $response->assertJsonPath('program.days.0.exercises', []);
    }

    // 14. Crear Program con Days y Exercises completos -> 201, shape exacto.
    public function test_create_program_with_full_tree_returns_exact_shape(): void
    {
        $user = User::factory()->create();
        $exerciseA = Exercise::create(['slug' => 'squat', 'name' => 'Squat', 'type' => 'strength']);
        $exerciseB = Exercise::create(['slug' => 'bench-press', 'name' => 'Bench Press', 'type' => 'strength', 'machine_id' => null]);

        $response = $this->actingAs($user, 'sanctum')->postJson('/api/v1/me/programs', [
            'name' => 'Rutina Fuerza 3 días',
            'days' => [
                [
                    'name' => 'Día 1 — Pierna',
                    'position' => 1,
                    'exercises' => [
                        ['exercise_id' => $exerciseA->id, 'position' => 1],
                        ['exercise_id' => $exerciseB->id, 'position' => 2],
                    ],
                ],
            ],
        ]);

        $response->assertStatus(201);

        $program = $response->json('program');
        $this->assertSame(['id', 'name', 'reference_gym', 'created_by', 'imported_at', 'days'], array_keys($program));
        // Plain self-authored program with no gym context: all extra facets are null.
        $this->assertNull($program['reference_gym']);
        $this->assertNull($program['created_by']);
        $this->assertNull($program['imported_at']);
        $this->assertArrayNotHasKey('user_id', $program);
        $this->assertArrayNotHasKey('reference_gym_id', $program);
        $this->assertArrayNotHasKey('created_by_user_id', $program);
        $this->assertArrayNotHasKey('created_at', $program);
        $this->assertArrayNotHasKey('updated_at', $program);

        $day = $program['days'][0];
        $this->assertSame(['id', 'name', 'position', 'exercises'], array_keys($day));
        $this->assertArrayNotHasKey('program_id', $day);
        $this->assertArrayNotHasKey('created_at', $day);
        $this->assertArrayNotHasKey('updated_at', $day);

        $exercise = $day['exercises'][0];
        $this->assertSame(['id', 'position', 'exercise'], array_keys($exercise));
        $this->assertArrayNotHasKey('program_day_id', $exercise);
        $this->assertArrayNotHasKey('exercise_id', $exercise);
        $this->assertArrayNotHasKey('created_at', $exercise);
        $this->assertArrayNotHasKey('updated_at', $exercise);

        $this->assertSame(['id', 'slug', 'name', 'type', 'machine_id'], array_keys($exercise['exercise']));
        $this->assertSame($exerciseA->id, $exercise['exercise']['id']);
        $this->assertSame('squat', $exercise['exercise']['slug']);
    }

    // 15. exercise_id inexistente -> 422.
    public function test_nonexistent_exercise_id_returns_422(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user, 'sanctum')->postJson('/api/v1/me/programs', [
            'name' => 'Rutina',
            'days' => [
                [
                    'name' => 'Día 1',
                    'position' => 1,
                    'exercises' => [
                        ['exercise_id' => 999999, 'position' => 1],
                    ],
                ],
            ],
        ]);

        $response->assertStatus(422);
        $response->assertJsonValidationErrors(['days.0.exercises.0.exercise_id']);
        $this->assertDatabaseCount('programs', 0);
    }

    // 16. Duplicar position dentro del mismo array days -> 422 (rollback).
    public function test_duplicate_position_within_days_returns_422_and_rolls_back(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user, 'sanctum')->postJson('/api/v1/me/programs', [
            'name' => 'Rutina',
            'days' => [
                ['name' => 'Día 1', 'position' => 1],
                ['name' => 'Día 1 Bis', 'position' => 1],
            ],
        ]);

        $response->assertStatus(422);
        $this->assertDatabaseCount('programs', 0);
        $this->assertDatabaseCount('program_days', 0);
    }

    // 17. Duplicar position dentro del mismo array exercises -> 422 (rollback).
    public function test_duplicate_position_within_exercises_returns_422_and_rolls_back(): void
    {
        $user = User::factory()->create();
        $exercise = Exercise::create(['slug' => 'squat', 'name' => 'Squat', 'type' => 'strength']);

        $response = $this->actingAs($user, 'sanctum')->postJson('/api/v1/me/programs', [
            'name' => 'Rutina',
            'days' => [
                [
                    'name' => 'Día 1',
                    'position' => 1,
                    'exercises' => [
                        ['exercise_id' => $exercise->id, 'position' => 1],
                        ['exercise_id' => $exercise->id, 'position' => 1],
                    ],
                ],
            ],
        ]);

        $response->assertStatus(422);
        $this->assertDatabaseCount('programs', 0);
        $this->assertDatabaseCount('program_days', 0);
        $this->assertDatabaseCount('program_exercises', 0);
    }

    // Fix QA: day sin position (auto-asignada) seguido de un day con position
    // explícita que colisiona con la auto-asignada -> 422 (no 500), rollback.
    public function test_auto_assigned_day_position_colliding_with_a_later_explicit_position_returns_422(): void
    {
        $user = User::factory()->create();

        $response = $this->actingAs($user, 'sanctum')->postJson('/api/v1/me/programs', [
            'name' => 'Rutina',
            'days' => [
                ['name' => 'Dia Auto'],
                ['name' => 'Dia Explicit 1', 'position' => 1],
            ],
        ]);

        $response->assertStatus(422);
        $this->assertDatabaseCount('programs', 0);
        $this->assertDatabaseCount('program_days', 0);
    }

    // Fix QA: mismo caso pero a nivel de exercises dentro de un day: exercise
    // sin position (auto-asignada) seguido de otro con position explícita que
    // colisiona -> 422 (no 500), rollback.
    public function test_auto_assigned_exercise_position_colliding_with_a_later_explicit_position_returns_422(): void
    {
        $user = User::factory()->create();
        $exercise = Exercise::create(['slug' => 'squat', 'name' => 'Squat', 'type' => 'strength']);

        $response = $this->actingAs($user, 'sanctum')->postJson('/api/v1/me/programs', [
            'name' => 'Rutina',
            'days' => [
                [
                    'name' => 'Día 1',
                    'position' => 1,
                    'exercises' => [
                        ['exercise_id' => $exercise->id],
                        ['exercise_id' => $exercise->id, 'position' => 1],
                    ],
                ],
            ],
        ]);

        $response->assertStatus(422);
        $this->assertDatabaseCount('programs', 0);
        $this->assertDatabaseCount('program_days', 0);
        $this->assertDatabaseCount('program_exercises', 0);
    }

    // 18. Rollback transaccional: si el segundo day falla validación custom, no se crea nada.
    public function test_transaction_rolls_back_entirely_when_a_later_day_fails_validation(): void
    {
        $user = User::factory()->create();
        $exercise = Exercise::create(['slug' => 'squat', 'name' => 'Squat', 'type' => 'strength']);

        $response = $this->actingAs($user, 'sanctum')->postJson('/api/v1/me/programs', [
            'name' => 'Rutina',
            'days' => [
                [
                    'name' => 'Día 1',
                    'position' => 1,
                    'exercises' => [
                        ['exercise_id' => $exercise->id, 'position' => 1],
                    ],
                ],
                [
                    'name' => 'Día 2',
                    'position' => 2,
                    'exercises' => [
                        ['exercise_id' => $exercise->id, 'position' => 1],
                        ['exercise_id' => $exercise->id, 'position' => 1],
                    ],
                ],
            ],
        ]);

        $response->assertStatus(422);
        $this->assertDatabaseCount('programs', 0);
        $this->assertDatabaseCount('program_days', 0);
        $this->assertDatabaseCount('program_exercises', 0);
    }

    // 19. Usuario A no puede GET/PATCH/DELETE el Program de Usuario B (404 en los tres).
    public function test_user_cannot_access_another_users_program(): void
    {
        $userA = User::factory()->create();
        $userB = User::factory()->create();
        $programA = Program::create(['user_id' => $userA->id, 'name' => 'De A']);
        $programB = Program::create(['user_id' => $userB->id, 'name' => 'De B']);

        $this->actingAs($userA, 'sanctum')
            ->getJson("/api/v1/me/programs/{$programB->id}")
            ->assertStatus(404);

        $this->actingAs($userA, 'sanctum')
            ->patchJson("/api/v1/me/programs/{$programB->id}", ['name' => 'Hackeado'])
            ->assertStatus(404);

        $this->actingAs($userA, 'sanctum')
            ->deleteJson("/api/v1/me/programs/{$programB->id}")
            ->assertStatus(404);

        $this->assertDatabaseHas('programs', ['id' => $programB->id, 'name' => 'De B']);
        $this->assertDatabaseHas('programs', ['id' => $programA->id, 'name' => 'De A']);
    }

    // 20. POST /me/programs con user_id inyectado -> se ignora, pertenece al usuario autenticado.
    public function test_create_program_ignores_a_user_id_in_the_payload(): void
    {
        $user = User::factory()->create();
        $otherUser = User::factory()->create();

        $response = $this->actingAs($user, 'sanctum')->postJson('/api/v1/me/programs', [
            'user_id' => $otherUser->id,
            'name' => 'Rutina',
        ]);

        $response->assertStatus(201);
        $this->assertDatabaseHas('programs', ['user_id' => $user->id, 'name' => 'Rutina']);
        $this->assertDatabaseMissing('programs', ['user_id' => $otherUser->id]);
    }

    // 21. PATCH /me/programs/{id} con name actualiza solo name; si el payload incluye days, se ignoran.
    public function test_patch_program_updates_only_name_and_ignores_days(): void
    {
        $user = User::factory()->create();
        $program = Program::create(['user_id' => $user->id, 'name' => 'Original']);
        $program->days()->create(['name' => 'Día 1', 'position' => 1]);

        $response = $this->actingAs($user, 'sanctum')->patchJson("/api/v1/me/programs/{$program->id}", [
            'name' => 'Actualizado',
            'days' => [
                ['name' => 'Intento Inyectado', 'position' => 99],
            ],
        ]);

        $response->assertOk();
        $response->assertJsonPath('program.name', 'Actualizado');
        $this->assertDatabaseHas('programs', ['id' => $program->id, 'name' => 'Actualizado']);
        $this->assertSame(1, $program->days()->count());
        $this->assertDatabaseHas('program_days', ['program_id' => $program->id, 'name' => 'Día 1']);
        $this->assertDatabaseMissing('program_days', ['name' => 'Intento Inyectado']);
    }

    // 22. DELETE /me/programs/{id} -> 204, cascada verificada por HTTP + assertDatabaseMissing.
    public function test_delete_program_cascades_and_returns_204(): void
    {
        $user = User::factory()->create();
        $exercise = Exercise::create(['slug' => 'squat', 'name' => 'Squat', 'type' => 'strength']);
        $program = Program::create(['user_id' => $user->id, 'name' => 'Rutina']);
        $day = $program->days()->create(['name' => 'Día 1', 'position' => 1]);
        $day->exercises()->create(['exercise_id' => $exercise->id, 'position' => 1]);

        $response = $this->actingAs($user, 'sanctum')->deleteJson("/api/v1/me/programs/{$program->id}");

        $response->assertStatus(204);
        $response->assertNoContent();
        $this->assertDatabaseMissing('programs', ['id' => $program->id]);
        $this->assertDatabaseMissing('program_days', ['id' => $day->id]);
        $this->assertSame(0, ProgramExercise::count());
        $this->assertDatabaseHas('exercises', ['id' => $exercise->id]);
    }

    // 23. Query count razonable en GET /me/programs con datos anidados (evitar N+1).
    public function test_index_uses_eager_loading_to_avoid_n_plus_one(): void
    {
        $user = User::factory()->create();
        $exerciseA = Exercise::create(['slug' => 'squat', 'name' => 'Squat', 'type' => 'strength']);
        $exerciseB = Exercise::create(['slug' => 'bench-press', 'name' => 'Bench Press', 'type' => 'strength']);

        foreach (range(1, 3) as $p) {
            $program = Program::create(['user_id' => $user->id, 'name' => "Rutina {$p}"]);
            $day = $program->days()->create(['name' => 'Día 1', 'position' => 1]);
            $day->exercises()->create(['exercise_id' => $exerciseA->id, 'position' => 1]);
            $day->exercises()->create(['exercise_id' => $exerciseB->id, 'position' => 2]);
        }

        $queryCount = 0;
        DB::listen(function () use (&$queryCount) {
            $queryCount++;
        });

        $response = $this->actingAs($user, 'sanctum')->getJson('/api/v1/me/programs');

        $response->assertOk();

        // 1 query for programs + 1 for days + 1 for exercises + 1 for the
        // catalog exercises + 1 for the reference gyms + 1 for the authors,
        // regardless of how many programs/days there are (still O(1)).
        $this->assertLessThanOrEqual(6, $queryCount);
    }

    // -----------------------------------------------------------------
    // Fase 5: optional reference gym on the athlete's OWN routine.
    // The independent flow is unchanged; a gym is never required.
    // -----------------------------------------------------------------

    public function test_athlete_without_a_gym_or_coach_creates_a_routine_from_the_global_catalog(): void
    {
        $user = User::factory()->create();
        $squat = Exercise::create(['slug' => 'ex-sentadilla', 'name' => 'Sentadilla', 'type' => 'fuerza']);
        $prensa = Exercise::create(['slug' => 'ex-prensa', 'name' => 'Prensa', 'type' => 'fuerza', 'machine_id' => 'm-prensa']);

        $this->actingAs($user)->postJson('/api/v1/me/programs', [
            'name' => 'Independiente',
            'days' => [[
                'name' => 'Día 1', 'position' => 1,
                'exercises' => [
                    ['exercise_id' => $squat->id, 'position' => 1],
                    ['exercise_id' => $prensa->id, 'position' => 2],
                ],
            ]],
        ])->assertStatus(201)->assertJsonPath('program.reference_gym', null);
    }

    public function test_athlete_can_pin_a_routine_to_a_gym_they_are_assigned_to(): void
    {
        $user = User::factory()->create();
        $gym = Gym::create(['name' => 'KAIROS']);
        GymAssignment::create([
            'user_id' => $user->id, 'gym_id' => $gym->id,
            'branch_id' => Branch::create(['gym_id' => $gym->id, 'name' => 'Norte'])->id,
            'role' => GymAssignment::ROLE_MEMBER, 'status' => GymAssignment::STATUS_ACTIVE,
        ]);
        $squat = Exercise::create(['slug' => 'ex-sentadilla', 'name' => 'Sentadilla', 'type' => 'fuerza']);

        $this->actingAs($user)->postJson('/api/v1/me/programs', [
            'name' => 'En mi gym', 'reference_gym_id' => $gym->id,
            'days' => [['name' => 'Día 1', 'position' => 1, 'exercises' => [['exercise_id' => $squat->id, 'position' => 1]]]],
        ])->assertStatus(201)->assertJsonPath('program.reference_gym.id', $gym->id);
    }

    public function test_athlete_cannot_pin_a_routine_to_a_gym_they_are_not_assigned_to(): void
    {
        $user = User::factory()->create();
        $gym = Gym::create(['name' => 'Ajeno']);
        $squat = Exercise::create(['slug' => 'ex-sentadilla', 'name' => 'Sentadilla', 'type' => 'fuerza']);

        $this->actingAs($user)->postJson('/api/v1/me/programs', [
            'name' => 'x', 'reference_gym_id' => $gym->id,
            'days' => [['name' => 'Día 1', 'position' => 1, 'exercises' => [['exercise_id' => $squat->id, 'position' => 1]]]],
        ])->assertStatus(422)->assertJsonValidationErrorFor('reference_gym_id');
    }

    public function test_pinning_to_a_gym_enforces_that_gyms_inventory(): void
    {
        $user = User::factory()->create();
        $gym = Gym::create(['name' => 'KAIROS']);
        GymAssignment::create([
            'user_id' => $user->id, 'gym_id' => $gym->id,
            'branch_id' => Branch::create(['gym_id' => $gym->id, 'name' => 'Norte'])->id,
            'role' => GymAssignment::ROLE_MEMBER, 'status' => GymAssignment::STATUS_ACTIVE,
        ]);
        $prensa = Exercise::create(['slug' => 'ex-prensa', 'name' => 'Prensa', 'type' => 'fuerza', 'machine_id' => 'm-prensa']);
        Equipment::create(['slug' => 'm-prensa', 'name' => 'PRENSA DE PIERNAS']); // exists globally, not in this gym

        $this->actingAs($user)->postJson('/api/v1/me/programs', [
            'name' => 'x', 'reference_gym_id' => $gym->id,
            'days' => [['name' => 'Día 1', 'position' => 1, 'exercises' => [['exercise_id' => $prensa->id, 'position' => 1]]]],
        ])->assertStatus(422)->assertJsonValidationErrorFor('days.0.exercises.0.exercise_id');
    }
}
