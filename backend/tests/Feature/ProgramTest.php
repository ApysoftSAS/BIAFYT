<?php

namespace Tests\Feature;

use App\Models\Exercise;
use App\Models\Program;
use App\Models\ProgramDay;
use App\Models\ProgramExercise;
use App\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ProgramTest extends TestCase
{
    use RefreshDatabase;

    // 1. Program pertenece a user_id; puede tener múltiples Days; Day puede tener múltiples Exercises.
    public function test_program_belongs_to_user_and_can_have_multiple_days_and_exercises(): void
    {
        $user = User::factory()->create();
        $exerciseA = Exercise::create(['slug' => 'squat', 'name' => 'Squat', 'type' => 'strength']);
        $exerciseB = Exercise::create(['slug' => 'bench-press', 'name' => 'Bench Press', 'type' => 'strength']);

        $program = Program::create(['user_id' => $user->id, 'name' => 'Fuerza']);
        $dayA = $program->days()->create(['name' => 'Día 1', 'position' => 1]);
        $dayB = $program->days()->create(['name' => 'Día 2', 'position' => 2]);
        $dayA->exercises()->create(['exercise_id' => $exerciseA->id, 'position' => 1]);
        $dayA->exercises()->create(['exercise_id' => $exerciseB->id, 'position' => 2]);

        $this->assertTrue($program->user->is($user));
        $this->assertSame(2, $program->days()->count());
        $this->assertSame(2, $dayA->exercises()->count());
        $this->assertSame(0, $dayB->exercises()->count());
    }

    // 2. UNIQUE(program_id, position) rechaza duplicado.
    public function test_unique_program_id_position_rejects_duplicate(): void
    {
        $user = User::factory()->create();
        $program = Program::create(['user_id' => $user->id, 'name' => 'Fuerza']);
        $program->days()->create(['name' => 'Día 1', 'position' => 1]);

        $this->expectException(QueryException::class);

        ProgramDay::create(['program_id' => $program->id, 'name' => 'Día 1 Bis', 'position' => 1]);
    }

    // 3. UNIQUE(program_day_id, position) rechaza duplicado.
    public function test_unique_program_day_id_position_rejects_duplicate(): void
    {
        $user = User::factory()->create();
        $exercise = Exercise::create(['slug' => 'squat', 'name' => 'Squat', 'type' => 'strength']);
        $program = Program::create(['user_id' => $user->id, 'name' => 'Fuerza']);
        $day = $program->days()->create(['name' => 'Día 1', 'position' => 1]);
        $day->exercises()->create(['exercise_id' => $exercise->id, 'position' => 1]);

        $this->expectException(QueryException::class);

        ProgramExercise::create(['program_day_id' => $day->id, 'exercise_id' => $exercise->id, 'position' => 1]);
    }

    // 4. Mismo exercise_id permitido dos veces dentro del mismo Day.
    public function test_same_exercise_id_allowed_twice_within_the_same_day(): void
    {
        $user = User::factory()->create();
        $exercise = Exercise::create(['slug' => 'squat', 'name' => 'Squat', 'type' => 'strength']);
        $program = Program::create(['user_id' => $user->id, 'name' => 'Fuerza']);
        $day = $program->days()->create(['name' => 'Día 1', 'position' => 1]);

        $day->exercises()->create(['exercise_id' => $exercise->id, 'position' => 1]);
        $day->exercises()->create(['exercise_id' => $exercise->id, 'position' => 2]);

        $this->assertSame(2, $day->exercises()->where('exercise_id', $exercise->id)->count());
    }

    // 5. Mismo exercise_id permitido en Days distintos.
    public function test_same_exercise_id_allowed_across_different_days(): void
    {
        $user = User::factory()->create();
        $exercise = Exercise::create(['slug' => 'squat', 'name' => 'Squat', 'type' => 'strength']);
        $program = Program::create(['user_id' => $user->id, 'name' => 'Fuerza']);
        $dayA = $program->days()->create(['name' => 'Día 1', 'position' => 1]);
        $dayB = $program->days()->create(['name' => 'Día 2', 'position' => 2]);

        $dayA->exercises()->create(['exercise_id' => $exercise->id, 'position' => 1]);
        $dayB->exercises()->create(['exercise_id' => $exercise->id, 'position' => 1]);

        $this->assertSame(1, $dayA->exercises()->count());
        $this->assertSame(1, $dayB->exercises()->count());
    }

    // 6. Borrar Program borra en cascada Days y ProgramExercises; NO borra el Exercise referenciado.
    public function test_deleting_a_program_cascades_days_and_exercises_but_not_the_catalog_exercise(): void
    {
        $user = User::factory()->create();
        $exercise = Exercise::create(['slug' => 'squat', 'name' => 'Squat', 'type' => 'strength']);
        $program = Program::create(['user_id' => $user->id, 'name' => 'Fuerza']);
        $day = $program->days()->create(['name' => 'Día 1', 'position' => 1]);
        $day->exercises()->create(['exercise_id' => $exercise->id, 'position' => 1]);

        $program->delete();

        $this->assertSame(0, ProgramDay::count());
        $this->assertSame(0, ProgramExercise::count());
        $this->assertSame(1, Exercise::count());
    }

    // 7. Borrar Day borra sus ProgramExercises, no afecta otros Days.
    public function test_deleting_a_day_cascades_its_exercises_and_does_not_affect_other_days(): void
    {
        $user = User::factory()->create();
        $exercise = Exercise::create(['slug' => 'squat', 'name' => 'Squat', 'type' => 'strength']);
        $program = Program::create(['user_id' => $user->id, 'name' => 'Fuerza']);
        $dayA = $program->days()->create(['name' => 'Día 1', 'position' => 1]);
        $dayB = $program->days()->create(['name' => 'Día 2', 'position' => 2]);
        $dayA->exercises()->create(['exercise_id' => $exercise->id, 'position' => 1]);
        $dayB->exercises()->create(['exercise_id' => $exercise->id, 'position' => 1]);

        $dayA->delete();

        $this->assertSame(1, ProgramDay::count());
        $this->assertSame(1, ProgramExercise::count());
        $this->assertSame($dayB->id, ProgramDay::first()->id);
    }

    // 8. Borrar un User borra en cascada sus Programs.
    public function test_deleting_a_user_cascades_their_programs(): void
    {
        $user = User::factory()->create();
        Program::create(['user_id' => $user->id, 'name' => 'Fuerza']);

        $user->delete();

        $this->assertSame(0, Program::count());
    }

    // 9. Program::days()/ProgramDay::exercises() devuelven ordenado por position.
    public function test_days_and_exercises_relations_are_ordered_by_position(): void
    {
        $user = User::factory()->create();
        $exerciseA = Exercise::create(['slug' => 'squat', 'name' => 'Squat', 'type' => 'strength']);
        $exerciseB = Exercise::create(['slug' => 'bench-press', 'name' => 'Bench Press', 'type' => 'strength']);
        $program = Program::create(['user_id' => $user->id, 'name' => 'Fuerza']);

        // Insert out of order to prove sorting is not by insertion/id order.
        $day3 = $program->days()->create(['name' => 'Día 3', 'position' => 3]);
        $day1 = $program->days()->create(['name' => 'Día 1', 'position' => 1]);
        $day2 = $program->days()->create(['name' => 'Día 2', 'position' => 2]);

        $day1->exercises()->create(['exercise_id' => $exerciseB->id, 'position' => 2]);
        $day1->exercises()->create(['exercise_id' => $exerciseA->id, 'position' => 1]);

        $this->assertSame(
            [$day1->id, $day2->id, $day3->id],
            $program->fresh()->days->pluck('id')->all()
        );
        $this->assertSame(
            [$exerciseA->id, $exerciseB->id],
            $day1->fresh()->exercises->pluck('exercise_id')->all()
        );
    }
}
