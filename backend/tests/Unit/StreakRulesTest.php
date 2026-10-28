<?php

namespace Tests\Unit;

use App\Support\StreakRules;
use PHPUnit\Framework\TestCase;

class StreakRulesTest extends TestCase
{
    private const TODAY = '2026-08-28';

    // Sin check-ins -> 0 / 0.
    public function test_no_check_ins_is_zero(): void
    {
        $this->assertSame(
            ['current_streak' => 0, 'longest_streak' => 0],
            StreakRules::fromDates([], self::TODAY)
        );
    }

    // Un check-in hoy -> 1 / 1.
    public function test_one_check_in_today_is_one(): void
    {
        $this->assertSame(
            ['current_streak' => 1, 'longest_streak' => 1],
            StreakRules::fromDates(['2026-08-28'], self::TODAY)
        );
    }

    // Días consecutivos terminando hoy -> incremento correcto.
    public function test_consecutive_days_ending_today_increment(): void
    {
        $this->assertSame(
            ['current_streak' => 4, 'longest_streak' => 4],
            StreakRules::fromDates(['2026-08-25', '2026-08-26', '2026-08-27', '2026-08-28'], self::TODAY)
        );
    }

    // Racha viva sin check-in hoy pero sí ayer (hoy aún no es un día perdido).
    public function test_streak_alive_when_last_check_in_was_yesterday(): void
    {
        $this->assertSame(
            ['current_streak' => 2, 'longest_streak' => 2],
            StreakRules::fromDates(['2026-08-26', '2026-08-27'], self::TODAY)
        );
    }

    // Día faltante -> ruptura: current cuenta solo la racha reciente, longest recuerda la anterior.
    public function test_a_missing_day_breaks_the_current_streak(): void
    {
        // 20,21,22 (racha de 3) -- hueco el 23,24,25,26 -- 27,28 (racha de 2, termina hoy).
        $result = StreakRules::fromDates(
            ['2026-08-20', '2026-08-21', '2026-08-22', '2026-08-27', '2026-08-28'],
            self::TODAY
        );

        $this->assertSame(2, $result['current_streak']);
        $this->assertSame(3, $result['longest_streak']);
    }

    // Último check-in hace 2+ días -> racha actual rota (0), longest se conserva.
    public function test_current_streak_is_zero_when_last_check_in_is_two_or_more_days_old(): void
    {
        $result = StreakRules::fromDates(['2026-08-24', '2026-08-25', '2026-08-26'], self::TODAY);

        $this->assertSame(0, $result['current_streak']);
        $this->assertSame(3, $result['longest_streak']);
    }

    // Fechas desordenadas y duplicadas se normalizan.
    public function test_unordered_and_duplicate_dates_are_normalized(): void
    {
        $this->assertSame(
            ['current_streak' => 3, 'longest_streak' => 3],
            StreakRules::fromDates(
                ['2026-08-28', '2026-08-26', '2026-08-28', '2026-08-27', '2026-08-26'],
                self::TODAY
            )
        );
    }
}
