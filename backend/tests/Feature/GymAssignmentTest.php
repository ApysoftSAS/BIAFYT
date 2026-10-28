<?php

namespace Tests\Feature;

use App\Models\Branch;
use App\Models\Gym;
use App\Models\GymAssignment;
use App\Models\User;
use DomainException;
use Illuminate\Database\QueryException;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class GymAssignmentTest extends TestCase
{
    use RefreshDatabase;

    // 1. User puede tener un GymAssignment.
    public function test_user_can_have_a_gym_assignment(): void
    {
        $user = User::factory()->create();
        $gym = Gym::create(['name' => 'Gym One']);
        $branch = Branch::create(['gym_id' => $gym->id, 'name' => 'Main']);

        $assignment = GymAssignment::create([
            'user_id' => $user->id,
            'gym_id' => $gym->id,
            'branch_id' => $branch->id,
            'role' => GymAssignment::ROLE_MEMBER,
            'status' => GymAssignment::STATUS_ACTIVE,
        ]);

        $this->assertDatabaseHas('gym_assignments', ['id' => $assignment->id, 'user_id' => $user->id]);
    }

    // 2. User puede tener múltiples GymAssignments.
    public function test_user_can_have_multiple_gym_assignments(): void
    {
        $user = User::factory()->create();
        $gym = Gym::create(['name' => 'Gym One']);
        $branchA = Branch::create(['gym_id' => $gym->id, 'name' => 'A']);
        $branchB = Branch::create(['gym_id' => $gym->id, 'name' => 'B']);

        GymAssignment::create(['user_id' => $user->id, 'gym_id' => $gym->id, 'branch_id' => $branchA->id, 'role' => 'member', 'status' => 'active']);
        GymAssignment::create(['user_id' => $user->id, 'gym_id' => $gym->id, 'branch_id' => $branchB->id, 'role' => 'staff', 'status' => 'active']);

        $this->assertSame(2, $user->gymAssignments()->count());
    }

    // 3. User puede tener múltiples roles simultáneos en el mismo gym/branch.
    public function test_user_can_have_multiple_roles_in_the_same_gym_and_branch(): void
    {
        $user = User::factory()->create();
        $gym = Gym::create(['name' => 'Gym One']);
        $branch = Branch::create(['gym_id' => $gym->id, 'name' => 'Main']);

        GymAssignment::create(['user_id' => $user->id, 'gym_id' => $gym->id, 'branch_id' => $branch->id, 'role' => 'member', 'status' => 'active']);
        GymAssignment::create(['user_id' => $user->id, 'gym_id' => $gym->id, 'branch_id' => $branch->id, 'role' => 'coach', 'status' => 'active']);

        $roles = GymAssignment::where('user_id', $user->id)->pluck('role')->sort()->values()->all();
        $this->assertSame(['coach', 'member'], $roles);
    }

    // 4. User puede pertenecer a múltiples Gym.
    public function test_user_can_belong_to_multiple_gyms(): void
    {
        $user = User::factory()->create();
        $gym1 = Gym::create(['name' => 'Gym One']);
        $gym2 = Gym::create(['name' => 'Gym Two']);
        $branch1 = Branch::create(['gym_id' => $gym1->id, 'name' => 'A']);
        $branch3 = Branch::create(['gym_id' => $gym2->id, 'name' => 'C']);

        GymAssignment::create(['user_id' => $user->id, 'gym_id' => $gym1->id, 'branch_id' => $branch1->id, 'role' => 'coach', 'status' => 'active']);
        GymAssignment::create(['user_id' => $user->id, 'gym_id' => $gym2->id, 'branch_id' => $branch3->id, 'role' => 'member', 'status' => 'active']);

        $this->assertSame(2, $user->gymAssignments()->distinct('gym_id')->count('gym_id'));
    }

    // 5. Assignment específica de Branch limita el scope.
    public function test_branch_scoped_assignment_limits_scope_to_that_branch(): void
    {
        $user = User::factory()->create();
        $gym = Gym::create(['name' => 'Gym One']);
        $branchA = Branch::create(['gym_id' => $gym->id, 'name' => 'A']);
        $branchB = Branch::create(['gym_id' => $gym->id, 'name' => 'B']);

        GymAssignment::create(['user_id' => $user->id, 'gym_id' => $gym->id, 'branch_id' => $branchA->id, 'role' => 'staff', 'status' => 'active']);

        $this->assertTrue(GymAssignment::activeFor($user, $gym->id, $branchA->id)->exists());
        $this->assertFalse(GymAssignment::activeFor($user, $gym->id, $branchB->id)->exists());
    }

    // 6. Assignment con branch_id = NULL tiene scope global del Gym.
    public function test_null_branch_assignment_has_gym_wide_scope(): void
    {
        $user = User::factory()->create();
        $gym = Gym::create(['name' => 'Gym One']);
        $branchA = Branch::create(['gym_id' => $gym->id, 'name' => 'A']);
        $branchB = Branch::create(['gym_id' => $gym->id, 'name' => 'B']);

        GymAssignment::create(['user_id' => $user->id, 'gym_id' => $gym->id, 'branch_id' => null, 'role' => 'gym_admin', 'status' => 'active']);

        $this->assertTrue(GymAssignment::activeFor($user, $gym->id, $branchA->id)->exists());
        $this->assertTrue(GymAssignment::activeFor($user, $gym->id, $branchB->id)->exists());
        $this->assertTrue(GymAssignment::activeFor($user, $gym->id, null)->exists());
    }

    // 7. Usuario de Gym A no puede "acceder" a Gym B.
    public function test_user_of_gym_a_cannot_access_gym_b(): void
    {
        $user = User::factory()->create();
        $gymA = Gym::create(['name' => 'Gym A']);
        $gymB = Gym::create(['name' => 'Gym B']);
        $branchA = Branch::create(['gym_id' => $gymA->id, 'name' => 'A1']);

        GymAssignment::create(['user_id' => $user->id, 'gym_id' => $gymA->id, 'branch_id' => $branchA->id, 'role' => 'gym_admin', 'status' => 'active']);

        $this->assertTrue(GymAssignment::activeFor($user, $gymA->id, $branchA->id)->exists());
        $this->assertFalse(GymAssignment::activeFor($user, $gymB->id, $branchA->id)->exists());
    }

    // 8. Assignment inactive no concede acceso.
    public function test_inactive_assignment_does_not_grant_access(): void
    {
        $user = User::factory()->create();
        $gym = Gym::create(['name' => 'Gym One']);
        $branch = Branch::create(['gym_id' => $gym->id, 'name' => 'Main']);

        GymAssignment::create(['user_id' => $user->id, 'gym_id' => $gym->id, 'branch_id' => $branch->id, 'role' => 'staff', 'status' => 'inactive']);

        $this->assertFalse(GymAssignment::activeFor($user, $gym->id, $branch->id)->exists());
    }

    // 9. gym_admin tiene capacidades de staff (vía ROLE_RANK).
    public function test_gym_admin_has_staff_capabilities(): void
    {
        $user = User::factory()->create();
        $gym = Gym::create(['name' => 'Gym One']);

        GymAssignment::create(['user_id' => $user->id, 'gym_id' => $gym->id, 'branch_id' => null, 'role' => 'gym_admin', 'status' => 'active']);

        $this->assertTrue($user->hasRoleInGym($gym->id, null, GymAssignment::ROLE_STAFF));
        $this->assertTrue($user->hasRoleInGym($gym->id, null, GymAssignment::ROLE_MEMBER));
    }

    // 10. coach NO hereda capacidades de staff (no participa del rank).
    public function test_coach_does_not_inherit_staff_capabilities(): void
    {
        $user = User::factory()->create();
        $gym = Gym::create(['name' => 'Gym One']);
        $branch = Branch::create(['gym_id' => $gym->id, 'name' => 'Main']);

        GymAssignment::create(['user_id' => $user->id, 'gym_id' => $gym->id, 'branch_id' => $branch->id, 'role' => 'coach', 'status' => 'active']);

        $this->assertFalse($user->hasRoleInGym($gym->id, $branch->id, GymAssignment::ROLE_STAFF));
        $this->assertTrue($user->hasExactRoleInGym($gym->id, $branch->id, GymAssignment::ROLE_COACH));
        $this->assertFalse(isset(GymAssignment::ROLE_RANK['coach']));
    }

    // 11. gym_admin + coach requiere dos assignments (coexisten, distinto role).
    public function test_gym_admin_and_coach_require_two_assignments(): void
    {
        $user = User::factory()->create();
        $gym = Gym::create(['name' => 'Gym One']);
        $branch = Branch::create(['gym_id' => $gym->id, 'name' => 'Main']);

        GymAssignment::create(['user_id' => $user->id, 'gym_id' => $gym->id, 'branch_id' => null, 'role' => 'gym_admin', 'status' => 'active']);
        GymAssignment::create(['user_id' => $user->id, 'gym_id' => $gym->id, 'branch_id' => $branch->id, 'role' => 'coach', 'status' => 'active']);

        $this->assertSame(2, GymAssignment::where('user_id', $user->id)->count());
        $this->assertTrue($user->hasRoleInGym($gym->id, null, GymAssignment::ROLE_GYM_ADMIN));
        $this->assertTrue($user->hasExactRoleInGym($gym->id, $branch->id, GymAssignment::ROLE_COACH));
    }

    // 12. member no puede utilizar branch_id NULL.
    public function test_member_cannot_have_null_branch_id(): void
    {
        $user = User::factory()->create();
        $gym = Gym::create(['name' => 'Gym One']);

        $this->expectException(DomainException::class);

        GymAssignment::create(['user_id' => $user->id, 'gym_id' => $gym->id, 'branch_id' => null, 'role' => 'member', 'status' => 'active']);
    }

    // 13. User eliminado elimina GymAssignments (cascade).
    public function test_deleting_user_cascades_gym_assignments(): void
    {
        $user = User::factory()->create();
        $gym = Gym::create(['name' => 'Gym One']);
        $branch = Branch::create(['gym_id' => $gym->id, 'name' => 'Main']);
        GymAssignment::create(['user_id' => $user->id, 'gym_id' => $gym->id, 'branch_id' => $branch->id, 'role' => 'member', 'status' => 'active']);

        $user->delete();

        $this->assertSame(0, GymAssignment::count());
    }

    // 14a. Gym eliminado elimina GymAssignments cuando NO hay assignments scoped a una branch.
    public function test_deleting_a_gym_without_branch_scoped_assignments_cascades(): void
    {
        $user = User::factory()->create();
        $gym = Gym::create(['name' => 'Gym One']);
        GymAssignment::create(['user_id' => $user->id, 'gym_id' => $gym->id, 'branch_id' => null, 'role' => 'gym_admin', 'status' => 'active']);

        $gym->delete();

        $this->assertSame(0, GymAssignment::count());
        $this->assertSame(0, Gym::count());
    }

    /**
     * 14b. IMPORTANT ENGINE DIVERGENCE (documented, not a bug in app code):
     * branch_id uses ON DELETE RESTRICT (not CASCADE) because it is a base
     * column of branch_id_norm (a generated column), and MySQL/InnoDB does
     * not permit CASCADE/SET NULL on a foreign key over a column that a
     * generated column depends on. Verified empirically against the
     * project's real MySQL 8.0.42: deleting a Gym that has a Branch with at
     * least one branch-scoped GymAssignment fails there with error 1451,
     * because InnoDB evaluates the branch_id RESTRICT against the pre-delete
     * state regardless of the fact that the gym_id cascade would also remove
     * that same GymAssignment row.
     *
     * This test suite runs against SQLite (see phpunit.xml). SQLite
     * implements FK actions via internal triggers processed sequentially,
     * and — verified empirically here too — it lets the gym_id cascade
     * remove the GymAssignment row first, so by the time the Branch cascade
     * fires there is nothing left referencing it and the delete succeeds.
     * The direct case (deleting a Branch that still has an assignment,
     * without going through a Gym delete) IS consistent between engines —
     * see test_deleting_a_branch_with_assignments_is_restricted, also
     * verified against real MySQL.
     *
     * This test asserts the real (SQLite) behavior of this suite rather
     * than a MySQL-only outcome it cannot actually observe here, to avoid
     * a false expectation. The MySQL production behavior (Gym delete
     * blocked in this scenario) is documented above and confirmed by
     * manual verification, not by this automated test.
     */
    public function test_deleting_a_gym_with_branch_scoped_assignments_cascades_under_sqlite(): void
    {
        $user = User::factory()->create();
        $gym = Gym::create(['name' => 'Gym One']);
        $branch = Branch::create(['gym_id' => $gym->id, 'name' => 'Main']);
        GymAssignment::create(['user_id' => $user->id, 'gym_id' => $gym->id, 'branch_id' => $branch->id, 'role' => 'staff', 'status' => 'active']);

        $gym->delete();

        $this->assertSame(0, Gym::count());
        $this->assertSame(0, Branch::count());
        $this->assertSame(0, GymAssignment::count());
    }

    // 15a. Branch eliminado elimina/permite borrado cuando no tiene assignments.
    public function test_deleting_a_branch_without_assignments_succeeds(): void
    {
        $gym = Gym::create(['name' => 'Gym One']);
        $branch = Branch::create(['gym_id' => $gym->id, 'name' => 'Main']);

        $branch->delete();

        $this->assertSame(0, Branch::count());
    }

    /**
     * 15b. Deviación documentada (misma razón que 14b): eliminar una Branch
     * que todavía tiene GymAssignments scoped a ella está RESTRINGIDO, no
     * cascadea. Hay que reasignar/eliminar esas asignaciones primero.
     */
    public function test_deleting_a_branch_with_assignments_is_restricted(): void
    {
        $user = User::factory()->create();
        $gym = Gym::create(['name' => 'Gym One']);
        $branch = Branch::create(['gym_id' => $gym->id, 'name' => 'Main']);
        GymAssignment::create(['user_id' => $user->id, 'gym_id' => $gym->id, 'branch_id' => $branch->id, 'role' => 'member', 'status' => 'active']);

        $this->expectException(QueryException::class);

        $branch->delete();
    }

    // 16. UNIQUE evita duplicado exacto con branch_id NULL.
    public function test_unique_constraint_prevents_duplicate_null_branch_assignment(): void
    {
        $user = User::factory()->create();
        $gym = Gym::create(['name' => 'Gym One']);

        GymAssignment::create(['user_id' => $user->id, 'gym_id' => $gym->id, 'branch_id' => null, 'role' => 'gym_admin', 'status' => 'active']);

        $this->expectException(UniqueConstraintViolationException::class);

        GymAssignment::create(['user_id' => $user->id, 'gym_id' => $gym->id, 'branch_id' => null, 'role' => 'gym_admin', 'status' => 'active']);
    }

    // 17. UNIQUE permite assignments diferentes (branch o rol distintos).
    public function test_unique_constraint_allows_different_assignments(): void
    {
        $user = User::factory()->create();
        $gym = Gym::create(['name' => 'Gym One']);
        $branchA = Branch::create(['gym_id' => $gym->id, 'name' => 'A']);
        $branchB = Branch::create(['gym_id' => $gym->id, 'name' => 'B']);

        GymAssignment::create(['user_id' => $user->id, 'gym_id' => $gym->id, 'branch_id' => $branchA->id, 'role' => 'member', 'status' => 'active']);
        GymAssignment::create(['user_id' => $user->id, 'gym_id' => $gym->id, 'branch_id' => $branchB->id, 'role' => 'member', 'status' => 'active']);
        GymAssignment::create(['user_id' => $user->id, 'gym_id' => $gym->id, 'branch_id' => $branchA->id, 'role' => 'coach', 'status' => 'active']);

        $this->assertSame(3, GymAssignment::count());
    }

    // 18. Relaciones Eloquent funcionan correctamente en las 4 direcciones.
    public function test_eloquent_relationships_resolve_correctly(): void
    {
        $user = User::factory()->create();
        $gym = Gym::create(['name' => 'Gym One']);
        $branch = Branch::create(['gym_id' => $gym->id, 'name' => 'Main']);
        $assignment = GymAssignment::create(['user_id' => $user->id, 'gym_id' => $gym->id, 'branch_id' => $branch->id, 'role' => 'member', 'status' => 'active']);

        $this->assertTrue($gym->branches->contains($branch));
        $this->assertTrue($branch->gym->is($gym));
        $this->assertTrue($gym->gymAssignments->contains($assignment));
        $this->assertTrue($branch->gymAssignments->contains($assignment));
        $this->assertTrue($user->gymAssignments->contains($assignment));
        $this->assertTrue($assignment->user->is($user));
        $this->assertTrue($assignment->gym->is($gym));
        $this->assertTrue($assignment->branch->is($branch));
    }
}
