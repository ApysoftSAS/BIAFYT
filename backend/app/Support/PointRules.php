<?php

namespace App\Support;

/**
 * The single backend source of truth for how many points a completed
 * training session earns. Ported from the frontend reference
 * (`utils/validation.js#computeWorkoutPoints` / `POINT_RULES`):
 *
 *   amount = min(PER_ACTIVITY_CAP, sets * PER_SET + exercises * PER_EXERCISE + min(STREAK_CAP, streak * STREAK_BONUS))
 *
 * `streak` is a client-reported session fact (the frontend's local,
 * never-decreasing `user.streak` at the moment the workout finished), same
 * trust model already applied to `sets`/`exercises` — the backend does not
 * (yet) have an authoritative streak that matches the frontend's semantics
 * (`GET /me/streak` resets on a missed day; the frontend one never
 * decreases), so it cannot be substituted here without changing what the
 * number means. Clamped at 0 like the other inputs.
 *
 * Deliberately NOT included yet (belongs to a later phase, needs the
 * anti-fraud / GPS layer): competitive vs. activity split.
 *
 * `CHECKIN` mirrors the frontend `POINT_RULES.checkin`: a flat credit for a
 * gym check-in (once per day, enforced by the controller + the ledger
 * `idempotency_key`). This phase only records the check-in and credits the
 * ledger — the streak counter and any streak-break rule stay frontend-local.
 */
class PointRules
{
    public const PER_SET = 6;

    public const PER_EXERCISE = 12;

    /** Points per day of streak, capped at STREAK_CAP (mirrors frontend `POINT_RULES.streakBonus`). */
    public const STREAK_BONUS = 10;

    /** Cap on the streak bonus contribution (mirrors frontend `POINT_RULES.streakCap`). */
    public const STREAK_CAP = 100;

    /** Flat points for a single daily gym check-in (mirrors frontend `POINT_RULES.checkin`). */
    public const CHECKIN = 20;

    /**
     * Per-activity cap (mirrors the frontend's per-session
     * `POINT_RULES.dailyActivityCap`, which is applied per session despite
     * its name). Not a per-day aggregate cap.
     */
    public const PER_ACTIVITY_CAP = 600;

    /**
     * Points awarded for a single completed activity, from its session
     * facts. Inputs are clamped at 0 so a malformed count can never produce
     * a negative award.
     */
    public static function forActivity(int $setsCompleted, int $exercisesCompleted, int $streak = 0): int
    {
        $sets = max(0, $setsCompleted);
        $exercises = max(0, $exercisesCompleted);
        $streakBonus = min(self::STREAK_CAP, max(0, $streak) * self::STREAK_BONUS);

        $raw = ($sets * self::PER_SET) + ($exercises * self::PER_EXERCISE) + $streakBonus;

        return min(self::PER_ACTIVITY_CAP, $raw);
    }
}
