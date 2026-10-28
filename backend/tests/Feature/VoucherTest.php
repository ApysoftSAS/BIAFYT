<?php

namespace Tests\Feature;

use App\Models\Gym;
use App\Models\User;
use App\Models\Voucher;
use App\Support\Vouchers;
use DomainException;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Validation\ValidationException;
use Tests\TestCase;

/**
 * Ecosystem voucher domain — model invariants, code generation and the
 * atomic state transitions (App\Support\Vouchers). The API-level tests
 * cover the authorization gates.
 */
class VoucherTest extends TestCase
{
    use RefreshDatabase;

    private function base(User $athlete, array $overrides = []): array
    {
        return array_merge([
            'code' => Vouchers::generateCode(),
            'issued_by_user_id' => $athlete->id,
            'athlete_user_id' => $athlete->id,
            'title' => 'Beneficio',
            'benefit_type' => Voucher::BENEFIT_PERCENT,
            'benefit_value' => 20,
            'benefit_description' => '20% en la mensualidad',
            'status' => Voucher::STATUS_ISSUED,
        ], $overrides);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        Vouchers::generateCodesUsing(null);
        parent::tearDown();
    }

    // Invariante: exactamente un emisor (gym XOR coach).
    public function test_a_voucher_must_have_exactly_one_issuer(): void
    {
        $athlete = User::factory()->create();
        $gym = Gym::create(['name' => 'G']);
        $coach = User::factory()->create();

        // ninguno
        try {
            Voucher::create($this->base($athlete));
            $this->fail('expected DomainException for no issuer');
        } catch (DomainException) {
            $this->assertTrue(true);
        }

        // ambos
        try {
            Voucher::create($this->base($athlete, ['gym_id' => $gym->id, 'coach_user_id' => $coach->id]));
            $this->fail('expected DomainException for two issuers');
        } catch (DomainException) {
            $this->assertTrue(true);
        }

        // solo gym → ok
        $v = Voucher::create($this->base($athlete, ['gym_id' => $gym->id]));
        $this->assertSame('gym', $v->issuerType());
    }

    // UNIQUE(code): dos vouchers con el mismo código son rechazados por la BD.
    public function test_unique_code_rejects_a_duplicate(): void
    {
        $athlete = User::factory()->create();
        $gym = Gym::create(['name' => 'G']);
        $code = Vouchers::generateCode();

        Voucher::create($this->base($athlete, ['gym_id' => $gym->id, 'code' => $code]));

        $this->expectException(QueryException::class);
        Voucher::create($this->base($athlete, ['gym_id' => $gym->id, 'code' => $code]));
    }

    // El código es VCH- + 12 chars de un alfabeto sin caracteres ambiguos.
    public function test_generated_code_is_unguessable_and_well_formed(): void
    {
        $codes = collect(range(1, 200))->map(fn () => Vouchers::generateCode());

        foreach ($codes as $code) {
            $this->assertMatchesRegularExpression('/^VCH-[0-9A-HJKMNP-TV-Z]{12}$/', $code);
        }
        // 200 códigos, todos distintos (entropía suficiente).
        $this->assertCount(200, $codes->unique());
        // No secuencial: dos consecutivos no comparten prefijo largo.
        $this->assertNotSame(substr($codes[0], 0, 12), substr($codes[1], 0, 12));
    }

    // `expired` es derivado, nunca persistido.
    public function test_expired_status_is_derived_not_stored(): void
    {
        Carbon::setTestNow('2026-09-15 12:00:00');
        $athlete = User::factory()->create();
        $gym = Gym::create(['name' => 'G']);

        $v = Voucher::create($this->base($athlete, [
            'gym_id' => $gym->id,
            'expires_at' => '2026-09-14 12:00:00', // ayer
        ]));

        $this->assertSame(Voucher::STATUS_ISSUED, $v->status);            // columna
        $this->assertSame(Voucher::STATUS_EXPIRED, $v->effectiveStatus()); // derivado
        $this->assertFalse($v->isRedeemable());
        $this->assertDatabaseHas('vouchers', ['id' => $v->id, 'status' => Voucher::STATUS_ISSUED]);
    }

