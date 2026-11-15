<?php

namespace Tests\Feature\Api\V1;

use App\Models\Activity;
use App\Models\CheckIn;
use App\Models\CoachAthleteRelationship;
use App\Models\CoachNote;
use App\Models\CoachVideo;
use App\Models\Program;
use App\Models\User;
use App\Models\Voucher;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

/**
 * Coach report. Frozen clock: Wednesday 2026-11-18 10:00 UTC, report zone UTC.
 */
class CoachReportApiTest extends TestCase
{
    use RefreshDatabase;

    private User $coach;

    protected function setUp(): void
    {
        parent::setUp();
        config(['app.report_timezone' => 'UTC']);
        $this->travelTo(Carbon::parse('2026-11-18 10:00:00', 'UTC'));
        $this->coach = User::factory()->create();
    }

    private function relate(string $status, string $activatedOn = '2026-10-01', ?User $coach = null): User
    {
        $athlete = User::factory()->create();
        CoachAthleteRelationship::create([
            'coach_user_id' => ($coach ?? $this->coach)->id,
            'athlete_user_id' => $athlete->id,
            'status' => $status,
            'requested_at' => "$activatedOn 08:00:00",
            'activated_at' => $status === 'pending' ? null : "$activatedOn 09:00:00",
        ]);

        return $athlete;
    }

    private function train(User $user, string $start, int $minutes = 60): void
    {
        Activity::create([
            'user_id' => $user->id, 'started_at' => $start,
            'finished_at' => Carbon::parse($start)->addMinutes($minutes),
            'duration_seconds' => $minutes * 60, 'sets_completed' => 10, 'exercises_completed' => 4,
        ]);
    }

    private function report(int $days = 30, ?User $as = null)
    {
        return $this->actingAs($as ?? $this->coach)->getJson("/api/v1/me/coach/report?days={$days}");
    }

    public function test_requires_authentication_and_a_valid_window(): void
    {
        $this->getJson('/api/v1/me/coach/report')->assertStatus(401);
        $this->report(15)->assertStatus(422)->assertJsonValidationErrors('days');
    }

    public function test_only_active_athletes_of_this_coach_count(): void
    {
        $a1 = $this->relate('active');
        $a2 = $this->relate('active');
        $a5 = $this->relate('active', '2026-11-17');            // joined yesterday
        $this->relate('pending');
        $this->relate('revoked');
        $stranger = $this->relate('active', '2026-10-01', User::factory()->create()); // another coach's athlete

        $this->train($a1, '2026-11-17 18:00:00', 60);
        $this->train($a1, '2026-11-16 07:00:00', 40);
        $this->train($a2, '2026-10-30 12:00:00', 30);           // last workout 19 days ago
        $this->train($stranger, '2026-11-17 18:00:00');         // not mine
        CheckIn::create(['user_id' => $a1->id, 'check_in_date' => '2026-11-17', 'checked_in_at' => '2026-11-17 17:50:00']);
        CheckIn::create(['user_id' => $a1->id, 'check_in_date' => '2026-11-18', 'checked_in_at' => '2026-11-18 08:00:00']);

        $r = $this->report()->assertOk()->json('report');
        $t = $r['totals'];

        $this->assertSame(3, $t['athletes']);
        $this->assertSame(1, $t['pending_requests']);
        $this->assertSame(3, $t['workouts']);
        $this->assertSame(2, $t['athletes_trained']);            // a1 and a2
        $this->assertSame(1.5, $t['workouts_per_active_athlete']);
        $this->assertSame(43, $t['avg_workout_minutes']);        // (60+40+30)/3
        $this->assertSame(1, $t['needs_attention']);             // a2; a5 is too new

        $rows = collect($r['athletes'])->keyBy(fn ($row) => $row['user']['id']);
        $this->assertSame(2, $rows[$a1->id]['workouts']);
        $this->assertSame(2, $rows[$a1->id]['current_streak']);
        $this->assertSame('2026-11-17', $rows[$a1->id]['last_activity_date']);
        $this->assertFalse($rows[$a1->id]['needs_attention']);
        $this->assertTrue($rows[$a2->id]['needs_attention']);
        $this->assertSame(19, $rows[$a2->id]['days_since']);
        $this->assertNull($rows[$a5->id]['last_activity_date']);
        $this->assertFalse($rows[$a5->id]['needs_attention']);
        $this->assertArrayNotHasKey($stranger->id, $rows);
        $this->assertSame($a1->id, $r['athletes'][0]['user']['id']); // most workouts first
    }

    public function test_hours_days_and_coach_activity(): void
    {
        $a1 = $this->relate('active');
        $this->train($a1, '2026-11-17 18:15:00');
        $this->train($a1, '2026-11-16 18:40:00');
        $this->train($a1, '2026-11-18 07:05:00');

        Program::create(['user_id' => $a1->id, 'name' => 'Plan', 'created_by_user_id' => $this->coach->id]);
        CoachNote::create(['coach_user_id' => $this->coach->id, 'athlete_user_id' => $a1->id, 'body' => 'Bien']);
        CoachVideo::create(['coach_user_id' => $this->coach->id, 'tiktok_username' => 'a.b', 'tiktok_video_id' => '12345678', 'title' => 't']);
        Voucher::create([
            'code' => 'VCH-COACH0000001', 'gym_id' => null, 'coach_user_id' => $this->coach->id,
            'issued_by_user_id' => $this->coach->id, 'athlete_user_id' => $a1->id, 'title' => 'x',
            'benefit_type' => 'text', 'benefit_description' => 'y', 'status' => Voucher::STATUS_ISSUED,
        ]);

        $r = $this->report(7)->assertOk()->json('report');

        $this->assertSame(2, $r['by_hour'][18]);
        $this->assertSame(1, $r['by_hour'][7]);
        $byDay = collect($r['by_day'])->pluck('workouts', 'date');
        $this->assertCount(7, $byDay);
        $this->assertSame(1, $byDay['2026-11-17']);
        $this->assertSame(1, $byDay['2026-11-18']);
        $this->assertSame(['routines' => 1, 'routines_period' => 1, 'notes' => 1, 'notes_period' => 1, 'videos' => 1, 'vouchers_issued' => 1, 'vouchers_redeemed' => 0, 'vouchers_open' => 1], $r['coach']);
    }

    public function test_a_coach_without_athletes_gets_zeros(): void
    {
        $r = $this->report()->assertOk()->json('report');

        $this->assertSame(0, $r['totals']['athletes']);
        $this->assertNull($r['totals']['avg_workout_minutes']);
        $this->assertSame([], $r['athletes']);
        $this->assertCount(30, $r['by_day']);
    }
}
