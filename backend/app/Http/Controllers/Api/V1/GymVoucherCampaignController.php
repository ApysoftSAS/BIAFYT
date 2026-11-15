<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Concerns\AssertsGymAdmin;
use App\Http\Concerns\PresentsVouchers;
use App\Http\Controllers\Controller;
use App\Models\VoucherCampaign;
use App\Support\Vouchers;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

/**
 * Shared-code vouchers ("campaigns") of a gym: the gym_admin creates a code
 * with an optional cap and expiry, lists them and closes them. Members claim
 * the code with `VoucherClaimController` and receive a personal voucher.
 * gym_admin only (staff cannot create campaigns), 404 for anyone else.
 */
class GymVoucherCampaignController extends Controller
{
    use AssertsGymAdmin;
    use PresentsVouchers;

    public function index(Request $request, int $gym): JsonResponse
    {
        $this->assertGymAdmin($request, $gym);

        $campaigns = VoucherCampaign::where('gym_id', $gym)
            ->withCount('vouchers')
            ->orderByDesc('id')
            ->get()
            ->map(fn (VoucherCampaign $c) => $this->mapCampaign($c))
            ->values();

        return response()->json(['campaigns' => $campaigns]);
    }

    /**
     * Create a campaign. Body = the usual voucher template (title, benefit…,
     * `expires_at` | `valid_days`) plus an optional memorable `code` (4–20
     * letters/digits; generated when omitted) and an optional `max_claims`
     * cap (omitted = unlimited).
     */
    public function store(Request $request, int $gym): JsonResponse
    {
        $this->assertGymAdmin($request, $gym);

        $extra = $request->validate([
            'code' => ['nullable', 'string', 'regex:/^[A-Za-z0-9]{4,20}$/'],
            'max_claims' => ['nullable', 'integer', 'min:1', 'max:100000'],
        ]);
        $payload = $this->validateVoucherPayload($request);

        $code = isset($extra['code']) ? strtoupper($extra['code']) : $this->freshCode();

        if (VoucherCampaign::where('code', $code)->exists()) {
            throw ValidationException::withMessages(['code' => ['That code is already in use.']]);
        }

        try {
            $campaign = VoucherCampaign::create(array_merge($payload, [
                'gym_id' => $gym,
                'created_by_user_id' => $request->user()->id,
                'code' => $code,
                'max_claims' => $extra['max_claims'] ?? null,
                'status' => VoucherCampaign::STATUS_ACTIVE,
            ]));
        } catch (UniqueConstraintViolationException) {
            throw ValidationException::withMessages(['code' => ['That code is already in use.']]);
        }

        return response()->json(['campaign' => $this->mapCampaign($campaign->loadCount('vouchers'))], 201);
    }

    /**
     * Stop new claims. Vouchers already claimed are untouched. Idempotent.
     */
    public function close(Request $request, int $gym, int $campaign): JsonResponse
    {
        $this->assertGymAdmin($request, $gym);

        $model = VoucherCampaign::where('gym_id', $gym)->findOrFail($campaign);
        $model->update(['status' => VoucherCampaign::STATUS_CLOSED]);

        return response()->json(['campaign' => $this->mapCampaign($model->loadCount('vouchers'))]);
    }

    private function freshCode(): string
    {
        do {
            $code = Vouchers::generateCampaignCode();
        } while (VoucherCampaign::where('code', $code)->exists());

        return $code;
    }

    /**
     * @return array<string, mixed>
     */
    private function mapCampaign(VoucherCampaign $c): array
    {
        $claimed = (int) $c->vouchers_count;

        return [
            'id' => $c->id,
            'code' => $c->code,
            'title' => $c->title,
            'benefit_type' => $c->benefit_type,
            'benefit_value' => $c->benefit_value,
            'benefit_description' => $c->benefit_description,
            'applies_to' => $c->applies_to,
            'expires_at' => $c->expires_at,
            'max_claims' => $c->max_claims,
            'claimed' => $claimed,
            'status' => $c->effectiveStatus($claimed),
            'created_at' => $c->created_at,
        ];
    }
}
