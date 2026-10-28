<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\Equipment;
use App\Models\EquipmentRequest;
use App\Models\EquipmentRequestEvent;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/**
 * The BIAFYT Admin side of equipment-catalog requests.
 *
 * Gated by `User::is_platform_admin` (`assertPlatformAdmin`) — a non-admin
 * gets a 404. The gym that filed the request can never reach these
 * endpoints, and can never approve/reject its own request.
 *
 * Review flow (transitions are validated; an invalid one is a 422):
 *   pending           --start-review-->  in_review
 *   in_review         --request-changes-> changes_requested   (gym then edits + resubmits -> pending)
 *   in_review         --correct-info---->  in_review           (admin fixes the proposal in place)
 *   in_review         --approve--------->  approved            (link an existing equipment, or create a new one)
 *   in_review         --reject---------->  rejected
 *
 * Approving does NOT add the equipment to any gym's inventory.
 */
class EquipmentRequestController extends Controller
{
    /**
     * List requests, newest first. `?status=` and `?gym_id=` filter.
     */
    public function index(Request $request): JsonResponse
    {
        $this->assertPlatformAdmin($request);

        $validated = $request->validate([
            'status' => ['nullable', 'string', 'in:pending,in_review,changes_requested,approved,rejected'],
            'gym_id' => ['nullable', 'integer'],
        ]);

        $query = EquipmentRequest::query()
            ->with(['gym', 'requester', 'resultingEquipment', 'events.actor'])
            ->orderByDesc('id');

        if (isset($validated['status'])) {
            $query->where('status', $validated['status']);
        }
        if (isset($validated['gym_id'])) {
            $query->where('gym_id', $validated['gym_id']);
        }

        $requests = $query->get()
            ->map(fn (EquipmentRequest $r) => $this->mapRequest($r))
            ->values();

        return response()->json(['equipment_requests' => $requests]);
    }

    public function show(Request $request, int $equipmentRequest): JsonResponse
    {
        $this->assertPlatformAdmin($request);

        $found = EquipmentRequest::with(['gym', 'requester', 'resultingEquipment', 'events.actor'])
            ->findOrFail($equipmentRequest);

        return response()->json(['equipment_request' => $this->mapRequest($found)]);
    }

    /**
     * pending -> in_review.
     */
    public function startReview(Request $request, int $equipmentRequest): JsonResponse
    {
        $this->assertPlatformAdmin($request);

        $found = EquipmentRequest::findOrFail($equipmentRequest);
        $this->assertStatus($found, [EquipmentRequest::STATUS_PENDING]);

        $found->update(['status' => EquipmentRequest::STATUS_IN_REVIEW]);
        $found->recordEvent('review_started', $request->user()->id);

        return $this->respond($found);
    }

    /**
     * in_review -> changes_requested. `review_note` is required — the gym
     * needs to know what to fix.
     */
    public function requestChanges(Request $request, int $equipmentRequest): JsonResponse
    {
        $this->assertPlatformAdmin($request);

        $validated = $request->validate([
            'review_note' => ['required', 'string', 'max:2000'],
        ]);

        $found = EquipmentRequest::findOrFail($equipmentRequest);
        $this->assertStatus($found, [EquipmentRequest::STATUS_IN_REVIEW]);

        $found->update([
            'status' => EquipmentRequest::STATUS_CHANGES_REQUESTED,
            'review_note' => $validated['review_note'],
            'reviewed_by_user_id' => $request->user()->id,
            'reviewed_at' => now(),
        ]);
        $found->recordEvent('changes_requested', $request->user()->id, $validated['review_note']);

        return $this->respond($found);
    }

    /**
     * Fix the submitted proposal in place while it is `in_review`
     * ("corregir la información enviada"). Does not change the status.
     */
    public function correctInfo(Request $request, int $equipmentRequest): JsonResponse
    {
        $this->assertPlatformAdmin($request);

        $found = EquipmentRequest::findOrFail($equipmentRequest);
        $this->assertStatus($found, [EquipmentRequest::STATUS_IN_REVIEW]);

        $validated = $request->validate([
            'name' => ['sometimes', 'string', 'max:255'],
            'brand' => ['sometimes', 'nullable', 'string', 'max:255'],
            'model' => ['sometimes', 'nullable', 'string', 'max:255'],
            'description' => ['sometimes', 'nullable', 'string', 'max:2000'],
            'category' => ['sometimes', 'nullable', 'string', 'max:120'],
            'photo_urls' => ['sometimes', 'nullable', 'array', 'max:8'],
            'photo_urls.*' => ['string', 'url', 'max:2048'],
        ]);

        $found->fill($validated)->save();
        $found->recordEvent('info_corrected', $request->user()->id);

        return $this->respond($found);
    }

    /**
     * in_review -> rejected.
     */
    public function reject(Request $request, int $equipmentRequest): JsonResponse
    {
        $this->assertPlatformAdmin($request);

        $validated = $request->validate([
            'review_note' => ['nullable', 'string', 'max:2000'],
        ]);

        $found = EquipmentRequest::findOrFail($equipmentRequest);
        $this->assertStatus($found, [EquipmentRequest::STATUS_IN_REVIEW]);

        $found->update([
            'status' => EquipmentRequest::STATUS_REJECTED,
            'review_note' => $validated['review_note'] ?? null,
            'reviewed_by_user_id' => $request->user()->id,
            'reviewed_at' => now(),
        ]);
        $found->recordEvent('rejected', $request->user()->id, $validated['review_note'] ?? null);

        return $this->respond($found);
    }

