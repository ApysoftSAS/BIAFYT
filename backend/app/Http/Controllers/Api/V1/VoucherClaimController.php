<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Concerns\PresentsVouchers;
use App\Http\Controllers\Controller;
use App\Models\GymAssignment;
use App\Models\Voucher;
use App\Models\VoucherCampaign;
use App\Support\Vouchers;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * A member claims a shared voucher code ("campaign") and receives their own
 * single-use voucher, which the gym then redeems as usual.
 *
 * Only ACTIVE MEMBERS of the campaign's gym can claim. An unknown code and a
 * code of a gym the caller does not belong to answer the same way, so codes
 * of other gyms cannot be probed. The route is throttled (guessing).
 */
class VoucherClaimController extends Controller
{
    use PresentsVouchers;

    public function store(Request $request): JsonResponse
    {
        $code = strtoupper(trim($request->validate(['code' => ['required', 'string', 'max:40']])['code']));
        $user = $request->user();

        $campaign = VoucherCampaign::where('code', $code)->first();

        $isMember = $campaign !== null && GymAssignment::query()
            ->where('user_id', $user->id)
            ->where('gym_id', $campaign->gym_id)
            ->where('role', GymAssignment::ROLE_MEMBER)
            ->where('status', GymAssignment::STATUS_ACTIVE)
            ->exists();

        if (! $isMember) {
            throw ValidationException::withMessages(['code' => ['This code is not valid for you.']]);
        }

        try {
            $voucher = DB::transaction(function () use ($campaign, $user) {
                // Serialise concurrent claims of the same campaign so the cap holds.
                $locked = VoucherCampaign::whereKey($campaign->id)->lockForUpdate()->firstOrFail();
                $claimed = Voucher::where('campaign_id', $locked->id)->count();

                $message = match ($locked->effectiveStatus($claimed)) {
                    VoucherCampaign::STATUS_CLOSED => 'This code is no longer available.',
                    VoucherCampaign::STATUS_EXPIRED => 'This code has expired.',
                    VoucherCampaign::STATUS_FULL => 'This code has no claims left.',
                    default => null,
                };

                if ($message !== null) {
                    throw ValidationException::withMessages(['code' => [$message]]);
                }

                if (Voucher::where('campaign_id', $locked->id)->where('athlete_user_id', $user->id)->exists()) {
                    throw ValidationException::withMessages(['code' => ['You already claimed this code.']]);
                }

                return Vouchers::issue([
                    'campaign_id' => $locked->id,
                    'gym_id' => $locked->gym_id,
                    'coach_user_id' => null,
                    'issued_by_user_id' => $locked->created_by_user_id,
                    'athlete_user_id' => $user->id,
                    'title' => $locked->title,
                    'benefit_type' => $locked->benefit_type,
                    'benefit_value' => $locked->benefit_value,
                    'benefit_description' => $locked->benefit_description,
                    'applies_to' => $locked->applies_to,
                    'expires_at' => $locked->expires_at,
                ]);
            });
        } catch (UniqueConstraintViolationException) {
            // Two simultaneous claims by the same member: the unique
            // (campaign, athlete) key is the last line of defence.
            throw ValidationException::withMessages(['code' => ['You already claimed this code.']]);
        }

        return response()->json([
            'voucher' => $this->mapVoucher($voucher->load(['gym:id,name'])),
        ], 201);
    }
}
