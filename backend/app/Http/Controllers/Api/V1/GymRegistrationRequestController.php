<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\GymRegistrationRequest;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

/**
 * The applicant's side of gym onboarding: submit a request to register a
 * gym, and see the status of your own requests.
 *
 * The applicant NEVER decides the outcome and can NEVER self-assign a role:
 * `status`, `user_id`, `gym_id`, `reviewed_*` are never read from the
 * request body. A BIAFYT Admin approves/rejects via the admin endpoints
 * (App\Http\Controllers\Api\V1\Admin\GymRegistrationRequestController).
 */
class GymRegistrationRequestController extends Controller
{
    /**
     * Submit a request to register a gym. At most one `pending` request per
     * user at a time (a second one → 422). A rejected request does not block
     * a fresh one.
     */
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'gym_name' => ['required', 'string', 'max:255'],
            'branch_name' => ['required', 'string', 'max:255'],
            'applicant_message' => ['nullable', 'string', 'max:2000'],
        ]);

        $hasPending = $request->user()->gymRegistrationRequests()
            ->where('status', GymRegistrationRequest::STATUS_PENDING)
            ->exists();

        if ($hasPending) {
            throw ValidationException::withMessages([
                'gym_name' => ['You already have a pending gym registration request.'],
            ]);
        }

        $registrationRequest = $request->user()->gymRegistrationRequests()->create([
            'status' => GymRegistrationRequest::STATUS_PENDING,
            'gym_name' => $validated['gym_name'],
            'branch_name' => $validated['branch_name'],
            'applicant_message' => $validated['applicant_message'] ?? null,
        ]);

        return response()->json([
            'gym_registration_request' => $this->mapRequest($registrationRequest),
        ], 201);
    }

    /**
     * The authenticated user's own gym-registration requests, newest first.
     */
    public function index(Request $request): JsonResponse
    {
        $requests = $request->user()->gymRegistrationRequests()
            ->with('gym')
            ->orderByDesc('id')
            ->get()
            ->map(fn (GymRegistrationRequest $registrationRequest) => $this->mapRequest($registrationRequest))
            ->values();

        return response()->json([
            'gym_registration_requests' => $requests,
        ]);
    }

    /**
     * The applicant-facing shape: no `user_id`, no reviewer identity, no
     * personal data. If approved, `gym` links to the created gym so the app
     * can point the user at the Gym Web panel.
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
            'review_note' => $registrationRequest->review_note,
            'reviewed_at' => $registrationRequest->reviewed_at,
            'gym' => $registrationRequest->gym === null
                ? null
                : ['id' => $registrationRequest->gym->id, 'name' => $registrationRequest->gym->name],
            'created_at' => $registrationRequest->created_at,
        ];
    }
}