    /**
     * in_review -> approved. The admin must resolve the duplicate question
     * explicitly: EITHER
     *   - `equipment_id`: associate the request with an existing catalog
     *     item (no new row — the anti-duplicate path), OR
     *   - `create_equipment`: create a new catalog item from the (possibly
     *     admin-corrected) proposal.
     * Exactly one of the two is required. Approving never adds the item to
     * any gym's inventory.
     */
    public function approve(Request $request, int $equipmentRequest): JsonResponse
    {
        $this->assertPlatformAdmin($request);

        $validated = $request->validate([
            'review_note' => ['nullable', 'string', 'max:2000'],
            'equipment_id' => ['nullable', 'integer', 'exists:equipment,id'],
            'create_equipment' => ['nullable', 'boolean'],
        ]);

        $associate = isset($validated['equipment_id']);
        $create = (bool) ($validated['create_equipment'] ?? false);

        if ($associate === $create) {
            throw ValidationException::withMessages([
                'equipment_id' => ['Provide exactly one of `equipment_id` (associate an existing item) or `create_equipment: true` (create a new one).'],
            ]);
        }

        $reviewerId = $request->user()->id;
        $reviewNote = $validated['review_note'] ?? null;

        $found = DB::transaction(function () use ($equipmentRequest, $associate, $validated, $reviewerId, $reviewNote) {
            /** @var EquipmentRequest $found */
            $found = EquipmentRequest::query()->lockForUpdate()->findOrFail($equipmentRequest);
            $this->assertStatus($found, [EquipmentRequest::STATUS_IN_REVIEW]);

            if ($associate) {
                $equipment = Equipment::findOrFail($validated['equipment_id']);
            } else {
                $equipment = Equipment::create([
                    'slug' => $this->uniqueSlug($found->name),
                    'name' => $found->name,
                    'description' => $found->description,
                    'brand' => $found->brand,
                    'model' => $found->model,
                    'category' => $found->category,
                    'photo_urls' => $found->photo_urls,
                    'is_active' => true,
                ]);
            }

            $found->update([
                'status' => EquipmentRequest::STATUS_APPROVED,
                'review_note' => $reviewNote,
                'reviewed_by_user_id' => $reviewerId,
                'reviewed_at' => now(),
                'resulting_equipment_id' => $equipment->id,
            ]);
            $found->recordEvent('approved', $reviewerId, $reviewNote);

            return $found;
        });

        return $this->respond($found);
    }

    // ----------------------------------------------------------------

    private function assertPlatformAdmin(Request $request): void
    {
        abort_unless((bool) $request->user()->is_platform_admin, 404);
    }

    /**
     * @param  list<string>  $allowed
     */
    private function assertStatus(EquipmentRequest $r, array $allowed): void
    {
        if (! in_array($r->status, $allowed, true)) {
            throw ValidationException::withMessages([
                'status' => ["This action is not allowed while the request is `{$r->status}`."],
            ]);
        }
    }

    private function uniqueSlug(string $name): string
    {
        $base = Str::slug($name) ?: 'equipo';
        $slug = $base;
        $n = 2;
        while (Equipment::where('slug', $slug)->exists()) {
            $slug = "{$base}-{$n}";
            $n++;
        }

        return $slug;
    }

    private function respond(EquipmentRequest $r): JsonResponse
    {
        return response()->json([
            'equipment_request' => $this->mapRequest($r->load(['gym', 'requester', 'resultingEquipment', 'events.actor'])),
        ]);
    }

    /**
     * Admin-facing shape: includes the gym, the requester identity, and the
     * actor name on each audit event.
     *
     * @return array<string, mixed>
     */
    private function mapRequest(EquipmentRequest $r): array
    {
        return [
            'id' => $r->id,
            'status' => $r->status,
            'gym' => ['id' => $r->gym->id, 'name' => $r->gym->name],
            'requester' => [
                'id' => $r->requester->id,
                'name' => $r->requester->name,
                'email' => $r->requester->email,
            ],
            'name' => $r->name,
            'brand' => $r->brand,
            'model' => $r->model,
            'description' => $r->description,
            'category' => $r->category,
            'photo_urls' => $r->photo_urls ?? [],
            'review_note' => $r->review_note,
            'reviewed_at' => $r->reviewed_at,
            'resulting_equipment' => $r->resultingEquipment
                ? [
                    'id' => $r->resultingEquipment->id,
                    'name' => $r->resultingEquipment->name,
                    'slug' => $r->resultingEquipment->slug,
                ]
                : null,
            'events' => $r->events->map(fn (EquipmentRequestEvent $e) => [
                'action' => $e->action,
                'note' => $e->note,
                'actor' => $e->actor ? ['id' => $e->actor->id, 'name' => $e->actor->name] : null,
                'at' => $e->created_at,
            ])->values(),
            'created_at' => $r->created_at,
        ];
    }
}
