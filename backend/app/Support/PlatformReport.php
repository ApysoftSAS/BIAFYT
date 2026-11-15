<?php

namespace App\Support;

use App\Models\Activity;
use App\Models\CheckIn;
use App\Models\Duel;
use App\Models\EquipmentRequest;
use App\Models\Gym;
use App\Models\GymAssignment;
use App\Models\GymRegistrationRequest;
use App\Models\Promotion;
use App\Models\User;
use App\Models\Voucher;
use Illuminate\Support\Carbon;

/**
 * Platform-wide report for BIAFYT Admin: growth, engagement, the gyms and the
 * review queues. Read-only, aggregate numbers only (no personal data beyond
 * gym names).
 *
 * "Active user" = at least one check-in OR logged workout. Hours/days are in
 * `config('app.report_timezone')`; the database stays in UTC (see GymReport).
 */
class PlatformReport
{
    public const PERIODS = GymReport::PERIODS;

    private const TOP_GYMS = 10;

    /**
     * @return array<string, mixed>
     */
    public static function build(int $days): array
    {
        $tz = config('app.report_timezone');
        $appTz = config('app.timezone');
        $now = Carbon::now($tz);
        $today = $now->toDateString();
        $from = $now->copy()->startOfDay()->subDays($days - 1);
        $db = fn (Carbon $c): Carbon => $c->copy()->setTimezone($appTz); // for queries over UTC timestamps
        $local = fn (Carbon $c): Carbon => $c->copy()->setTimezone($tz);
        $fromDb = $db($from);

        // ---- series over the window ---------------------------------------
        $blank = [];
        for ($d = $from->copy(); $d->lte($now); $d->addDay()) {
            $blank[$d->toDateString()] = 0;
        }
        $newUsersByDay = $blank;
        foreach (User::where('created_at', '>=', $fromDb)->get(['created_at']) as $u) {
            $newUsersByDay[$local($u->created_at)->toDateString()]++;
        }
        $checkInsByDay = $blank;
        $byHour = array_fill(0, 24, 0);
        $checkIns = CheckIn::where('checked_in_at', '>=', $fromDb)->get(['user_id', 'checked_in_at']);
        foreach ($checkIns as $c) {
            $at = $local($c->checked_in_at);
            $checkInsByDay[$at->toDateString()]++;
            $byHour[$at->hour]++;
        }
        $activities = Activity::where('finished_at', '>=', $fromDb)->get(['user_id']);

        // ---- engagement: distinct users with a check-in or workout --------
        $activeSince = fn (int $daysBack): int => collect()
            ->merge(CheckIn::where('checked_in_at', '>=', $db($now->copy()->startOfDay()->subDays($daysBack - 1)))->pluck('user_id'))
            ->merge(Activity::where('finished_at', '>=', $db($now->copy()->startOfDay()->subDays($daysBack - 1)))->pluck('user_id'))
            ->unique()->count();

        // ---- gyms ---------------------------------------------------------
        $activeAssignments = GymAssignment::where('status', GymAssignment::STATUS_ACTIVE);
        $distinctWith = fn (string $role): int => (clone $activeAssignments)->where('role', $role)->distinct('user_id')->count('user_id');

        // ponytail: one GymReport per gym (about 20 queries each). Fine for tens
        // of gyms; precompute or cache if the platform grows past that.
        $topGyms = Gym::orderBy('name')->get(['id', 'name'])
            ->map(function (Gym $g) use ($days) {
                $t = GymReport::build($g->id, $days)['totals'];

                return [
                    'id' => $g->id,
                    'name' => $g->name,
                    'members' => $t['members'],
                    'coaches' => $t['coaches'],
                    'check_ins' => $t['check_ins'],
                    'active_members' => $t['active_members'],
                ];
            })
            ->sortByDesc('check_ins')->take(self::TOP_GYMS)->values();

        $byStatus = fn ($model, array $statuses) => collect($statuses)->mapWithKeys(fn (string $s) => [$s => $model::where('status', $s)->count()]);

        return [
            'period' => ['days' => $days, 'from' => $from->toDateString(), 'to' => $today, 'timezone' => $tz],
            'totals' => [
                'users' => User::count(),
                'new_users' => array_sum($newUsersByDay),
                'gyms' => Gym::count(),
                'new_gyms' => Gym::where('created_at', '>=', $fromDb)->count(),
                'members' => $distinctWith(GymAssignment::ROLE_MEMBER),
                'coaches' => $distinctWith(GymAssignment::ROLE_COACH),
                'staff' => $distinctWith(GymAssignment::ROLE_STAFF),
                'check_ins' => $checkIns->count(),
                'workouts' => $activities->count(),
                'active_users_period' => $checkIns->pluck('user_id')->merge($activities->pluck('user_id'))->unique()->count(),
                'duels_finished' => Duel::where('status', Duel::STATUS_FINISHED)->where('finished_at', '>=', $fromDb)->count(),
                'vouchers_issued' => Voucher::where('created_at', '>=', $fromDb)->count(),
                'vouchers_redeemed' => Voucher::where('redeemed_at', '>=', $fromDb)->count(),
                'promotions_active' => Promotion::where('active', true)->count(),
            ],
            // DAU / WAU / MAU: always today, last 7 and last 30 days (independent of the window).
            'active_users' => ['today' => $activeSince(1), 'last_7_days' => $activeSince(7), 'last_30_days' => $activeSince(30)],
            'new_users_by_day' => collect($newUsersByDay)->map(fn (int $n, string $date) => ['date' => $date, 'count' => $n])->values(),
            'check_ins_by_day' => collect($checkInsByDay)->map(fn (int $n, string $date) => ['date' => $date, 'count' => $n])->values(),
            'check_ins_by_hour' => $byHour,
            'top_gyms' => $topGyms,
            'queues' => [
                'gym_registrations' => $byStatus(GymRegistrationRequest::class, [GymRegistrationRequest::STATUS_PENDING, GymRegistrationRequest::STATUS_APPROVED, GymRegistrationRequest::STATUS_REJECTED]),
                'equipment_requests' => $byStatus(EquipmentRequest::class, [EquipmentRequest::STATUS_PENDING, EquipmentRequest::STATUS_IN_REVIEW, EquipmentRequest::STATUS_CHANGES_REQUESTED, EquipmentRequest::STATUS_APPROVED, EquipmentRequest::STATUS_REJECTED]),
            ],
        ];
    }
}
