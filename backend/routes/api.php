<?php

use App\Http\Controllers\Api\V1\ActivityController;
use App\Http\Controllers\Api\V1\Admin\EquipmentController as AdminEquipmentController;
use App\Http\Controllers\Api\V1\Admin\EquipmentRequestController as AdminEquipmentRequestController;
use App\Http\Controllers\Api\V1\Admin\GymController as AdminGymController;
use App\Http\Controllers\Api\V1\Admin\GymRegistrationRequestController as AdminGymRegistrationRequestController;
use App\Http\Controllers\Api\V1\Admin\PromotionController as AdminPromotionController;
use App\Http\Controllers\Api\V1\AuthController;
use App\Http\Controllers\Api\V1\ChallengeController;
use App\Http\Controllers\Api\V1\CheckInController;
use App\Http\Controllers\Api\V1\CoachAthleteController;
use App\Http\Controllers\Api\V1\CoachAthleteRelationshipController;
use App\Http\Controllers\Api\V1\CoachVoucherController;
use App\Http\Controllers\Api\V1\DuelController;
use App\Http\Controllers\Api\V1\EquipmentController;
use App\Http\Controllers\Api\V1\ExerciseController;
use App\Http\Controllers\Api\V1\ExercisePerformanceController;
use App\Http\Controllers\Api\V1\GymAdminController;
use App\Http\Controllers\Api\V1\GymAssignmentController;
use App\Http\Controllers\Api\V1\GymController;
use App\Http\Controllers\Api\V1\GymRegistrationRequestController;
use App\Http\Controllers\Api\V1\GymVoucherController;
use App\Http\Controllers\Api\V1\PointController;
use App\Http\Controllers\Api\V1\ProfileController;
use App\Http\Controllers\Api\V1\ProgramController;
use App\Http\Controllers\Api\V1\ProgramDayController;
use App\Http\Controllers\Api\V1\ProgramExerciseController;
use App\Http\Controllers\Api\V1\RewardController;
use App\Http\Controllers\Api\V1\StreakController;
use App\Http\Controllers\Api\V1\VoucherController;
use App\Http\Controllers\Api\V1\WorkoutController;
use App\Http\Controllers\Api\V1\WorkoutExerciseController;
use Illuminate\Support\Facades\Route;

