<?php

namespace Tests\Feature;

use App\Models\Exercise;
use App\Models\ExercisePerformance;
use App\Models\Program;
use App\Models\ProgramDay;
use App\Models\ProgramExercise;
use App\Models\User;
use App\Models\Workout;
use App\Models\WorkoutExercise;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

class WorkoutTest extends TestCase
{
    use RefreshDatabase;

    // 1. Workout pertenece a user_id; puede tener múltiples WorkoutExercises; WorkoutExercise puede tener múltiples ExercisePerformances.
    public function test_workout_belongs_to_user_and_can_have_multiple_exercises_and_performances(): void
    {
        $user = User::factory()->create();
        $exerciseA = Exercise::create(['slug' => 'squat', 'name' => 'Squat', 'type' => 'strength']);
        $exerciseB = Exercise::create(['slug' => 'bench-press', 'name' => 'Bench Press', 'type' => 'strength']);

        $workout = Workout::create(['user_id' => $user->id, 'started_at' => now()]);
        $weA = $workout->workoutExercises()->create(['exercise_id' => $exerciseA->id, 'position' => 1]);
        $weB = $workout->workoutExercises()->create(['exercise_id' => $exerciseB->id, 'position' => 2]);
        $weA->performances()->create(['set_number' => 1, 'reps' => 8, 'load' => 60]);
        $weA->performances()->create(['set_number' => 2, 'reps' => 6, 'load' => 65]);

        $this->assertTrue($workout->user->is($user));
        $this->assertSame(2, $workout->workoutExercises()->count());
        $this->assertSame(2, $weA->performances()->count());
        $this->assertSame(0, $weB->performances()->count());
    }

    // 2. UNIQUE(workout_id, position) rechaza duplicado.
    public function test_unique_workout_id_position_rejects_duplicate(): void
    {
        $user = User::factory()->create();
        $exercise = Exercise::create(['slug' => 'squat', 'name' => 'Squat', 'type' => 'strength']);
        $workout = Workout::create(['user_id' => $user->id, 'started_at' => now()]);
        $workout->workoutExercises()->create(['exercise_id' => $exercise->id, 'position' => 1]);

        $this->expectException(QueryException::class);

        WorkoutExercise::create(['workout_id' => $workout->id, 'exercise_id' => $exercise->id, 'position' => 1]);
    }

    // 3. UNIQUE(workout_exercise_id, set_number) rechaza duplicado.
    public function test_unique_workout_exercise_id_set_number_rejects_duplicate(): void
    {
        $user = User::factory()->create();
        $exercise = Exercise::create(['slug' => 'squat', 'name' => 'Squat', 'type' => 'strength']);
        $workout = Workout::create(['user_id' => $user->id, 'started_at' => now()]);
        $we = $workout->workoutExercises()->create(['exercise_id' => $exercise->id, 'position' => 1]);
        $we->performances()->create(['set_number' => 1, 'reps' => 8]);

        $this->expectException(QueryException::class);

        ExercisePerformance::create(['workout_exercise_id' => $we->id, 'set_number' => 1, 'reps' => 5]);
    }

    // 4. Mismo exercise_id permitido dos veces dentro del mismo Workout (no hay UNIQUE nueva sobre exercise_id).
    public function test_same_exercise_id_allowed_twice_within_the_same_workout(): void
    {
        $user = User::factory()->create();
        $exercise = Exercise::create(['slug' => 'squat', 'name' => 'Squat', 'type' => 'strength']);
        $workout = Workout::create(['user_id' => $user->id, 'started_at' => now()]);

        $workout->workoutExercises()->create(['exercise_id' => $exercise->id, 'position' => 1]);
        $workout->workoutExercises()->create(['exercise_id' => $exercise->id, 'position' => 2]);

        $this->assertSame(2, $workout->workoutExercises()->where('exercise_id', $exercise->id)->count());
    }

