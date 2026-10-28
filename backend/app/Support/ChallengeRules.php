<?php

namespace App\Support;

/**
 * The backend source of truth for daily challenges: which challenges exist,
 * what they reward, and which three apply to a given calendar day.
 *
 * Ported verbatim from the frontend reference
 * (`data/community.js#dailyChallengeTemplates` / `dailyChallengesFor`) so
 * the "one of today's three" check and the reward amount match exactly what
 * the user is shown in `Challenges.jsx`. Only `id` + `reward` are needed
 * here (title/detail/icon/metric/target stay frontend-only); the ORDER must
 * stay identical to the frontend array — the selection algorithm splices by
 * index.
 *
 * This phase only records a claim and credits the reward. It does NOT
 * verify that the challenge was actually completed (shadow mode).
 */
class ChallengeRules
{
    /**
     * @var list<array{id: string, reward: int}>
     */
    public const TEMPLATES = [
        ['id' => 'dc-checkin', 'reward' => 30],
        ['id' => 'dc-sets', 'reward' => 60],
        ['id' => 'dc-workout', 'reward' => 80],
        ['id' => 'dc-duration', 'reward' => 70],
        ['id' => 'dc-validated', 'reward' => 100],
        ['id' => 'dc-machines', 'reward' => 25],
    ];

    /**
     * The three challenges for `$date` (a `Y-m-d` string), deterministic per
     * day. Mirrors the frontend `dailyChallengesFor(dateKey, 3)`:
     *   seed = sum of the character codes of the date string
     *   index i = (seed * (i + 7)) % remaining pool size, then splice it out.
     *
     * @return list<array{id: string, reward: int}>
     */
    public static function forDate(string $date): array
    {
        $seed = array_sum(array_map('ord', str_split($date)));

        $pool = self::TEMPLATES;
        $picked = [];

        for ($i = 0; $i < 3 && count($pool) > 0; $i++) {
            $index = ($seed * ($i + 7)) % count($pool);
            $picked[] = $pool[$index];
            array_splice($pool, $index, 1);
        }

        return $picked;
    }

    /**
     * The reward for `$challengeId` if it is one of the three challenges for
     * `$date`, or null otherwise.
     */
    public static function rewardFor(string $challengeId, string $date): ?int
    {
        foreach (self::forDate($date) as $template) {
            if ($template['id'] === $challengeId) {
                return $template['reward'];
            }
        }

        return null;
    }
}