Route::prefix('v1')->group(function () {
    Route::prefix('auth')->group(function () {
        Route::middleware('throttle:6,1')->group(function () {
            Route::post('register', [AuthController::class, 'register']);
            Route::post('login', [AuthController::class, 'login']);
        });

        Route::middleware('auth:sanctum')->group(function () {
            Route::post('logout', [AuthController::class, 'logout']);
            Route::get('me', [AuthController::class, 'me']);
        });
    });

    // Public catalog: not user data, so it does not require auth:sanctum.
    Route::get('exercises', [ExerciseController::class, 'index']);
    Route::get('gyms', [GymController::class, 'index']);
    // Global equipment catalog + a single gym's inventory (which catalog
    // items it has and whether each is available). Public, same precedent.
    Route::get('equipment', [EquipmentController::class, 'index']);
    Route::get('gyms/{gym}/equipment', [EquipmentController::class, 'gymIndex'])->whereNumber('gym');

    Route::middleware('auth:sanctum')->group(function () {
        Route::get('profile', [ProfileController::class, 'show']);
        Route::patch('profile', [ProfileController::class, 'update']);

        Route::get('me/gym-assignments', [GymAssignmentController::class, 'index']);
        Route::post('me/gym-assignments', [GymAssignmentController::class, 'store']);
        Route::delete('me/gym-assignments/{id}', [GymAssignmentController::class, 'destroy']);

        Route::get('me/coach-relationships', [CoachAthleteRelationshipController::class, 'index']);
        Route::post('me/coach-relationships', [CoachAthleteRelationshipController::class, 'store']);
        Route::post('me/coach-relationships/{id}/accept', [CoachAthleteRelationshipController::class, 'accept']);
        Route::delete('me/coach-relationships/{id}', [CoachAthleteRelationshipController::class, 'destroy']);

        // Coach MVP: a coach with a currently `active` relationship reads an
        // athlete's (shadow-quality) information — profile, activity summary,
        // streak, points — and leaves free-text feedback notes. Read access
        // is gated per athlete by the active relationship; there is no new
        // points authority and nothing the athlete's app consumes yet.
        Route::get('me/coach/athletes', [CoachAthleteController::class, 'index']);
        Route::get('me/coach/athletes/{athleteUserId}', [CoachAthleteController::class, 'show']);
        Route::get('me/coach/athletes/{athleteUserId}/notes', [CoachAthleteController::class, 'notesIndex']);
        Route::post('me/coach/athletes/{athleteUserId}/notes', [CoachAthleteController::class, 'notesStore']);
        Route::delete('me/coach/notes/{note}', [CoachAthleteController::class, 'notesDestroy']);

        // Coach-authored training programs FOR a related athlete (slice
        // D-COACH-PROGRAMS). Gated by an active coach<->athlete relationship
        // only; GymAssignment plays no part. `user_id` = athlete (route),
        // `created_by_user_id` = coach (token). An optional reference gym
        // must be one the coach is assigned to; the athlete need not be.
        Route::whereNumber(['athleteUserId', 'program', 'voucher'])->group(function () {
            Route::get('me/coach/athletes/{athleteUserId}/programs', [CoachAthleteController::class, 'programsIndex']);
            Route::post('me/coach/athletes/{athleteUserId}/programs', [CoachAthleteController::class, 'programsStore']);
            Route::get('me/coach/athletes/{athleteUserId}/programs/{program}', [CoachAthleteController::class, 'programsShow']);
            Route::match(['put', 'patch'], 'me/coach/athletes/{athleteUserId}/programs/{program}', [CoachAthleteController::class, 'programsUpdate']);
            Route::delete('me/coach/athletes/{athleteUserId}/programs/{program}', [CoachAthleteController::class, 'programsDestroy']);

            // Ecosystem vouchers a coach issues to a related athlete (Fase
            // Vouchers V1). Gated by the active coach<->athlete relationship
            // only. The athlete redeems the benefit WITH the coach, off the
            // platform — BIAFYT does not process money or compute prices.
            Route::get('me/coach/athletes/{athleteUserId}/vouchers', [CoachVoucherController::class, 'index']);
            Route::post('me/coach/athletes/{athleteUserId}/vouchers', [CoachVoucherController::class, 'store']);
            Route::get('me/coach/athletes/{athleteUserId}/vouchers/{voucher}', [CoachVoucherController::class, 'show']);
            Route::post('me/coach/athletes/{athleteUserId}/vouchers/{voucher}/redeem', [CoachVoucherController::class, 'redeem']);
            Route::post('me/coach/athletes/{athleteUserId}/vouchers/{voucher}/revoke', [CoachVoucherController::class, 'revoke']);
        });

        // Gym MVP (slice D-GYM): a gym_admin manages the member/coach roles
        // of their own gym and reads a member's shadow-quality training
        // snapshot. Gated per gym by an active gym_admin GymAssignment; the
        // gym id comes only from the route. No gym_admin/staff grants, no
        // gym creation, no programs/workouts. Route params are numeric-only
        // (a non-numeric segment 404s at the router, never reaching the
        // controller as a bad type).
        Route::whereNumber(['gym', 'id', 'userId', 'equipment', 'equipmentRequest', 'voucher'])->group(function () {
            Route::get('me/gym/{gym}/members', [GymAdminController::class, 'members']);
            Route::get('me/gym/{gym}/coaches', [GymAdminController::class, 'coaches']);
            Route::get('me/gym/{gym}/user-lookup', [GymAdminController::class, 'userLookup']);
            Route::post('me/gym/{gym}/assignments', [GymAdminController::class, 'storeAssignment']);
            Route::delete('me/gym/{gym}/assignments/{id}', [GymAdminController::class, 'destroyAssignment']);
            Route::get('me/gym/{gym}/members/{userId}', [GymAdminController::class, 'memberDetail']);

            // Gym inventory management (slice D-GYM-INVENTORY): the gym_admin
            // sets which global-catalog equipment items exist in their gym
            // and whether each is available. The catalog itself is global and
            // never created here.
            Route::get('me/gym/{gym}/equipment', [GymAdminController::class, 'equipment']);
            Route::put('me/gym/{gym}/equipment/{equipment}', [GymAdminController::class, 'setEquipment']);
            Route::delete('me/gym/{gym}/equipment/{equipment}', [GymAdminController::class, 'removeEquipment']);

            // Equipment-catalog requests: the gym asks BIAFYT to add a
            // machine that is not in the global catalog. The gym can edit +
            // resubmit while pending/changes_requested; it never approves.
            Route::get('me/gym/{gym}/equipment-requests', [GymAdminController::class, 'equipmentRequests']);
            Route::post('me/gym/{gym}/equipment-requests', [GymAdminController::class, 'storeEquipmentRequest']);
            Route::get('me/gym/{gym}/equipment-requests/{equipmentRequest}', [GymAdminController::class, 'showEquipmentRequest']);
            Route::match(['put', 'patch'], 'me/gym/{gym}/equipment-requests/{equipmentRequest}', [GymAdminController::class, 'updateEquipmentRequest']);

            // Ecosystem vouchers a gym issues to its active members (Fase
            // Vouchers V1). Gated by an active gym_admin GymAssignment in
            // `{gym}` + the recipient being an active member of `{gym}`. The
            // athlete redeems the benefit WITH the gym, off the platform —
            // BIAFYT does not process money or compute prices.
            Route::get('me/gym/{gym}/vouchers', [GymVoucherController::class, 'index']);
            Route::post('me/gym/{gym}/vouchers', [GymVoucherController::class, 'store']);
            Route::get('me/gym/{gym}/vouchers/{voucher}', [GymVoucherController::class, 'show']);
            Route::post('me/gym/{gym}/vouchers/{voucher}/redeem', [GymVoucherController::class, 'redeem']);
            Route::post('me/gym/{gym}/vouchers/{voucher}/revoke', [GymVoucherController::class, 'revoke']);
        });

        // Real duels (roadmap 3b): two real users compete over the SAME
        // routine. The challenger creates, the opponent accepts, both submit
        // a run, and the backend resolves the winner head-to-head
        // (App\Support\DuelRules). Every action is scoped to the
        // authenticated participant (challenger/opponent) — a non-participant
        // gets a 404. `stake` mirrors the LocalStorage bet; a decisive
        // finish writes a best-effort PointTransaction per participant
        // (duel_won / duel_lost, the ledger's 5th source) but the visible
        // balance stays LocalStorage.
        Route::get('me/duels', [DuelController::class, 'index']);
        Route::get('me/duels/opponents', [DuelController::class, 'opponents']);
        Route::post('me/duels', [DuelController::class, 'store']);
        Route::whereNumber('duel')->group(function () {
            Route::get('me/duels/{duel}', [DuelController::class, 'show']);
            Route::post('me/duels/{duel}/accept', [DuelController::class, 'accept']);
            Route::post('me/duels/{duel}/reject', [DuelController::class, 'reject']);
            Route::post('me/duels/{duel}/cancel', [DuelController::class, 'cancel']);
            Route::post('me/duels/{duel}/run', [DuelController::class, 'run']);
        });

        Route::post('me/programs', [ProgramController::class, 'store']);
        Route::get('me/programs', [ProgramController::class, 'index']);
        Route::get('me/programs/{program}', [ProgramController::class, 'show']);
        Route::patch('me/programs/{program}', [ProgramController::class, 'update']);
        Route::delete('me/programs/{program}', [ProgramController::class, 'destroy']);
        // Athlete marks a coach-authored program as copied into their local
        // routines — persistent, per-athlete (see ProgramController@import).
        Route::post('me/programs/{program}/import', [ProgramController::class, 'import']);

        Route::post('me/programs/{program}/days', [ProgramDayController::class, 'store']);
        Route::patch('me/program-days/{programDay}', [ProgramDayController::class, 'update']);
        Route::delete('me/program-days/{programDay}', [ProgramDayController::class, 'destroy']);

        Route::post('me/program-days/{programDay}/exercises', [ProgramExerciseController::class, 'store']);
        Route::patch('me/program-exercises/{programExercise}', [ProgramExerciseController::class, 'update']);
        Route::delete('me/program-exercises/{programExercise}', [ProgramExerciseController::class, 'destroy']);

        Route::post('me/workouts', [WorkoutController::class, 'store']);
        Route::get('me/workouts', [WorkoutController::class, 'index']);
        Route::get('me/workouts/{workout}', [WorkoutController::class, 'show']);
        Route::patch('me/workouts/{workout}', [WorkoutController::class, 'update']);
        Route::delete('me/workouts/{workout}', [WorkoutController::class, 'destroy']);

        Route::post('me/workouts/{workout}/exercises', [WorkoutExerciseController::class, 'store']);
        Route::patch('me/workout-exercises/{workoutExercise}', [WorkoutExerciseController::class, 'update']);
        Route::delete('me/workout-exercises/{workoutExercise}', [WorkoutExerciseController::class, 'destroy']);

        Route::post('me/workout-exercises/{workoutExercise}/performances', [ExercisePerformanceController::class, 'store']);
        Route::patch('me/exercise-performances/{exercisePerformance}', [ExercisePerformanceController::class, 'update']);
        Route::delete('me/exercise-performances/{exercisePerformance}', [ExercisePerformanceController::class, 'destroy']);

        // Activity: the historical record of a completed training session,
        // plus the authoritative points ledger it feeds. The ledger has no
        // write endpoint — it is append-only, populated only as a side
        // effect of recording an activity.
        Route::post('me/activities', [ActivityController::class, 'store']);
        Route::get('me/activities', [ActivityController::class, 'index']);
        Route::get('me/points', [PointController::class, 'show']);

        // Daily gym check-in. Recording it credits a flat `checkin` amount to
        // the same points ledger (one per calendar day). The streak counter
        // stays frontend-local — this phase only records + credits.
        Route::post('me/check-ins', [CheckInController::class, 'store']);
        Route::get('me/check-ins', [CheckInController::class, 'index']);
        Route::patch('me/check-ins/today/check-out', [CheckInController::class, 'checkOut']);

        // Authoritative check-in streak, derived exclusively from the user's
        // own check_ins. Read-only; does not (yet) feed points or replace
        // the frontend's local streak.
        Route::get('me/streak', [StreakController::class, 'show']);

        // Daily challenge claim. Shadow mode: records the claim and credits
        // the challenge's reward (from App\Support\ChallengeRules) to the
        // ledger — completion is NOT verified here (still computed frontend-side).
        Route::post('me/challenge-claims', [ChallengeController::class, 'store']);
        Route::get('me/challenge-claims', [ChallengeController::class, 'index']);

        // Prize redemption. Shadow mode: records the claim and debits the
        // prize's cost (from App\Support\RewardRules) from the ledger — the
        // prize's unlock condition (rank, points threshold, duels won, ...)
        // is NOT verified here (still computed frontend-side).
        Route::post('me/reward-claims', [RewardController::class, 'store']);
        Route::get('me/reward-claims', [RewardController::class, 'index']);

        // Ecosystem vouchers issued TO the authenticated athlete by a gym or
        // a coach (Fase Vouchers V1). Read-only for the athlete: issuing,
        // redeeming and revoking are the issuer's actions. Self-scoped.
        Route::get('me/vouchers', [VoucherController::class, 'index']);
        Route::get('me/vouchers/{voucher}', [VoucherController::class, 'show'])->whereNumber('voucher');

        // Gym onboarding — applicant side. A user submits a request to
        // register a gym and sees its status. The applicant never decides the
        // outcome and can never self-assign a role: `status`/`user_id`/
        // `gym_id`/`reviewed_*` are never read from the body. At most one
        // `pending` request per user.
        Route::post('me/gym-registration-request', [GymRegistrationRequestController::class, 'store']);
        Route::get('me/gym-registration-request', [GymRegistrationRequestController::class, 'index']);

        // Gym onboarding — BIAFYT Admin side. Every action is gated by
        // `User::is_platform_admin` (404 for anyone else — the surface is not
        // discoverable). Approving a request creates Gym + main Branch +
        // active gym_admin GymAssignment atomically, and is idempotent.
        Route::prefix('admin')->whereNumber(['registrationRequest', 'equipment', 'equipmentRequest'])->group(function () {
            Route::get('gym-registration-requests', [AdminGymRegistrationRequestController::class, 'index']);
            Route::get('gym-registration-requests/{registrationRequest}', [AdminGymRegistrationRequestController::class, 'show']);
            Route::post('gym-registration-requests/{registrationRequest}/approve', [AdminGymRegistrationRequestController::class, 'approve']);
            Route::post('gym-registration-requests/{registrationRequest}/reject', [AdminGymRegistrationRequestController::class, 'reject']);
            Route::get('gyms', [AdminGymController::class, 'index']);

            // Platform promotions (Promotion V1) — discounts on Athlete/Coach/Gym
            // Premium memberships, rules keyed by audience + plan duration.
            // List + create only, no show/update/delete/status.
            Route::get('promotions', [AdminPromotionController::class, 'index']);
            Route::post('promotions', [AdminPromotionController::class, 'store']);

            // Global equipment catalog — the ONLY place `equipment` is
            // written. Gym cannot touch it.
            Route::get('equipment', [AdminEquipmentController::class, 'index']);
            Route::post('equipment', [AdminEquipmentController::class, 'store']);
            Route::get('equipment/{equipment}', [AdminEquipmentController::class, 'show']);
            Route::match(['put', 'patch'], 'equipment/{equipment}', [AdminEquipmentController::class, 'update']);

            // Equipment-catalog requests from gyms: review flow.
            Route::get('equipment-requests', [AdminEquipmentRequestController::class, 'index']);
            Route::get('equipment-requests/{equipmentRequest}', [AdminEquipmentRequestController::class, 'show']);
            Route::post('equipment-requests/{equipmentRequest}/start-review', [AdminEquipmentRequestController::class, 'startReview']);
            Route::post('equipment-requests/{equipmentRequest}/request-changes', [AdminEquipmentRequestController::class, 'requestChanges']);
            Route::match(['put', 'patch'], 'equipment-requests/{equipmentRequest}', [AdminEquipmentRequestController::class, 'correctInfo']);
            Route::post('equipment-requests/{equipmentRequest}/reject', [AdminEquipmentRequestController::class, 'reject']);
            Route::post('equipment-requests/{equipmentRequest}/approve', [AdminEquipmentRequestController::class, 'approve']);
        });
    });
});