    // redeem(): issued -> redeemed, y una segunda redención falla.
    public function test_redeem_transitions_once(): void
    {
        $athlete = User::factory()->create();
        $issuer = User::factory()->create();
        $gym = Gym::create(['name' => 'G']);
        $v = Voucher::create($this->base($athlete, ['gym_id' => $gym->id]));

        $redeemed = Vouchers::redeem($v, $issuer, 'usado en recepción');
        $this->assertSame(Voucher::STATUS_REDEEMED, $redeemed->status);
        $this->assertNotNull($redeemed->redeemed_at);
        $this->assertSame($issuer->id, $redeemed->redeemed_by_user_id);

        $this->expectException(ValidationException::class);
        Vouchers::redeem($v->fresh(), $issuer, null);
    }

    // No se puede redimir un voucher expirado (sí revocarlo).
    public function test_cannot_redeem_an_expired_voucher_but_can_revoke_it(): void
    {
        Carbon::setTestNow('2026-09-15 12:00:00');
        $athlete = User::factory()->create();
        $issuer = User::factory()->create();
        $gym = Gym::create(['name' => 'G']);
        $v = Voucher::create($this->base($athlete, ['gym_id' => $gym->id, 'expires_at' => '2026-09-14 12:00:00']));

        try {
            Vouchers::redeem($v, $issuer, null);
            $this->fail('expected ValidationException (expired)');
        } catch (ValidationException) {
            $this->assertTrue(true);
        }

        $revoked = Vouchers::revoke($v->fresh(), $issuer, 'expiró sin uso');
        $this->assertSame(Voucher::STATUS_REVOKED, $revoked->status);
    }

    // redeem vs revoke concurrentes: solo una gana (UPDATE condicional).
    public function test_redeem_and_revoke_cannot_both_apply(): void
    {
        $athlete = User::factory()->create();
        $issuer = User::factory()->create();
        $gym = Gym::create(['name' => 'G']);
        $v = Voucher::create($this->base($athlete, ['gym_id' => $gym->id]));

        Vouchers::redeem($v, $issuer, null);

        // El voucher ya está redeemed; revoke sobre la instancia vieja falla.
        $this->expectException(ValidationException::class);
        Vouchers::revoke($v, $issuer, 'tarde');
    }

    // issue() reintenta ante una colisión de UNIQUE(code).
    public function test_issue_retries_on_a_code_collision(): void
    {
        $athlete = User::factory()->create();
        $gym = Gym::create(['name' => 'G']);

        $taken = 'VCH-AAAAAAAAAAAA';
        Voucher::create($this->base($athlete, ['gym_id' => $gym->id, 'code' => $taken]));

        $calls = 0;
        Vouchers::generateCodesUsing(function () use (&$calls, $taken) {
            $calls++;

            return $calls === 1 ? $taken : 'VCH-BBBBBBBBBBBB';
        });

        $v = Vouchers::issue([
            'gym_id' => $gym->id,
            'coach_user_id' => null,
            'issued_by_user_id' => $athlete->id,
            'athlete_user_id' => $athlete->id,
            'title' => 'X',
            'benefit_type' => Voucher::BENEFIT_TEXT,
            'benefit_value' => null,
            'benefit_description' => 'x',
        ]);

        $this->assertSame('VCH-BBBBBBBBBBBB', $v->code);
        $this->assertSame(2, $calls); // 1 colisión + 1 éxito
        $this->assertSame(2, Voucher::count());
    }

    // Borrar el atleta arrastra sus vouchers; borrar el gym solo desvincula.
    public function test_fk_delete_behaviour(): void
    {
        $athlete = User::factory()->create();
        $gym = Gym::create(['name' => 'G']);
        $v = Voucher::create($this->base($athlete, ['gym_id' => $gym->id]));

        $gym->delete();
        $this->assertNull($v->fresh()->gym_id);
        $this->assertNotNull($v->fresh());

        $athlete->delete();
        $this->assertSame(0, Voucher::count());
    }
}
