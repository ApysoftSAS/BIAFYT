<?php

namespace App\Support;

use App\Models\Activity;
use App\Models\User;
use Illuminate\Support\Carbon;

/**
 * The read-only, shadow-quality snapshot of one athlete/member: profile, an
 * activity summary, the authoritative check-in streak, and the points
 * balance.
 *
 * Shared verbatim by the Coach surface (CoachAthleteController::show) and
 * the Gym surface (GymAdminController::memberDetail) so both return an
 * identical shape. The authorization gate differs per surface (an active
 * coach<->athlete relationship vs. an active gym_admin role); this builder
 * only assembles the data once the caller is already authorized.
 *
 * "Shadow quality": Profile is authoritative, but activities / points /
 * streak are populated by the user app's best-effort write-through and may
 * have offline gaps (accepted — D-COACH-2 / D-GYM-5). This builder adds NO
 * new points authority and never mutates Activity / PointTransaction /
 * CheckIn.
 */
class AthleteSnapshot
{
    private const RECENT_ACTIVITY_LIMIT = 10;

    /**
     * @return array<string, mixed>
     */
    public static function for(User $athlete): array
    {
        $activities = $athlete->activities()
            ->with('pointTransactions')
            ->orderByDesc('finished_at')
            ->orderByDesc('id')
            ->get();

        return [
            'athlete' => [
                'id' => $athlete->id,
                'name' => $athlete->name,
            ],
            'profile' => self::mapProfile($athlete),
            'activity_summary' => [
                'count' => $activities->count(),
                'last_activity_at' => $activities->first()?->finished_at,
                'total_sets' => (int) $activities->sum('sets_completed'),
                'total_exercises' => (int) $activities->sum('exercises_completed'),
                'total_duration_seconds' => (int) $activities->sum('duration_seconds'),
                'recent' => $activities->take(self::RECENT_ACTIVITY_LIMIT)
                    ->map(fn (Activity $activity) => [
                        'id' => $activity->id,
                        'routine_label' => $activity->routine_label,
                        'finished_at' => $activity->finished_at,
                        'duration_seconds' => $activity->duration_seconds,
                        'sets_completed' => $activity->sets_completed,
                        'exercises_completed' => $activity->exercises_completed,
                        'points_awarded' => (int) $activity->pointTransactions->sum('amount'),
                    ])
                    ->values(),
            ],
            'streak' => StreakRules::fromDates(
                $athlete->checkIns()->orderBy('check_in_date')->pluck('check_in_date'),
                Carbon::now()->toDateString(),
            ),
            'points' => [
                'balance' => (int) $athlete->pointTransactions()->sum('amount'),
            ],
        ];
    }

    /**
     * @return array<string, mixed>|null
     */
    private static function mapProfile(User $athlete): ?array
    {
        $profile = $athlete->profile;

        if ($profile === null) {
            return null;
        }

        return [
            'age' => $profile->age,
            'weight' => $profile->weight,
            'height' => $profile->height,
            'months_training' => $profile->months_training,
            'level' => $profile->level,
            'focus_id' => $profile->focus_id,
        ];
    }
}
