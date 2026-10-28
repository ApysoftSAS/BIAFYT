<?php

namespace App\Support;

/**
 * The single backend source of truth for duel modalities and how a duel
 * winner is decided. Ported from the frontend reference
 * (`utils/duelEngine.js` — `modalities` + `scoreRun`), with one deliberate
 * change: the frontend scored a single run against itself as reference (a
 * demo shortcut for the simulated rival). A real duel has two real runs, so
 * each metric is scored HEAD-TO-HEAD — normalised against the better of the
 * two runs — and no routine plan is needed.
 *
 * Per metric (higher = better), for participant X:
 *   time         : min(durations) / max(1, duration_X)          — faster wins
 *   exercises    : exercises_X / max(1, max(exercises))
 *   reps         : validReps_X / max(1, max(validReps))
 *   consistency  : consistency_X / 100                          — already 0-100
 *   penalties    : (100 - min(100, penalties_X * 10)) / 100
 * total_X = 100 * sum(metric_X * weight[metric]); winner = higher total,
 * equal total = draw.
 */
class DuelRules
{
    /**
     * Modality id => weights. Mirrors `duelEngine.js#modalities` (the same
     * five ids, descriptions live frontend-side for display).
     *
     * @var array<string, array<string, float>>
     */
    public const MODALITIES = [
        'speed' => ['time' => 0.45, 'exercises' => 0.25, 'reps' => 0.15, 'consistency' => 0.05, 'penalties' => 0.10],
        'endurance' => ['time' => 0.15, 'exercises' => 0.25, 'reps' => 0.40, 'consistency' => 0.10, 'penalties' => 0.10],
        'strength' => ['time' => 0.15, 'exercises' => 0.30, 'reps' => 0.35, 'consistency' => 0.10, 'penalties' => 0.10],
        'consistency' => ['time' => 0.05, 'exercises' => 0.20, 'reps' => 0.15, 'consistency' => 0.50, 'penalties' => 0.10],
        'routine' => ['time' => 0.25, 'exercises' => 0.40, 'reps' => 0.15, 'consistency' => 0.10, 'penalties' => 0.10],
    ];

    /** Per-modality max stake (mirrors `duelEngine.js#modalities[].maxBet`). */
    public const MAX_STAKE = [
        'speed' => 300,
        'endurance' => 300,
        'strength' => 400,
        'consistency' => 200,
        'routine' => 300,
    ];

    public static function isModality(string $modality): bool
    {
        return array_key_exists($modality, self::MODALITIES);
    }

    public static function maxStake(string $modality): int
    {
        return self::MAX_STAKE[$modality] ?? 0;
    }

    /**
     * Resolve a duel from two runs. Each run is an array with keys
     * duration_seconds, exercises_completed, sets_completed, valid_reps,
     * consistency, penalties.
     *
     * @param  array<string, int>  $challengerRun
     * @param  array<string, int>  $opponentRun
     * @return array{
     *     modality: string,
     *     weights: array<string, float>,
     *     challenger: array{total: int, breakdown: array<string, int>},
     *     opponent: array{total: int, breakdown: array<string, int>},
     *     winner: 'challenger'|'opponent'|'draw'
     * }
     */
    public static function resolve(string $modality, array $challengerRun, array $opponentRun): array
    {
        $weights = self::MODALITIES[$modality] ?? self::MODALITIES['routine'];

        $minDuration = max(1, min(
            max(1, (int) $challengerRun['duration_seconds']),
            max(1, (int) $opponentRun['duration_seconds']),
        ));
        $maxExercises = max(1, (int) $challengerRun['exercises_completed'], (int) $opponentRun['exercises_completed']);
        $maxReps = max(1, (int) $challengerRun['valid_reps'], (int) $opponentRun['valid_reps']);

        $score = static function (array $run) use ($weights, $minDuration, $maxExercises, $maxReps): array {
            $metrics = [
                'time' => self::clamp01($minDuration / max(1, (int) $run['duration_seconds'])) * 100,
                'exercises' => self::clamp01((int) $run['exercises_completed'] / $maxExercises) * 100,
                'reps' => self::clamp01((int) $run['valid_reps'] / $maxReps) * 100,
                'consistency' => self::clamp01((int) $run['consistency'] / 100) * 100,
                'penalties' => 100 - min(100, max(0, (int) $run['penalties']) * 10),
            ];

            $total = 0.0;
            foreach ($weights as $key => $weight) {
                $total += $metrics[$key] * $weight;
            }

            return [
                'total' => (int) round($total),
                'breakdown' => [
                    'Tiempo' => (int) round($metrics['time']),
                    'Ejercicios' => (int) round($metrics['exercises']),
                    'Repeticiones' => (int) round($metrics['reps']),
                    'Consistencia' => (int) round($metrics['consistency']),
                    'Penalizaciones' => (int) round($metrics['penalties']),
                ],
            ];
        };

        $challenger = $score($challengerRun);
        $opponent = $score($opponentRun);

        $winner = match (true) {
            $challenger['total'] === $opponent['total'] => 'draw',
            $challenger['total'] > $opponent['total'] => 'challenger',
            default => 'opponent',
        };

        return [
            'modality' => $modality,
            'weights' => $weights,
            'challenger' => $challenger,
            'opponent' => $opponent,
            'winner' => $winner,
        ];
    }

    private static function clamp01(float $value): float
    {
        if (! is_finite($value)) {
            return 0.0;
        }

        return max(0.0, min(1.0, $value));
    }
}
