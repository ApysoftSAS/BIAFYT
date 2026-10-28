<?php

namespace App\Support;

use Illuminate\Support\Carbon;

/**
 * The backend source of truth for the check-in streak.
 *
 * Product rule (approved):
 *   - streak counts by calendar day, one valid check-in per day;
 *   - consecutive days with a check-in keep/extend the streak;
 *   - a missing day breaks it;
 *   - computed EXCLUSIVELY from `check_ins.check_in_date` (never workouts).
 *
 * `current_streak` is the run of consecutive days ending at the most recent
 * check-in, but only "alive" while that check-in is today or yesterday (a
 * day that is not over yet is not a missed day). Once the last check-in is
 * two or more days old, the current streak is 0.
 *
 * This does NOT feed points or a `streak_bonus` ledger reason yet — it only
 * exposes the authoritative value for a future flip.
 */
class StreakRules
{
    /**
     * @param  iterable<string>  $checkInDates  'Y-m-d' strings (any order, duplicates tolerated)
     * @param  string  $today  the server's calendar day, 'Y-m-d'
     * @return array{current_streak: int, longest_streak: int}
     */
    public static function fromDates(iterable $checkInDates, string $today): array
    {
        $days = collect($checkInDates)
            ->map(fn (string $date): string => Carbon::parse($date)->toDateString())
            ->unique()
            ->sort()
            ->values()
            ->all();

        if ($days === []) {
            return ['current_streak' => 0, 'longest_streak' => 0];
        }

        $longest = 1;
        $run = 1;

        for ($i = 1, $n = count($days); $i < $n; $i++) {
            if (self::isNextDay($days[$i - 1], $days[$i])) {
                $run++;
            } else {
                $run = 1;
            }

            $longest = max($longest, $run);
        }

        $mostRecent = Carbon::parse($days[count($days) - 1]);
        $yesterday = Carbon::parse($today)->subDay();

        if ($mostRecent->lt($yesterday->startOfDay())) {
            $current = 0;
        } else {
            $current = 1;

            for ($i = count($days) - 2; $i >= 0; $i--) {
                if (! self::isNextDay($days[$i], $days[$i + 1])) {
                    break;
                }

                $current++;
            }
        }

        return ['current_streak' => $current, 'longest_streak' => $longest];
    }

    /**
     * Whether `$later` is the calendar day right after `$earlier`.
     */
    private static function isNextDay(string $earlier, string $later): bool
    {
        return Carbon::parse($earlier)->addDay()->isSameDay(Carbon::parse($later));
    }
}
