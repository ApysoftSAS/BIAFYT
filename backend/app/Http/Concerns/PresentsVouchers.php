<?php

namespace App\Http\Concerns;

use App\Models\Voucher;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * Shared response shape + issue-payload validation for the voucher
 * endpoints, so the Gym and Coach issuer controllers and the athlete
 * self-controller all return an identical voucher object.
 */
trait PresentsVouchers
{
    /**
     * Validate the body of an "issue a voucher" request (the parts that are
     * common to both issuer surfaces). `athlete_user_id` is validated by the
     * caller against its own gate, never here.
     *
     * @return array<string, mixed>
     */
    protected function validateVoucherPayload(Request $request): array
    {
        $validated = $request->validate([
            'title' => ['required', 'string', 'max:255'],
            'benefit_type' => ['required', Rule::in(Voucher::BENEFIT_TYPES)],
            'benefit_value' => ['nullable', 'integer', 'min:1'],
            'benefit_description' => ['required', 'string', 'max:2000'],
            'applies_to' => ['nullable', 'string', 'max:255'],
            'expires_at' => ['nullable', 'date'],
            // "Valid for N days from today" — an alternative to a fixed date.
            'valid_days' => ['nullable', 'integer', 'min:1', 'max:365'],
        ]);

        $expiresAt = $this->voucherExpiry($validated);
        $type = $validated['benefit_type'];
        $value = $validated['benefit_value'] ?? null;

        if (in_array($type, [Voucher::BENEFIT_PERCENT, Voucher::BENEFIT_FIXED], true) && $value === null) {
            throw ValidationException::withMessages([
                'benefit_value' => ['benefit_value is required for a percent or fixed benefit.'],
            ]);
        }

        if ($type === Voucher::BENEFIT_PERCENT && $value !== null && $value > 100) {
            throw ValidationException::withMessages([
                'benefit_value' => ['A percent benefit cannot exceed 100.'],
            ]);
        }

        if ($type === Voucher::BENEFIT_TEXT) {
            $value = null; // a text benefit carries no numeric value
        }

        return [
            'title' => $validated['title'],
            'benefit_type' => $type,
            'benefit_value' => $value,
            'benefit_description' => $validated['benefit_description'],
            'applies_to' => $validated['applies_to'] ?? null,
            'expires_at' => $expiresAt,
        ];
    }

    /**
     * The moment a voucher stops being usable, in UTC (the app's zone), or
     * null for "never expires".
     *
     * A bare date ("2026-11-20") or `valid_days` means THROUGH THE END OF THAT
     * DAY on the gym's wall clock (`report_timezone`): "expires on the 20th"
     * must still work on the 20th. (A bare date used to parse as the START of
     * the day in UTC, so it died the evening before in Colombia.) A full
     * timestamp is taken as given.
     *
     * @param  array<string, mixed>  $validated
     */
    private function voucherExpiry(array $validated): ?Carbon
    {
        $tz = config('app.report_timezone');
        $date = $validated['expires_at'] ?? null;
        $days = $validated['valid_days'] ?? null;

        if ($date !== null && $days !== null) {
            throw ValidationException::withMessages([
                'valid_days' => ['Use either an expiry date or valid_days, not both.'],
            ]);
        }

        if ($days !== null) {
            $expiresAt = Carbon::now($tz)->addDays((int) $days)->endOfDay();
        } elseif ($date !== null) {
            $expiresAt = preg_match('/^\d{4}-\d{2}-\d{2}$/', trim((string) $date))
                ? Carbon::parse(trim((string) $date), $tz)->endOfDay()
                : Carbon::parse($date);
        } else {
            return null;
        }

        if ($expiresAt->isPast()) {
            throw ValidationException::withMessages([
                'expires_at' => ['The expiry must be in the future.'],
            ]);
        }

        return $expiresAt->setTimezone(config('app.timezone'));
    }

    /**
     * The optional `?status=` filter for a voucher listing.
     */
    protected function voucherStatusFilter(Request $request): ?string
    {
        $validated = $request->validate([
            'status' => ['sometimes', Rule::in(Voucher::FILTERABLE_STATUSES)],
        ]);

        return $validated['status'] ?? null;
    }

    /**
     * @return array<string, mixed>
     */
    protected function mapVoucher(Voucher $voucher): array
    {
        return [
            'id' => $voucher->id,
            'code' => $voucher->code,
            'issuer_type' => $voucher->issuerType(),
            'gym' => $voucher->gym
                ? ['id' => $voucher->gym->id, 'name' => $voucher->gym->name]
                : null,
            'coach' => $voucher->coach
                ? ['id' => $voucher->coach->id, 'name' => $voucher->coach->name]
                : null,
            'athlete' => $voucher->athlete
                ? ['id' => $voucher->athlete->id, 'name' => $voucher->athlete->name]
                : null,
            'title' => $voucher->title,
            'benefit_type' => $voucher->benefit_type,
            'benefit_value' => $voucher->benefit_value,
            'benefit_description' => $voucher->benefit_description,
            'applies_to' => $voucher->applies_to,
            // True when the athlete obtained it by claiming a shared code.
            'via_code' => $voucher->campaign_id !== null,
            // Derived: `expired` when past expires_at while still issued.
            'status' => $voucher->effectiveStatus(),
            'expires_at' => $voucher->expires_at,
            'redeemed_at' => $voucher->redeemed_at,
            'redemption_note' => $voucher->redemption_note,
            'revoked_at' => $voucher->revoked_at,
            'revoke_reason' => $voucher->revoke_reason,
            'created_at' => $voucher->created_at,
        ];
    }
}
