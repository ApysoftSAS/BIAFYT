<?php

namespace Tests\Feature\Api\V1;

use App\Models\Exercise;
use App\Models\Program;
use App\Models\ProgramExercise;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ProgramDayApiTest extends TestCase
{
    use RefreshDatabase;

    // 24. Crear day bajo Program propio -> 201; bajo Program ajeno -> 404.
    public function test_create_day_under_own_program_succeeds_and_under_another_users_program_fails(): void
    {
        $user = User::factory()->create();
        $otherUser = User::factory()->create();
        $ownProgram = Program::create(['user_id' => $user->id, 'name' => 'Propio']);
        $otherProgram = Program::create(['user_id' => $otherUser->id, 'name' => 'Ajeno']);

        $ownResponse = $this->actingAs($user, 'sanctum')->postJson("/api/v1/me/programs/{$ownProgram->id}/days", [
            'name' => 'Día 1',
            'position' => 1,
        ]);
        $ownResponse->assertStatus(201);
        $ownResponse->assertJsonPath('program_day.name', 'Día 1');
        $this->assertDatabaseHas('program_days', ['program_id' => $ownProgram->id, 'name' => 'Día 1']);

        $otherResponse = $this->actingAs($user, 'sanctum')->postJson("/api/v1/me/programs/{$otherProgram->id}/days", [
            'name' => 'Intento',
            'position' => 1,
        ]);
        $otherResponse->assertStatus(404);
        $this->assertDatabaseMissing('program_days', ['program_id' => $otherProgram->id]);
    }

    // 25. position auto-asignada si se omite (MAX+1).
    public function test_position_is_auto_assigned_when_omitted(): void
    {
        $user = User::factory()->create();
        $program = Program::create(['user_id' => $user->id, 'name' => 'Rutina']);

        $first = $this->actingAs($user, 'sanctum')->postJson("/api/v1/me/programs/{$program->id}/days", [
            'name' => 'Día 1',
        ]);
        $first->assertStatus(201);
        $first->assertJsonPath('program_day.position', 1);

        $second = $this->actingAs($user, 'sanctum')->postJson("/api/v1/me/programs/{$program->id}/days", [
            'name' => 'Día 2',
        ]);
        $second->assertStatus(201);
        $second->assertJsonPath('program_day.position', 2);
    }

    // Fix QA: POST con position explícita que colisiona con un day ya
    // existente en BD -> 422 (no 500), sin fila nueva creada.
    public function test_create_day_with_position_conflicting_with_existing_day_returns_422(): void
    {
        $user = User::factory()->create();
        $program = Program::create(['user_id' => $user->id, 'name' => 'Rutina']);
        $program->days()->create(['name' => 'Día 1', 'position' => 1]);

        $response = $this->actingAs($user, 'sanctum')->postJson("/api/v1/me/programs/{$program->id}/days", [
            'name' => 'Día 1 Bis',
            'position' => 1,
        ]);

        $response->assertStatus(422);
        $this->assertSame(1, $program->days()->count());
        $this->assertDatabaseMissing('program_days', ['name' => 'Día 1 Bis']);
    }

    // 26. PATCH con conflicto de position -> 422.
    public function test_patch_with_conflicting_position_returns_422(): void
    {
        $user = User::factory()->create();
        $program = Program::create(['user_id' => $user->id, 'name' => 'Rutina']);
        $dayA = $program->days()->create(['name' => 'Día 1', 'position' => 1]);
        $dayB = $program->days()->create(['name' => 'Día 2', 'position' => 2]);

        $response = $this->actingAs($user, 'sanctum')->patchJson("/api/v1/me/program-days/{$dayB->id}", [
            'position' => 1,
        ]);

        $response->assertStatus(422);
        $this->assertDatabaseHas('program_days', ['id' => $dayA->id, 'position' => 1]);
        $this->assertDatabaseHas('program_days', ['id' => $dayB->id, 'position' => 2]);
    }

    // 27. DELETE -> 204, cascada a sus exercises.
    public function test_delete_day_returns_204_and_cascades_its_exercises(): void
    {
        $user = User::factory()->create();
        $exercise = Exercise::create(['slug' => 'squat', 'name' => 'Squat', 'type' => 'strength']);
        $program = Program::create(['user_id' => $user->id, 'name' => 'Rutina']);
        $day = $program->days()->create(['name' => 'Día 1', 'position' => 1]);
        $day->exercises()->create(['exercise_id' => $exercise->id, 'position' => 1]);

        $response = $this->actingAs($user, 'sanctum')->deleteJson("/api/v1/me/program-days/{$day->id}");

        $response->assertStatus(204);
        $this->assertDatabaseMissing('program_days', ['id' => $day->id]);
        $this->assertSame(0, ProgramExercise::count());
    }

    // 28. Aislamiento entre usuarios en los 3 endpoints (day de A no accesible por B).
    public function test_user_cannot_patch_or_delete_another_users_day(): void
    {
        $userA = User::factory()->create();
        $userB = User::factory()->create();
        $programA = Program::create(['user_id' => $userA->id, 'name' => 'De A']);
        $dayA = $programA->days()->create(['name' => 'Día 1', 'position' => 1]);

        $this->actingAs($userB, 'sanctum')
            ->patchJson("/api/v1/me/program-days/{$dayA->id}", ['name' => 'Hackeado'])
            ->assertStatus(404);

        $this->actingAs($userB, 'sanctum')
            ->deleteJson("/api/v1/me/program-days/{$dayA->id}")
            ->assertStatus(404);

        $this->assertDatabaseHas('program_days', ['id' => $dayA->id, 'name' => 'Día 1']);
    }
}
