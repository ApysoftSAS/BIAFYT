<?php

namespace App\Support;

use App\Models\Activity;
use App\Models\Branch;
use App\Models\CheckIn;
use App\Models\GymAssignment;
use App\Models\User;
use App\Models\Voucher;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;

/**
 * Administrative report of one gym (Gym Web → Reportes).
 *
 * IMPORTANT ABOUT THE DATA. A `check_ins` row records WHO checked in and
 * WHEN, never WHERE (no gym/branch column — the user app still uses mock
 * gyms). So attendance is ATTRIBUTED to the gym through membership: a
 * check-in counts for this gym when its author is an ACTIVE `member` of it
 * and the check-in is on/after the day the assignment was created. A person
 * who is a member of two gyms counts in both. Only people who use the
 * BIAFYT app are visible — this is not a door-access count. The UI states
 * both limits.
 *
 * TIME. The database and the application are in UTC. Every day/hour in the
 * report is converted to `config('app.report_timezone')` so "peak hour"
 * and "today" follow the gym's wall clock (the stored `check_in_date` is a
 * UTC day and is NOT used).
 */
class GymReport
{
    /** Allowed report windows, in days (today included). */
    public const PERIODS = [7, 30, 90];

    /** A check-in without check-out counts as "inside now" for this long. */
    public const STAY_HOURS = 3;

    /** A member with no check-in for this many days is listed as inactive. */
    public const INACTIVE_DAYS = 14;

    private const INACTIVE_LIST_LIMIT = 20;

