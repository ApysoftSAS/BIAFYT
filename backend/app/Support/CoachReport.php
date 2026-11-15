<?php

namespace App\Support;

use App\Models\Activity;
use App\Models\CheckIn;
use App\Models\CoachAthleteRelationship;
use App\Models\CoachVideo;
use App\Models\Program;
use App\Models\User;
use App\Models\Voucher;
use Illuminate\Support\Carbon;

/**
 * Report of one coach about THEIR athletes (frontend-couch → Reportes).
 *
 * Scope = athletes with an ACTIVE coach↔athlete relationship (the consent
 * gate used everywhere else). Training numbers come from the athletes'
 * logged `activities` — shadow/best-effort quality like the rest of the
 * coach view (a session the athlete's app never synced is invisible).
 *
 * Days and hours are converted to `config('app.report_timezone')`; the
 * database and the app stay in UTC (see GymReport).
 */
class CoachReport
{
    public const PERIODS = GymReport::PERIODS;

    /** An athlete with no workout for this many days "needs attention". */
    public const INACTIVE_DAYS = 14;

    /**
     * @return array<string, mixed>
     */
    public static function build(User $coach, int $days): array
    {
        $tz = config('app.report_timezone');
        $now = Carbon::now($tz);
        $today = $now->toDateString();
        $from = $now->copy()->startOfDay()->subDays($days - 1);
        $fromDb = $from->copy()->setTimezone(config('app.timezone'));
        $local = fn (Carbon $c): Carbon => $c->copy()->setTimezone($tz);
        $cutoff = $now->copy()->subDays(self::INACTIVE_DAYS)->toDateString();

        $relations = $coach->coachRelationshipsAsCoach()
            ->where('status', CoachAthleteRelationship::STATUS_ACTIVE)
            ->with('athlete:id,name')->get();
        $athletes = $relations->mapWithKeys(fn (CoachAthleteRelationship $r) => [
            $r->athlete_user_id => [
                'name' => $r->athlete->name,
                'since' => $r->activated_at ? $local($r->activated_at)->toDateString() : $today,
            ],
        ]);
        $ids = $athletes->keys()->all();

        $activities = $ids === [] ? collect() : Activity::whereIn('user_id', $ids)
            ->where('finished_at', '>=', $fromDb)
            ->get(['user_id', 'started_at', 'finished_at', 'duration_seconds']);

        $byDay = [];
        for ($d = $from->copy(); $d->lte($now); $d->addDay()) {
            $byDay[$d->toDateString()] = 0;
        }
        $byHour = array_fill(0, 24, 0);
        foreach ($activities as $a) {
            $date = $local($a->finished_at)->toDateString();
            $byDay[$date] = ($byDay[$date] ?? 0) + 1;
            $byHour[$local($a->started_at)->hour]++;
        }

        $lastAt = $ids === [] ? collect() : Activity::whereIn('user_id', $ids)
            ->selectRaw('user_id, MAX(finished_at) as last_at')->groupBy('user_id')->pluck('last_at', 'user_id')
            ->map(fn ($at) => Carbon::parse($at, config('app.timezone'))->setTimezone($tz)->toDateString());
        $checkIns = $ids === [] ? collect() : CheckIn::whereIn('user_id', $ids)->get(['user_id', 'check_in_date'])->groupBy('user_id');
        $serverToday = Carbon::now()->toDateString(); // check_in_date is a UTC day (see StreakRules)
        $perAthlete = $activities->groupBy('user_id');

        $rows = $athletes->map(function (array $a, int $id) use ($perAthlete, $lastAt, $checkIns, $serverToday, $today, $cutoff) {
            $last = $lastAt[$id] ?? null;

            return [
                'user' => ['id' => $id, 'name' => $a['name']],
                'workouts' => ($perAthlete[$id] ?? collect())->count(),
                'last_activity_date' => $last,
                'days_since' => $last === null ? null : Carbon::parse($last)->diffInDays(Carbon::parse($today)),
                'current_streak' => StreakRules::fromDates(($checkIns[$id] ?? collect())->pluck('check_in_date'), $serverToday)['current_streak'],
                'athlete_since' => $a['since'],
                // Newly accepted athletes haven't had time to train yet: not flagged.
                'needs_attention' => $a['since'] <= $cutoff && ($last === null || $last < $cutoff),
            ];
        })->sortByDesc('workouts')->values();

        $activeAthletes = $rows->where('workouts', '>', 0)->count();
        $vouchers = Voucher::where('coach_user_id', $coach->id);

        return [
            'period' => ['days' => $days, 'from' => $from->toDateString(), 'to' => $today, 'timezone' => $tz, 'inactive_days' => self::INACTIVE_DAYS],
            'totals' => [
                'athletes' => $athletes->count(),
                'pending_requests' => $coach->coachRelationshipsAsCoach()->where('status', CoachAthleteRelationship::STATUS_PENDING)->count(),
                'athletes_trained' => $activeAthletes,
                'needs_attention' => $rows->where('needs_attention', true)->count(),
                'workouts' => $activities->count(),
                'workouts_per_active_athlete' => $activeAthletes > 0 ? round($activities->count() / $activeAthletes, 1) : null,
                'avg_workout_minutes' => $activities->count() > 0 ? (int) round($activities->avg('duration_seconds') / 60) : null,
            ],
            'by_day' => collect($byDay)->map(fn (int $n, string $date) => ['date' => $date, 'workouts' => $n])->values(),
            'by_hour' => $byHour,
            'athletes' => $rows,
            'coach' => [
                'routines' => Program::where('created_by_user_id', $coach->id)->count(),
                'routines_period' => Program::where('created_by_user_id', $coach->id)->where('created_at', '>=', $fromDb)->count(),
                'notes' => $coach->coachNotesWritten()->count(),
                'notes_period' => $coach->coachNotesWritten()->where('created_at', '>=', $fromDb)->count(),
                'videos' => CoachVideo::where('coach_user_id', $coach->id)->count(),
                'vouchers_issued' => (clone $vouchers)->where('created_at', '>=', $fromDb)->count(),
                'vouchers_redeemed' => (clone $vouchers)->where('redeemed_at', '>=', $fromDb)->count(),
                'vouchers_open' => (clone $vouchers)->get()->filter(fn (Voucher $v) => $v->effectiveStatus() === Voucher::STATUS_ISSUED)->count(),
            ],
        ];
    }
}
