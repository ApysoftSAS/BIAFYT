<?php

namespace Tests\Unit;

use App\Support\PointRules;
use PHPUnit\Framework\TestCase;

class PointRulesTest extends TestCase
{
    // Constantes aprobadas por el diseño: PER_SET=6, PER_EXERCISE=12, PER_ACTIVITY_CAP=600,
    // STREAK_BONUS=10, STREAK_CAP=100 (paridad con frontend `POINT_RULES`).
    public function test_constants_match_the_approved_values(): void
    {
        $this->assertSame(6, PointRules::PER_SET);
        $this->assertSame(12, PointRules::PER_EXERCISE);
        $this->assertSame(600, PointRules::PER_ACTIVITY_CAP);
        $this->assertSame(10, PointRules::STREAK_BONUS);
        $this->assertSame(100, PointRules::STREAK_CAP);
    }

    // 0 series + 0 ejercicios = 0 puntos.
    public function test_zero_sets_and_zero_exercises_award_zero(): void
    {
        $this->assertSame(0, PointRules::forActivity(0, 0));
    }

    // Fórmula: sets*6 + exercises*12.
    public function test_formula_is_sets_times_six_plus_exercises_times_twelve(): void
    {
        $this->assertSame(6, PointRules::forActivity(1, 0));
        $this->assertSame(12, PointRules::forActivity(0, 1));
        $this->assertSame(42, PointRules::forActivity(3, 2)); // 18 + 24
        $this->assertSame(180, PointRules::forActivity(18, 6)); // 108 + 72
    }

    // Tope por actividad: nunca supera 600.
    public function test_result_is_capped_at_the_per_activity_cap(): void
    {
        // 100*6 = 600 exacto -> no se capa.
        $this->assertSame(600, PointRules::forActivity(100, 0));
        // 101*6 = 606 -> capado a 600.
        $this->assertSame(600, PointRules::forActivity(101, 0));
        $this->assertSame(600, PointRules::forActivity(1000, 1000));
    }

    // Conteos negativos se clampan a 0: nunca un otorgamiento negativo.
    public function test_negative_counts_are_clamped_to_zero(): void
    {
        $this->assertSame(0, PointRules::forActivity(-5, -5));
        $this->assertSame(12, PointRules::forActivity(-5, 1));
    }

    // streak=0 (default u omitido) no aporta nada — paridad con las pruebas previas.
    public function test_streak_defaults_to_zero(): void
    {
        $this->assertSame(42, PointRules::forActivity(3, 2));
        $this->assertSame(42, PointRules::forActivity(3, 2, 0));
    }

    // Bono de racha: streak * 10, sumado antes del tope por actividad.
    public function test_streak_bonus_is_streak_times_ten(): void
    {
        $this->assertSame(52, PointRules::forActivity(3, 2, 1)); // 42 + 10
        $this->assertSame(92, PointRules::forActivity(3, 2, 5)); // 42 + 50
    }

    // El bono de racha se capa en 100 (streak>=10), igual que el frontend.
    public function test_streak_bonus_is_capped_at_one_hundred(): void
    {
        $this->assertSame(142, PointRules::forActivity(3, 2, 10)); // 42 + 100
        $this->assertSame(142, PointRules::forActivity(3, 2, 50)); // 42 + 100 (no 542)
    }

    // Racha negativa se clampa a 0 — mismo criterio que sets/exercises.
    public function test_negative_streak_is_clamped_to_zero(): void
    {
        $this->assertSame(42, PointRules::forActivity(3, 2, -5));
    }

    // El bono de racha también respeta el tope general de la actividad (600).
    public function test_streak_bonus_respects_the_per_activity_cap(): void
    {
        $this->assertSame(600, PointRules::forActivity(100, 0, 10)); // 600 + 100 -> capado a 600
    }
}