    /**
     * @return array<string, mixed>
     */
    public static function build(int $gymId, int $days, ?int $branchId = null): array
    {
        $tz = config('app.report_timezone');
        $appTz = config('app.timezone');

        $now = Carbon::now($tz);
        $today = $now->toDateString();
        $from = $now->copy()->startOfDay()->subDays($days - 1);
        $fromDate = $from->toDateString();
        $fromDb = $from->copy()->setTimezone($appTz); // for queries over stored (UTC) timestamps
        $local = fn (Carbon $c): Carbon => $c->copy()->setTimezone($tz);

        $branches = Branch::where('gym_id', $gymId)->orderBy('name')->get(['id', 'name']);
        $members = self::members($gymId, $branchId, $tz); // user_id => ['since' => local Y-m-d, 'branch_id' => ?int]
        $memberIds = $members->keys()->all();

        // Visits of members, from the later of (window start, member's alta), in local time.
        $visits = $memberIds === []
            ? collect()
            : CheckIn::whereIn('user_id', $memberIds)
                ->where('checked_in_at', '>=', $fromDb)
                ->get(['user_id', 'checked_in_at', 'checked_out_at'])
                ->map(fn (CheckIn $c) => [
                    'user_id' => $c->user_id,
                    'at' => $local($c->checked_in_at),
                    'out' => $c->checked_out_at,
                ])
                ->map(fn (array $v) => $v + ['date' => $v['at']->toDateString()])
                ->filter(fn (array $v) => $v['date'] >= $members[$v['user_id']]['since'])
                ->values();

        // ---- attendance distribution -------------------------------------
        $byDay = [];
        for ($d = $from->copy(); $d->lte($now); $d->addDay()) {
            $byDay[$d->toDateString()] = 0;
        }
        $byHour = array_fill(0, 24, 0);
        $heat = array_fill(0, 7, array_fill(0, 24, 0)); // [Mon=0..Sun=6][hour]
        $stays = [];
        $insideNow = 0;
        $todayCount = 0;

        foreach ($visits as $v) {
            $at = $v['at'];
            $byDay[$v['date']] = ($byDay[$v['date']] ?? 0) + 1;
            $byHour[$at->hour]++;
            $heat[$at->dayOfWeekIso - 1][$at->hour]++;

            if ($v['date'] === $today) {
                $todayCount++;
                if ($v['out'] === null && $at->gte($now->copy()->subHours(self::STAY_HOURS))) {
                    $insideNow++;
                }
            }
            if ($v['out'] !== null && $v['out']->gte($at)) {
                $stays[] = $at->diffInMinutes($v['out']);
            }
        }

        $activeIds = $visits->pluck('user_id')->unique();

        // ---- inactive members ---------------------------------------------
        // Last visit may be older than the window: look it up all-time.
        $lastAllTime = $memberIds === []
            ? collect()
            : CheckIn::whereIn('user_id', $memberIds)->selectRaw('user_id, MAX(checked_in_at) as last_at')
                ->groupBy('user_id')->pluck('last_at', 'user_id')
                ->map(fn ($at) => Carbon::parse($at, $appTz)->setTimezone($tz)->toDateString());

        $cutoff = $now->copy()->subDays(self::INACTIVE_DAYS)->toDateString();
        $lastOf = function (int $userId, array $m) use ($lastAllTime): ?string {
            $last = $lastAllTime[$userId] ?? null;

            return ($last !== null && $last >= $m['since']) ? $last : null; // visits before the alta don't count
        };

        $inactive = $members
            // Skip people who joined too recently to have had a chance.
            ->filter(fn (array $m, int $userId) => $m['since'] <= $cutoff && (($last = $lastOf($userId, $m)) === null || $last < $cutoff))
            ->map(function (array $m, int $userId) use ($lastOf, $today) {
                $last = $lastOf($userId, $m);

                return [
                    'user_id' => $userId,
                    'branch_id' => $m['branch_id'],
                    'last_check_in_date' => $last,
                    'days_since' => $last === null ? null : Carbon::parse($last)->diffInDays(Carbon::parse($today)),
                    'member_since' => $m['since'],
                ];
            });
        $inactiveTotal = $inactive->count();
        $names = User::whereIn('id', $inactive->pluck('user_id'))->pluck('name', 'id');
        $branchNames = $branches->pluck('name', 'id');
        $inactiveList = $inactive
            ->sortByDesc(fn (array $r) => $r['days_since'] ?? PHP_INT_MAX) // never-visited first
            ->take(self::INACTIVE_LIST_LIMIT)
            ->map(fn (array $r) => [
                'user' => ['id' => $r['user_id'], 'name' => $names[$r['user_id']] ?? '—'],
                'branch' => $r['branch_id'] ? ['id' => $r['branch_id'], 'name' => $branchNames[$r['branch_id']] ?? '—'] : null,
                'last_check_in_date' => $r['last_check_in_date'],
                'days_since' => $r['days_since'],
                'member_since' => $r['member_since'],
            ])
            ->values();

        // ---- per-branch table (always the whole gym's branches) -----------
        $allMembers = $branchId === null ? $members : self::members($gymId, null, $tz);
        $byBranch = $branches->map(function (Branch $b) use ($allMembers, $branchId, $visits) {
            $ids = $allMembers->filter(fn (array $m) => $m['branch_id'] === $b->id)->keys();
            $rows = $branchId === null || $branchId === $b->id
                ? $visits->filter(fn (array $v) => $ids->contains($v['user_id']))
                : collect();

            return [
                'id' => $b->id,
                'name' => $b->name,
                'members' => $ids->count(),
                'check_ins' => $rows->count(),
                'active_members' => $rows->pluck('user_id')->unique()->count(),
            ];
        })->values();

        // ---- training logged in the window --------------------------------
        $activities = $memberIds === []
            ? collect()
            : Activity::whereIn('user_id', $memberIds)->where('finished_at', '>=', $fromDb)
                ->get(['user_id', 'duration_seconds', 'finished_at'])
                ->filter(fn (Activity $a) => $local($a->finished_at)->toDateString() >= $members[$a->user_id]['since']);

        // ---- vouchers (gym-wide: vouchers have no branch) -----------------
        $vouchers = Voucher::where('gym_id', $gymId);
        $voucherStats = [
            'issued' => (clone $vouchers)->where('created_at', '>=', $fromDb)->count(),
            'redeemed' => (clone $vouchers)->where('redeemed_at', '>=', $fromDb)->count(),
            'open' => (clone $vouchers)->get()->filter(fn (Voucher $v) => $v->effectiveStatus() === Voucher::STATUS_ISSUED)->count(),
        ];

        $total = $visits->count();

        return [
            'period' => [
                'days' => $days,
                'from' => $fromDate,
                'to' => $today,
                'timezone' => $tz,
                'stay_hours_estimate' => self::STAY_HOURS,
                'inactive_days' => self::INACTIVE_DAYS,
            ],
            'branch_id' => $branchId,
            'totals' => [
                'members' => $members->count(),
                'coaches' => GymAssignment::where('gym_id', $gymId)->where('role', GymAssignment::ROLE_COACH)
                    ->where('status', GymAssignment::STATUS_ACTIVE)->distinct('user_id')->count('user_id'),
                'new_members' => $members->filter(fn (array $m) => $m['since'] >= $fromDate)->count(),
                'active_members' => $activeIds->count(),
                'inactive_members' => $inactiveTotal,
                'check_ins' => $total,
                'check_ins_today' => $todayCount,
                'inside_now_estimate' => $insideNow,
                'visits_per_active_member' => $activeIds->count() > 0 ? round($total / $activeIds->count(), 1) : null,
                'avg_stay_minutes' => $stays === [] ? null : (int) round(array_sum($stays) / count($stays)),
                'stays_measured' => count($stays),
                'workouts' => $activities->count(),
                'avg_workout_minutes' => $activities->count() > 0 ? (int) round($activities->avg('duration_seconds') / 60) : null,
            ],
            'by_day' => collect($byDay)->map(fn (int $n, string $date) => ['date' => $date, 'check_ins' => $n])->values(),
            'by_hour' => $byHour,
            'by_weekday_hour' => $heat,
            'peak_hours' => collect($byHour)
                ->map(fn (int $n, int $hour) => ['hour' => $hour, 'check_ins' => $n])
                ->filter(fn (array $h) => $h['check_ins'] > 0)
                ->sortByDesc('check_ins')->take(3)->values(),
            'by_branch' => $byBranch,
            'inactive_members' => $inactiveList,
            'vouchers' => $voucherStats,
        ];
    }

    /**
     * Active members of the gym, one entry per person (earliest alta wins).
     * `since` is the alta day on the gym's local calendar.
     *
     * @return Collection<int, array{since: string, branch_id: int|null}>
     */
    private static function members(int $gymId, ?int $branchId, string $tz): Collection
    {
        return GymAssignment::where('gym_id', $gymId)
            ->where('role', GymAssignment::ROLE_MEMBER)
            ->where('status', GymAssignment::STATUS_ACTIVE)
            ->when($branchId !== null, fn ($q) => $q->where('branch_id', $branchId))
            ->orderBy('created_at')->orderBy('id')
            ->get(['user_id', 'branch_id', 'created_at'])
            ->unique('user_id')
            ->mapWithKeys(fn (GymAssignment $a) => [
                $a->user_id => [
                    'since' => $a->created_at->copy()->setTimezone($tz)->toDateString(),
                    'branch_id' => $a->branch_id,
                ],
            ]);
    }
}