    // 5. Borrar Workout borra en cascada WorkoutExercises y ExercisePerformances; NO borra el Exercise referenciado.
    public function test_deleting_a_workout_cascades_exercises_and_performances_but_not_the_catalog_exercise(): void
    {
        $user = User::factory()->create();
        $exercise = Exercise::create(['slug' => 'squat', 'name' => 'Squat', 'type' => 'strength']);
        $workout = Workout::create(['user_id' => $user->id, 'started_at' => now()]);
        $we = $workout->workoutExercises()->create(['exercise_id' => $exercise->id, 'position' => 1]);
        $we->performances()->create(['set_number' => 1, 'reps' => 8]);

        $workout->delete();

        $this->assertSame(0, WorkoutExercise::count());
        $this->assertSame(0, ExercisePerformance::count());
        $this->assertSame(1, Exercise::count());
    }

    // 6. Borrar WorkoutExercise borra en cascada sus ExercisePerformances.
    public function test_deleting_a_workout_exercise_cascades_its_performances(): void
    {
        $user = User::factory()->create();
        $exercise = Exercise::create(['slug' => 'squat', 'name' => 'Squat', 'type' => 'strength']);
        $workout = Workout::create(['user_id' => $user->id, 'started_at' => now()]);
        $weA = $workout->workoutExercises()->create(['exercise_id' => $exercise->id, 'position' => 1]);
        $weB = $workout->workoutExercises()->create(['exercise_id' => $exercise->id, 'position' => 2]);
        $weA->performances()->create(['set_number' => 1, 'reps' => 8]);
        $weB->performances()->create(['set_number' => 1, 'reps' => 8]);

        $weA->delete();

        $this->assertSame(1, WorkoutExercise::count());
        $this->assertSame(1, ExercisePerformance::count());
    }

    // 7. Borrar un User borra en cascada sus Workouts.
    public function test_deleting_a_user_cascades_their_workouts(): void
    {
        $user = User::factory()->create();
        Workout::create(['user_id' => $user->id, 'started_at' => now()]);

        $user->delete();

        $this->assertSame(0, Workout::count());
    }

    // 8. Workout::workoutExercises()/WorkoutExercise::performances() devuelven ordenado.
    public function test_exercises_and_performances_relations_are_ordered(): void
    {
        $user = User::factory()->create();
        $exerciseA = Exercise::create(['slug' => 'squat', 'name' => 'Squat', 'type' => 'strength']);
        $exerciseB = Exercise::create(['slug' => 'bench-press', 'name' => 'Bench Press', 'type' => 'strength']);
        $workout = Workout::create(['user_id' => $user->id, 'started_at' => now()]);

        $weC = $workout->workoutExercises()->create(['exercise_id' => $exerciseB->id, 'position' => 3]);
        $weA = $workout->workoutExercises()->create(['exercise_id' => $exerciseA->id, 'position' => 1]);
        $weB = $workout->workoutExercises()->create(['exercise_id' => $exerciseB->id, 'position' => 2]);

        $weA->performances()->create(['set_number' => 2, 'reps' => 6]);
        $weA->performances()->create(['set_number' => 1, 'reps' => 8]);

        $this->assertSame(
            [$weA->id, $weB->id, $weC->id],
            $workout->fresh()->workoutExercises->pluck('id')->all()
        );
        $this->assertSame(
            [1, 2],
            $weA->fresh()->performances->pluck('set_number')->all()
        );
    }

    // 9. Snapshot histórico: borrar el ProgramDay referenciado limpia solo el vínculo, el Workout sobrevive intacto.
    public function test_deleting_the_referenced_program_day_nulls_the_link_but_keeps_the_workout(): void
    {
        $user = User::factory()->create();
        $program = Program::create(['user_id' => $user->id, 'name' => 'Fuerza']);
        $day = $program->days()->create(['name' => 'Día 1', 'position' => 1]);
        $workout = Workout::create(['user_id' => $user->id, 'program_day_id' => $day->id, 'started_at' => now()]);

        $day->delete();

        $this->assertNotNull($workout->fresh());
        $this->assertNull($workout->fresh()->program_day_id);
    }

