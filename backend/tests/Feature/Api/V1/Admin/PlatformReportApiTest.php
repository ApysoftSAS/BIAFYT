<?php

namespace Tests\Feature\Api\V1\Admin;

use App\Models\Activity;
use App\Models\Branch;
use App\Models\CheckIn;
use App\Models\Gym;
use App\Models\GymAssignment;
use App\Models\GymRegistrationRequest;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

/**
 * Platform report. Frozen clock: Wednesday 2026-11-18 10:00 UTC, report zone UTC.
 */
class PlatformReportApiTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        config(['app.report_timezone' => 'UTC']);
        $this->travelTo(Carbon::parse('2026-11-18 10:00:00', 'UTC'));
        $this->admin = User::factory()->create(['created_at' => '2026-08-01 00:00:00']);
        $this->admin->forceFill(['is_platform_admin' => true])->save();
    }

    private function report(int $days = 30, ?User $as = null)
    {
        return $this->actingAs($as ?? $this->admin)->getJson("/api/v1/admin/reports?days={$days}");
    }

    public function test_only_a_platform_admin_can_read_it(): void
    {
        $this->getJson('/api/v1/admin/reports')->assertStatus(401);
        $this->report(30, User::factory()->create())->assertStatus(404);
        $this->report(15)->assertStatus(422)->assertJsonValidationErrors('days');
    }

    public function test_growth_engagement_gyms_and_queues(): void
    {
        // users: admin (old) + 2 new in the window + 1 old
        $recent = User::factory()->create(['created_at' => '2026-11-17 09:00:00']);
        $recent2 = User::factory()->create(['created_at' => '2026-11-10 09:00:00']);
        $old = User::factory()->create(['created_at' => '2026-08-01 09:00:00']);

        $gym = Gym::create(['name' => 'KAIROS']);
        $branch = Branch::create(['gym_id' => $gym->id, 'name' => 'Norte']);
        Gym::create(['name' => 'Vacío']);
        foreach ([[$recent, 'member'], [$old, 'member'], [$recent2, 'coach']] as [$user, $role]) {
            GymAssignment::create([
                'user_id' => $user->id, 'gym_id' => $gym->id,
                'branch_id' => $role === 'member' ? $branch->id : null, 'role' => $role, 'status' => 'active',
            ]);
        }
        GymAssignment::whereNotNull('id')->update(['created_at' => '2026-10-01 09:00:00']);

        CheckIn::create(['user_id' => $recent->id, 'check_in_date' => '2026-11-18', 'checked_in_at' => '2026-11-18 07:30:00']);
        CheckIn::create(['user_id' => $old->id, 'check_in_date' => '2026-11-10', 'checked_in_at' => '2026-11-10 18:00:00']);
        Activity::create([
            'user_id' => $recent2->id, 'started_at' => '2026-11-15 18:00:00', 'finished_at' => '2026-11-15 19:00:00',
            'duration_seconds' => 3600, 'sets_completed' => 10, 'exercises_completed' => 4,
        ]);
        GymRegistrationRequest::create(['user_id' => $old->id, 'status' => 'pending', 'gym_name' => 'Nuevo', 'branch_name' => 'Sede']);

        $r = $this->report()->assertOk()->json('report');
        $t = $r['totals'];

        $this->assertSame(4, $t['users']);
        $this->assertSame(2, $t['new_users']);
        $this->assertSame(2, $t['gyms']);
        $this->assertSame(2, $t['members']);
        $this->assertSame(1, $t['coaches']);
        $this->assertSame(2, $t['check_ins']);
        $this->assertSame(1, $t['workouts']);
        $this->assertSame(3, $t['active_users_period']);          // recent, old, recent2

        $this->assertSame(['today' => 1, 'last_7_days' => 2, 'last_30_days' => 3], $r['active_users']);
        $byDay = collect($r['new_users_by_day'])->pluck('count', 'date');
        $this->assertSame(1, $byDay['2026-11-17']);
        $this->assertSame(1, $byDay['2026-11-10']);
        $this->assertSame(1, $r['check_ins_by_hour'][7]);
        $this->assertSame(1, $r['check_ins_by_hour'][18]);

        $top = collect($r['top_gyms'])->keyBy('name');
        $this->assertSame(2, $top['KAIROS']['check_ins']);
        $this->assertSame(2, $top['KAIROS']['members']);
        $this->assertSame(0, $top['Vacío']['members']);
        $this->assertSame('KAIROS', $r['top_gyms'][0]['name']);

        $this->assertSame(1, $r['queues']['gym_registrations']['pending']);
        $this->assertSame(0, $r['queues']['equipment_requests']['in_review']);
        $this->assertCount(30, $r['check_ins_by_day']);
    }

    public function test_an_empty_platform_returns_zeros(): void
    {
        $r = $this->report(7)->assertOk()->json('report');

        $this->assertSame(1, $r['totals']['users']);               // only the admin
        $this->assertSame(0, $r['totals']['check_ins']);
        $this->assertSame([], $r['top_gyms']);
        $this->assertCount(7, $r['new_users_by_day']);
    }
}
