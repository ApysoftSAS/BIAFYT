<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\Promotion;
use App\Models\PromotionRule;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * The BIAFYT Admin side of platform promotions (Promotion V1).
 *
 * Every action is gated by `User::is_platform_admin` (`assertPlatformAdmin`)
 * — a non-admin gets a 404, same posture as every other `Admin\*` controller.
 *
 * V1 scope: list + create only, same as V0 — no show/update/delete/status
 * toggle. A promotion is created together with its rules in one request; a
 * rule can never be added/edited/removed afterwards in this version.
 */
class PromotionController extends Controller
{
    /**
     * The full list of platform promotions with their rules, newest first.
     * No filters and no pagination — same flat-list shape as the other
     * `Admin\*` index endpoints (e.g. `GymController`, `EquipmentController`).
     */
    public function index(Request $request): JsonResponse
    {
        $this->assertPlatformAdmin($request);

        $promotions = Promotion::query()
            ->with('rules')
            ->orderByDesc('created_at')
            ->get()
            ->map(fn (Promotion $p) => $this->mapPromotion($p))
            ->values();

        return response()->json([
            'promotions' => $promotions,
        ]);
    }

    /**
     * Create a platform promotion together with its rules. `code` is
     * normalized (trim + uppercase) before the uniqueness check and the
     * insert. Requires at least one rule; a rule is an explicit
     * (audience, duration_months) pair with its own benefit — no "applies
     * to all audiences" wildcard in V1, and no duplicate rule for the same
     * (audience, duration_months) within the same promotion.
     */
    public function store(Request $request): JsonResponse
    {
        $this->assertPlatformAdmin($request);

        $validated = $request->validate([
            'code' => ['required', 'string', 'max:50'],
            'active' => ['sometimes', 'boolean'],
            'valid_from' => ['nullable', 'date'],
            'valid_until' => ['nullable', 'date', 'after_or_equal:valid_from'],
            'rules' => ['required', 'array', 'min:1'],
            'rules.*.audience' => ['required', Rule::in(PromotionRule::AUDIENCES)],
            'rules.*.duration_months' => ['required', Rule::in(PromotionRule::DURATIONS)],
            'rules.*.benefit_type' => ['required', Rule::in(PromotionRule::BENEFIT_TYPES)],
            'rules.*.benefit_value' => ['required', 'integer', 'min:1'],
        ]);

        $code = strtoupper(trim($validated['code']));

        if (Promotion::query()->where('code', $code)->exists()) {
            throw ValidationException::withMessages([
                'code' => ['This promotion code is already in use.'],
            ]);
        }

        foreach ($validated['rules'] as $rule) {
            if ($rule['benefit_type'] === PromotionRule::BENEFIT_PERCENT && $rule['benefit_value'] > 100) {
                throw ValidationException::withMessages([
                    'rules' => ['A percent benefit cannot exceed 100.'],
                ]);
            }
        }

        $seen = [];
        foreach ($validated['rules'] as $rule) {
            $key = $rule['audience'].'|'.$rule['duration_months'];
            if (isset($seen[$key])) {
                throw ValidationException::withMessages([
                    'rules' => ["Duplicate rule for {$rule['audience']} + {$rule['duration_months']} months."],
                ]);
            }
            $seen[$key] = true;
        }

        $promotion = DB::transaction(function () use ($validated, $code, $request) {
            $promotion = Promotion::create([
                'code' => $code,
                'active' => $validated['active'] ?? true,
                'valid_from' => $validated['valid_from'] ?? null,
                'valid_until' => $validated['valid_until'] ?? null,
                'created_by_user_id' => $request->user()->id,
            ]);

            foreach ($validated['rules'] as $rule) {
                $promotion->rules()->create($rule);
            }

            return $promotion;
        });

        return response()->json([
            'promotion' => $this->mapPromotion($promotion->load('rules')),
        ], 201);
    }

    /**
     * Abort with 404 unless the authenticated user is a BIAFYT Admin.
     */
    private function assertPlatformAdmin(Request $request): void
    {
        abort_unless((bool) $request->user()->is_platform_admin, 404);
    }

    /**
     * @return array<string, mixed>
     */
    private function mapPromotion(Promotion $promotion): array
    {
        return [
            'id' => $promotion->id,
            'code' => $promotion->code,
            'active' => $promotion->active,
            'valid_from' => $promotion->valid_from,
            'valid_until' => $promotion->valid_until,
            'created_at' => $promotion->created_at,
            'rules' => $promotion->rules->map(fn (PromotionRule $r) => [
                'id' => $r->id,
                'audience' => $r->audience,
                'duration_months' => $r->duration_months,
                'benefit_type' => $r->benefit_type,
                'benefit_value' => $r->benefit_value,
            ])->values(),
        ];
    }
}