    // 10. Snapshot histórico: borrar el ProgramExercise referenciado limpia solo el vínculo; exercise_id/position/performances intactos.
    public function test_deleting_the_referenced_program_exercise_nulls_the_link_but_keeps_the_workout_exercise(): void
    {
        $user = User::factory()->create();
        $exercise = Exercise::create(['slug' => 'squat', 'name' => 'Squat', 'type' => 'strength']);
        $program = Program::create(['user_id' => $user->id, 'name' => 'Fuerza']);
        $day = $program->days()->create(['name' => 'Día 1', 'position' => 1]);
        $programExercise = $day->exercises()->create(['exercise_id' => $exercise->id, 'position' => 1]);
        $workout = Workout::create(['user_id' => $user->id, 'program_day_id' => $day->id, 'started_at' => now()]);
        $we = $workout->workoutExercises()->create([
            'exercise_id' => $exercise->id,
            'program_exercise_id' => $programExercise->id,
            'position' => 1,
        ]);
        $we->performances()->create(['set_number' => 1, 'reps' => 8]);

        $programExercise->delete();

        $we->refresh();
        $this->assertNull($we->program_exercise_id);
        $this->assertSame($exercise->id, $we->exercise_id);
        $this->assertSame(1, $we->position);
        $this->assertSame(1, $we->performances()->count());
    }

    // 11. exercise_id RESTRICT: borrar un Exercise referenciado por un WorkoutExercise falla.
    public function test_deleting_a_referenced_exercise_is_restricted(): void
    {
        $user = User::factory()->create();
        $exercise = Exercise::create(['slug' => 'squat', 'name' => 'Squat', 'type' => 'strength']);
        $workout = Workout::create(['user_id' => $user->id, 'started_at' => now()]);
        $workout->workoutExercises()->create(['exercise_id' => $exercise->id, 'position' => 1]);

        $this->expectException(QueryException::class);

        $exercise->delete();
    }

    // 12. Editar el Program/ProgramDay/ProgramExercise después no altera el snapshot ya creado del Workout.
    public function test_later_program_edits_do_not_alter_an_already_created_workout_snapshot(): void
    {
        $user = User::factory()->create();
        $exerciseA = Exercise::create(['slug' => 'squat', 'name' => 'Squat', 'type' => 'strength']);
        $exerciseB = Exercise::create(['slug' => 'bench-press', 'name' => 'Bench Press', 'type' => 'strength']);
        $program = Program::create(['user_id' => $user->id, 'name' => 'Fuerza']);
        $day = $program->days()->create(['name' => 'Día 1', 'position' => 1]);
        $programExercise = $day->exercises()->create(['exercise_id' => $exerciseA->id, 'position' => 1]);
        $workout = Workout::create(['user_id' => $user->id, 'program_day_id' => $day->id, 'started_at' => now()]);
        $we = $workout->workoutExercises()->create([
            'exercise_id' => $exerciseA->id,
            'program_exercise_id' => $programExercise->id,
            'position' => 1,
        ]);

        // Edit the ProgramExercise after the workout snapshot was taken.
        $programExercise->update(['exercise_id' => $exerciseB->id, 'position' => 2]);

        $we->refresh();
        $this->assertSame($exerciseA->id, $we->exercise_id);
        $this->assertSame(1, $we->position);
    }

    // 13. started_at/finished_at se castean a datetime.
    public function test_started_at_and_finished_at_are_cast_to_datetime(): void
    {
        $user = User::factory()->create();
        $workout = Workout::create(['user_id' => $user->id, 'started_at' => '2026-08-26 10:00:00', 'finished_at' => '2026-08-26 11:00:00']);

        $this->assertInstanceOf(Carbon::class, $workout->started_at);
        $this->assertInstanceOf(Carbon::class, $workout->finished_at);
    }

    // 14. Standalone workout (program_day_id null) por defecto en creación directa del modelo.
    public function test_workout_can_be_created_without_a_program_day(): void
    {
        $user = User::factory()->create();
        $workout = Workout::create(['user_id' => $user->id, 'started_at' => now()]);

        $this->assertNull($workout->program_day_id);
    }

    // 15. Workout::programDay() apunta al ProgramDay correcto.
    public function test_workout_belongs_to_its_program_day(): void
    {
        $user = User::factory()->create();
        $program = Program::create(['user_id' => $user->id, 'name' => 'Fuerza']);
        $day = $program->days()->create(['name' => 'Día 1', 'position' => 1]);
        $workout = Workout::create(['user_id' => $user->id, 'program_day_id' => $day->id, 'started_at' => now()]);

        $this->assertTrue($workout->programDay->is($day));
    }
}
