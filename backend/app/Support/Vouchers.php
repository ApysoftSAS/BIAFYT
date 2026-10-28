<?php

namespace App\Support;

use App\Models\User;
use App\Models\Voucher;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Validation\ValidationException;
use RuntimeException;

/**
 * Shared create + lifecycle logic for ecosystem vouchers, used by both the
 * Gym issuer controller and the Coach issuer controller so the code
 * generation, the collision retry and the state transitions cannot drift
 * apart. Same "shared Support class" role as App\Support\ProgramTree.
 *
 * Nothing here touches points, rewards, promotions or billing.
 */
class Vouchers
{
    /** Crockford base32 alphabet (no I, L, O, U — unambiguous). */
    private const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

    private const CODE_LENGTH = 12;

    /** Test seam: overrides code generation (see generateCodesUsing). */
    private static $codeFactory = null;

    /**
     * A fresh, unguessable voucher code: `VCH-` + 12 Crockford-base32 chars
     * (~60 bits from PHP's CSPRNG). Uniqueness is still enforced by the
     * `UNIQUE(code)` column; `issue()` retries on the (astronomically
     * unlikely) collision.
     */
    public static function generateCode(): string
    {
        if (self::$codeFactory !== null) {
            return (self::$codeFactory)();
        }

        $code = 'VCH-';

        for ($i = 0; $i < self::CODE_LENGTH; $i++) {
            $code .= self::ALPHABET[random_int(0, strlen(self::ALPHABET) - 1)];
        }

        return $code;
    }

    /**
     * Test-only: replace the code generator with `$factory`, or pass null to
     * restore the default. Lets a test force a UNIQUE(code) collision and
     * assert the retry in issue(). Not used in production code.
     */
    public static function generateCodesUsing(?callable $factory): void
    {
        self::$codeFactory = $factory;
    }

    /**
     * Persist a new voucher, assigning a unique code and status `issued`.
     * The caller has already checked the issuer's authorization and that the
     * athlete is in scope. `$attributes` carries exactly one of `gym_id` /
     * `coach_user_id` plus `issued_by_user_id`, `athlete_user_id`, `title`,
     * `benefit_type`, `benefit_value`, `benefit_description`, `applies_to`,
     * `expires_at`.
     *
     * @param  array<string, mixed>  $attributes
     */
    public static function issue(array $attributes): Voucher
    {
        for ($attempt = 0; $attempt < 5; $attempt++) {
            try {
                return Voucher::create(array_merge($attributes, [
                    'code' => self::generateCode(),
                    'status' => Voucher::STATUS_ISSUED,
                ]));
            } catch (UniqueConstraintViolationException) {
                // The only unique constraint on `vouchers` is `code`; retry
                // with a fresh one (driver-agnostic, works on MySQL + SQLite).
            }
        }

        throw new RuntimeException('Could not allocate a unique voucher code.');
    }

    /**
     * `issued -> redeemed`, atomically. The conditional UPDATE
     * (`WHERE status = 'issued'`) is the race guard: of two concurrent
     * redeem calls, or a redeem racing a revoke, only one affects a row —
     * the other gets a 422. A pre-check gives the friendly "expired" /
     * "already <status>" message before the write.
     */
    public static function redeem(Voucher $voucher, User $by, ?string $note): Voucher
    {
        self::assertTransitionable($voucher, 'redeemed');

        $applied = Voucher::query()
            ->whereKey($voucher->id)
            ->where('status', Voucher::STATUS_ISSUED)
            ->update([
                'status' => Voucher::STATUS_REDEEMED,
                'redeemed_at' => now(),
                'redeemed_by_user_id' => $by->id,
                'redemption_note' => $note,
            ]);

        if ($applied === 0) {
            throw ValidationException::withMessages([
                'status' => ['This voucher can no longer be redeemed.'],
            ]);
        }

        return $voucher->fresh();
    }

    /**
     * `issued -> revoked`, atomically. Same race guard as redeem().
     */
    public static function revoke(Voucher $voucher, User $by, ?string $reason): Voucher
    {
        self::assertTransitionable($voucher, 'revoked');

        $applied = Voucher::query()
            ->whereKey($voucher->id)
            ->where('status', Voucher::STATUS_ISSUED)
            ->update([
                'status' => Voucher::STATUS_REVOKED,
                'revoked_at' => now(),
                'revoked_by_user_id' => $by->id,
                'revoke_reason' => $reason,
            ]);

        if ($applied === 0) {
            throw ValidationException::withMessages([
                'status' => ['This voucher can no longer be revoked.'],
            ]);
        }

        return $voucher->fresh();
    }

    private static function assertTransitionable(Voucher $voucher, string $target): void
    {
        if ($voucher->status !== Voucher::STATUS_ISSUED) {
            throw ValidationException::withMessages([
                'status' => ["Only an issued voucher can be {$target}."],
            ]);
        }

        // Revoking an already-expired voucher is still fine (it clears it
        // from the athlete's wallet); only redemption is blocked by expiry.
        if ($target === 'redeemed' && $voucher->isExpired()) {
            throw ValidationException::withMessages([
                'status' => ['This voucher has expired.'],
            ]);
        }
    }
}
