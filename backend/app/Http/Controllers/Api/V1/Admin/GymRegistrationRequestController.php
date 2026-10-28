<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Models\Branch;
use App\Models\Gym;
use App\Models\GymAssignment;
use App\Models\GymRegistrationRequest;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * The BIAFYT Admin side of gym onboarding.
 *
 * Every action is gated by `User::is_platform_admin` (`assertPlatformAdmin`).
 * A non-admin — like every unauthorized access in this API — gets a 404, so
 * the admin surface is not even discoverable.
 *
 * Approving a request creates, in ONE transaction: the Gym, its main Branch,
 * and an active gym_admin GymAssignment for the applicant. Approval is
 * idempotent: a second approve returns the already-created gym without
 * creating anything.
 */
class GymRegistrationRequestController extends Controller
{
    /**
     * List requests, newest first. `?status=pending|approved|rejected`
     * filters; omitted returns all.
     */
    public function index(Request $request): JsonResponse
    {
        $this->assertPlatformAdmin($request);

        $validated = $request->validate([
            'status' => ['nullable', 'string', 'in:pending,approved,rejected'],
        ]);

        $query = GymRegistrationRequest::query()
            ->with(['applicant', 'gym'])
            ->orderByDesc('id');

        if (isset($validated['status'])) {
            $query->where('status', $validated['status']);
        }

        $requests = $query->get()
            ->map(fn (GymRegistrationRequest $registrationRequest) => $this->mapRequest($registrationRequest))
            ->values();

        return response()->json([
            'gym_registration_requests' => $requests,
        ]);
    }

    /**
     * One request, with the applicant identity the admin needs to do due
     * diligence.
     */
    public function show(Request $request, int $registrationRequest): JsonResponse
    {
        $this->assertPlatformAdmin($request);

        $found = GymRegistrationRequest::with(['applicant', 'gym'])->findOrFail($registrationRequest);

        return response()->json([
            'gym_registration_request' => $this->mapRequest($found),
        ]);
    }

    /**
     * Approve a pending request. Idempotent. On the first approve, creates
     * Gym + main Branch + gym_admin GymAssignment atomically. A rejected
     * request cannot be approved (422).
     */
    public function approve(Request $request, int $registrationRequest): JsonResponse
    {
        $this->assertPlatformAdmin($request);

        $validated = $request->validate([
            'review_note' => ['nullable', 'string', 'max:2000'],
        ]);

        $reviewerId = $request->user()->id;
        $reviewNote = $validated['review_note'] ?? null;

        $result = DB::transaction(function () use ($registrationRequest, $reviewerId, $reviewNote) {
            /** @var GymRegistrationRequest $found */
            $found = GymRegistrationRequest::query()
                ->lockForUpdate()
                ->with('gym')
                ->findOrFail($registrationRequest);

            if ($found->status === GymRegistrationRequest::STATUS_APPROVED) {
                return $found; // idempotent no-op
            }

            if ($found->status === GymRegistrationRequest::STATUS_REJECTED) {
                throw ValidationException::withMessages([
                    'status' => ['A rejected request cannot be approved.'],
                ]);
            }

            $gym = Gym::create(['name' => $found->gym_name]);

            // The main Branch of the new gym.
            Branch::create(['gym_id' => $gym->id, 'name' => $found->branch_name]);

            // Gym-wide gym_admin for the applicant — same shape as
            // `BIAFYT:grant-gym-admin` (branch_id null).
            GymAssignment::create([
                'user_id' => $found->user_id,
                'gym_id' => $gym->id,
                'branch_id' => null,
                'role' => GymAssignment::ROLE_GYM_ADMIN,
                'status' => GymAssignment::STATUS_ACTIVE,
            ]);

            $found->update([
                'status' => GymRegistrationRequest::STATUS_APPROVED,
                'review_note' => $reviewNote,
                'reviewed_by_user_id' => $reviewerId,
                'reviewed_at' => now(),
                'gym_id' => $gym->id,
            ]);
            $found->setRelation('gym', $gym);

            return $found;
        });

        return response()->json([
            'gym_registration_request' => $this->mapRequest($result->load(['applicant', 'gym'])),
        ]);
    }

    /**
     * Reject a pending request. Idempotent (a second reject is a no-op). An
     * approved request cannot be rejected (422).
     */
    public function reject(Request $request, int $registrationRequest): JsonResponse
    {
        $this->assertPlatformAdmin($request);

        $validated = $request->validate([
            'review_note' => ['nullable', 'string', 'max:2000'],
        ]);

        $found = GymRegistrationRequest::query()->findOrFail($registrationRequest);

        if ($found->status === GymRegistrationRequest::STATUS_APPROVED) {
            throw ValidationException::withMessages([
                'status' => ['An approved request cannot be rejected.'],
            ]);
        }

        if ($found->status === GymRegistrationRequest::STATUS_PENDING) {
            $found->update([
                'status' => GymRegistrationRequest::STATUS_REJECTED,
                'review_note' => $validated['review_note'] ?? null,
                'reviewed_by_user_id' => $request->user()->id,
                'reviewed_at' => now(),
            ]);
        }

        return response()->json([
            'gym_registration_request' => $this->mapRequest($found->load(['applicant', 'gym'])),
        ]);
    }

    /**
     * Abort with 404 unless the authenticated user is a BIAFYT Admin.
     */
    private function assertPlatformAdmin(Request $request): void
    {
        abort_unless((bool) $request->user()->is_platform_admin, 404);
    }

    /**
     * Admin-facing shape. Includes the applicant's name + email (the admin
     * needs it to verify who is asking); still hides `user_id`, the reviewer
     * id, and everything else.
     *
     * @return array<string, mixed>
     */
    private function mapRequest(GymRegistrationRequest $registrationRequest): array
    {
        return [
            'id' => $registrationRequest->id,
            'status' => $registrationRequest->status,
            'gym_name' => $registrationRequest->gym_name,
            'branch_name' => $registrationRequest->branch_name,
            'applicant_message' => $registrationRequest->applicant_message,
            'applicant' => [
                'id' => $registrationRequest->applicant->id,
                'name' => $registrationRequest->applicant->name,
                'email' => $registrationRequest->applicant->email,
            ],
            'review_note' => $registrationRequest->review_note,
            'reviewed_at' => $registrationRequest->reviewed_at,
            'gym' => $registrationRequest->gym === null
                ? null
                : ['id' => $registrationRequest->gym->id, 'name' => $registrationRequest->gym->name],
            'created_at' => $registrationRequest->created_at,
        ];
    }
}
