<?php

namespace Tests\Feature\Api\V1;

use App\Models\Activity;
use App\Models\Branch;
use App\Models\CheckIn;
use App\Models\Gym;
use App\Models\GymAssignment;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

/**
 * Gym admin report. Frozen clock: Wednesday 2026-11-18 10:00 UTC. The report
 * zone is set to UTC for the main scenario so the hours read plainly; the
 * conversion to the gym's own zone has a dedicated test.
 * Check-ins are attributed to the gym through ACTIVE membership, from the
 * day of the alta — see App\Support\GymReport.
 */
class GymReportApiTest extends TestCase
{
    use RefreshDatabase;

    private Gym $gym;

    private Branch $norte;

    private Branch $sur;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        config(['app.report_timezone' => 'UTC']);
        $this->travelTo(Carbon::parse('2026-11-18 10:00:00', 'UTC'));

        $this->gym = Gym::create(['name' => 'KAIROS']);
        $this->norte = Branch::create(['gym_id' => $this->gym->id, 'name' => 'Norte']);
        $this->sur = Branch::create(['gym_id' => $this->gym->id, 'name' => 'Sur']);
        $this->admin = User::factory()->create();
        GymAssignment::create([
            'user_id' => $this->admin->id, 'gym_id' => $this->gym->id, 'branch_id' => null,
            'role' => GymAssignment::ROLE_GYM_ADMIN, 'status' => GymAssignment::STATUS_ACTIVE,
        ]);
    }

    private function member(Branch $branch, string $since, string $status = GymAssignment::STATUS_ACTIVE): User
    {
        $user = User::factory()->create();
        $assignment = GymAssignment::create([
            'user_id' => $user->id, 'gym_id' => $this->gym->id, 'branch_id' => $branch->id,
            'role' => GymAssignment::ROLE_MEMBER, 'status' => $status,
        ]);
        GymAssignment::whereKey($assignment->id)->update(['created_at' => "$since 09:00:00"]);

        return $user;
    }

    private function checkIn(User $user, string $at, ?string $out = null): void
    {
        CheckIn::create([
            'user_id' => $user->id,
            'check_in_date' => substr($at, 0, 10),
            'checked_in_at' => $at,
            'checked_out_at' => $out,
        ]);
    }

    /** @return array<string, User> */
    private function scenario(): array
    {
        $m1 = $this->member($this->norte, '2026-10-01');
        $m2 = $this->member($this->norte, '2026-10-01');
        $m3 = $this->member($this->sur, '2026-10-01');
        $m4 = $this->member($this->sur, '2026-11-17');            // joined yesterday
        $m5 = $this->member($this->norte, '2026-10-01', GymAssignment::STATUS_INACTIVE); // revoked
        $m6 = $this->member($this->norte, '2026-09-01');          // last visit 17 days ago
        $m7 = $this->member($this->sur, '2026-09-01');            // never visited
        $outsider = User::factory()->create();

        $this->checkIn($m1, '2026-11-18 08:30:00');                        // today, still inside
        $this->checkIn($m1, '2026-11-17 07:15:00', '2026-11-17 08:15:00'); // 60 min
        $this->checkIn($m1, '2026-11-16 18:00:00', '2026-11-16 19:30:00'); // 90 min (Monday)
        $this->checkIn($m2, '2026-11-18 06:00:00');                        // today, no check-out, >3h ago
        $this->checkIn($m2, '2026-11-11 07:30:00');
        $this->checkIn($m3, '2026-11-17 18:45:00');
        $this->checkIn($m4, '2026-11-10 12:00:00');                        // BEFORE the alta → ignored
        $this->checkIn($m5, '2026-11-17 09:00:00');                        // revoked → ignored
        $this->checkIn($outsider, '2026-11-17 09:00:00');                  // not a member → ignored
        $this->checkIn($m6, '2026-11-01 12:00:00');

        Activity::create([
            'user_id' => $m1->id, 'started_at' => '2026-11-17 07:00:00', 'finished_at' => '2026-11-17 08:00:00',
            'duration_seconds' => 3600, 'sets_completed' => 10, 'exercises_completed' => 4,
        ]);

        return compact('m1', 'm2', 'm3', 'm4', 'm6', 'm7');
    }

    private function report(array $query = [], ?User $as = null)
    {
        $qs = $query === [] ? '' : '?'.http_build_query($query);

        return $this->actingAs($as ?? $this->admin)->getJson("/api/v1/me/gym/{$this->gym->id}/reports{$qs}");
    }

    public function test_only_the_gym_admin_of_that_gym_can_read_the_report(): void
    {
        $this->getJson("/api/v1/me/gym/{$this->gym->id}/reports")->assertStatus(401);
        $this->report([], User::factory()->create())->assertStatus(404);
        $this->report([], $this->member($this->norte, '2026-10-01'))->assertStatus(404);

        $other = Gym::create(['name' => 'Other']);
        $otherAdmin = User::factory()->create();
        GymAssignment::create([
            'user_id' => $otherAdmin->id, 'gym_id' => $other->id, 'branch_id' => null,
            'role' => GymAssignment::ROLE_GYM_ADMIN, 'status' => GymAssignment::STATUS_ACTIVE,
        ]);
        $this->report([], $otherAdmin)->assertStatus(404);
    }

    public function test_invalid_window_or_foreign_branch_is_rejected(): void
    {
        $this->report(['days' => 15])->assertStatus(422)->assertJsonValidationErrors('days');

        $foreign = Branch::create(['gym_id' => Gym::create(['name' => 'Other'])->id, 'name' => 'X']);
        $this->report(['branch_id' => $foreign->id])->assertStatus(422)->assertJsonValidationErrors('branch_id');
    }

    public function test_totals_count_only_active_members_from_their_alta(): void
    {
        $this->scenario();
        $t = $this->report()->assertOk()->json('report.totals');

        $this->assertSame(6, $t['members']);            // m1 m2 m3 m4 m6 m7 (m5 revoked)
        $this->assertSame(1, $t['new_members']);        // m4
        $this->assertSame(7, $t['check_ins']);          // m4 pre-alta, m5 and outsider excluded
        $this->assertSame(4, $t['active_members']);     // m1 m2 m3 m6
        $this->assertSame(1.8, $t['visits_per_active_member']);
        $this->assertSame(2, $t['check_ins_today']);
        $this->assertSame(1, $t['inside_now_estimate']); // m2 checked in 4h ago without check-out
        $this->assertSame(75, $t['avg_stay_minutes']);
        $this->assertSame(2, $t['stays_measured']);
        $this->assertSame(1, $t['workouts']);
        $this->assertSame(60, $t['avg_workout_minutes']);
        $this->assertSame(0, $t['coaches']);          // no coaches in the scenario
    }

    public function test_peak_hours_and_the_weekday_hour_grid(): void
    {
        $this->scenario();
        $r = $this->report()->assertOk()->json('report');

        $this->assertSame([6 => 1, 7 => 2, 8 => 1, 12 => 1, 18 => 2], array_filter($r['by_hour']));
        $top = collect($r['peak_hours']);
        $this->assertCount(3, $top);
        $this->assertSame([7, 18], $top->take(2)->pluck('hour')->sort()->values()->all());
        $this->assertSame(2, $top[0]['check_ins']);

        $heat = $r['by_weekday_hour'];            // Monday = 0
        $this->assertSame(1, $heat[0][18]);       // Mon 2026-11-16 18:00
        $this->assertSame(1, $heat[1][7]);        // Tue 17th 07:15
        $this->assertSame(1, $heat[1][18]);       // Tue 17th 18:45
        $this->assertSame(1, $heat[2][6]);        // Wed 18th 06:00
        $this->assertSame(1, $heat[2][8]);        // Wed 18th 08:30
        $this->assertSame(1, $heat[2][7]);        // Wed 11th 07:30
        $this->assertSame(1, $heat[6][12]);       // Sun 1st 12:00
        $this->assertSame(7, array_sum(array_map('array_sum', $heat)));
    }

    public function test_daily_series_covers_every_day_of_the_window(): void
    {
        $this->scenario();
        $byDay = collect($this->report(['days' => 7])->assertOk()->json('report.by_day'));

        $this->assertCount(7, $byDay);
        $this->assertSame('2026-11-12', $byDay->first()['date']);
        $this->assertSame('2026-11-18', $byDay->last()['date']);
        $this->assertSame(2, $byDay->last()['check_ins']);
        $this->assertSame(2, $byDay->firstWhere('date', '2026-11-17')['check_ins']); // m1 + m3
    }

    public function test_inactive_members_list_puts_never_visited_first_and_skips_recent_joiners(): void
    {
        $people = $this->scenario();
        $r = $this->report()->assertOk()->json('report');

        $this->assertSame(2, $r['totals']['inactive_members']);
        $list = $r['inactive_members'];
        $this->assertSame($people['m7']->id, $list[0]['user']['id']);
        $this->assertNull($list[0]['days_since']);
        $this->assertSame($people['m6']->id, $list[1]['user']['id']);
        $this->assertSame(17, $list[1]['days_since']);
        $this->assertSame('Norte', $list[1]['branch']['name']);
        $this->assertNotContains($people['m4']->id, array_column(array_column($list, 'user'), 'id'));
    }

    public function test_branch_filter_narrows_the_numbers_but_keeps_the_branch_table(): void
    {
        $this->scenario();
        $r = $this->report(['branch_id' => $this->norte->id])->assertOk()->json('report');

        $this->assertSame(3, $r['totals']['members']);  // m1 m2 m6
        $this->assertSame(6, $r['totals']['check_ins']);
        $byBranch = collect($r['by_branch'])->keyBy('name');
        $this->assertSame(6, $byBranch['Norte']['check_ins']);
        $this->assertSame(3, $byBranch['Norte']['active_members']);
        $this->assertSame(3, $byBranch['Sur']['members']);
        $this->assertSame(0, $byBranch['Sur']['check_ins']);
    }

    public function test_empty_gym_returns_zeroes_not_errors(): void
    {
        $r = $this->report()->assertOk()->json('report');

        $this->assertSame(0, $r['totals']['members']);
        $this->assertNull($r['totals']['avg_stay_minutes']);
        $this->assertNull($r['totals']['visits_per_active_member']);
        $this->assertSame([], $r['peak_hours']);
        $this->assertCount(30, $r['by_day']);
        $this->assertCount(24, $r['by_hour']);
    }

    public function test_hours_and_days_follow_the_gym_timezone_not_utc(): void
    {
        config(['app.report_timezone' => 'America/Bogota']); // UTC−5
        $m = $this->member($this->norte, '2026-10-01');
        // 01:30 UTC on the 18th = 20:30 on the 17th in Bogotá: previous day, hour 20.
        $this->checkIn($m, '2026-11-18 01:30:00');
        // 13:00 UTC on the 18th = 08:00 on the 18th in Bogotá (today there), no check-out, 2 h ago.
        $m2 = $this->member($this->norte, '2026-10-01');
        $this->checkIn($m2, '2026-11-18 13:00:00');
        $this->travelTo(Carbon::parse('2026-11-18 15:00:00', 'UTC')); // 10:00 in Bogotá

        $r = $this->report()->assertOk()->json('report');

        $this->assertSame('America/Bogota', $r['period']['timezone']);
        $this->assertSame('2026-11-18', $r['period']['to']);
        $this->assertSame(1, $r['by_hour'][20]);
        $this->assertSame(1, $r['by_hour'][8]);
        $this->assertSame(0, $r['by_hour'][1]);
        $byDay = collect($r['by_day'])->pluck('check_ins', 'date');
        $this->assertSame(1, $byDay['2026-11-17']);
        $this->assertSame(1, $byDay['2026-11-18']);
        $this->assertSame(1, $r['totals']['check_ins_today']);
        $this->assertSame(1, $r['totals']['inside_now_estimate']);
        $this->assertSame(1, $r['by_weekday_hour'][1][20]); // Tuesday 17th, 20:00
    }
}
