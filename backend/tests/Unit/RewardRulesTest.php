<?php

namespace Tests\Unit;

use App\Support\RewardRules;
use PHPUnit\Framework\TestCase;

class RewardRulesTest extends TestCase
{
    // Paridad exacta con `data/prizes.js#prizeCatalog` (id + cost).
    public function test_cost_for_known_prizes_matches_the_frontend_catalog(): void
    {
        $this->assertSame(0, RewardRules::costFor('pz-mes-gratis'));
        $this->assertSame(0, RewardRules::costFor('pz-semana-gratis'));
        $this->assertSame(1500, RewardRules::costFor('pz-desc-membresia'));
        $this->assertSame(800, RewardRules::costFor('pz-desc-producto'));
        $this->assertSame(600, RewardRules::costFor('pz-clase-gratis'));
        $this->assertSame(1200, RewardRules::costFor('pz-valoracion'));
        $this->assertSame(400, RewardRules::costFor('pz-patrocinado'));
        $this->assertSame(0, RewardRules::costFor('pz-duelo-legend'));
        $this->assertSame(300, RewardRules::costFor('pz-gym-spinning'));
        $this->assertSame(200, RewardRules::costFor('pz-gym-batido'));
    }

    // Un id desconocido no es un prize válido.
    public function test_cost_for_unknown_prize_is_null(): void
    {
        $this->assertNull(RewardRules::costFor('pz-no-existe'));
        $this->assertNull(RewardRules::costFor(''));
    }

    // El catálogo tiene exactamente 10 entradas — mismo tamaño que el frontend.
    public function test_templates_has_the_same_count_as_the_frontend_catalog(): void
    {
        $this->assertCount(10, RewardRules::TEMPLATES);
    }
}
