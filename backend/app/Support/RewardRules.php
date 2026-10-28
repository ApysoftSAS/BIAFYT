<?php

namespace App\Support;

/**
 * The backend source of truth for how much a prize costs. Ported verbatim
 * from the frontend reference (`data/prizes.js#prizeCatalog`) — only `id` +
 * `cost` are needed here (title/kind/condition/detail/unlock/source/gymId
 * stay frontend-only).
 *
 * This phase only validates that a `prize_id` is a known prize and debits
 * its cost. It does NOT verify the prize's unlock condition (rank position,
 * points threshold, duels won, etc.) — those stay frontend-only, same
 * accepted shadow-mode gap as App\Support\ChallengeRules not verifying
 * challenge completion.
 */
class RewardRules
{
    /**
     * @var list<array{id: string, cost: int}>
     */
    public const TEMPLATES = [
        ['id' => 'pz-mes-gratis', 'cost' => 0],
        ['id' => 'pz-semana-gratis', 'cost' => 0],
        ['id' => 'pz-desc-membresia', 'cost' => 1500],
        ['id' => 'pz-desc-producto', 'cost' => 800],
        ['id' => 'pz-clase-gratis', 'cost' => 600],
        ['id' => 'pz-valoracion', 'cost' => 1200],
        ['id' => 'pz-patrocinado', 'cost' => 400],
        ['id' => 'pz-duelo-legend', 'cost' => 0],
        ['id' => 'pz-gym-spinning', 'cost' => 300],
        ['id' => 'pz-gym-batido', 'cost' => 200],
    ];

    /**
     * The cost for `$prizeId`, or null if it is not a known prize.
     */
    public static function costFor(string $prizeId): ?int
    {
        foreach (self::TEMPLATES as $template) {
            if ($template['id'] === $prizeId) {
                return $template['cost'];
            }
        }

        return null;
    }
}
