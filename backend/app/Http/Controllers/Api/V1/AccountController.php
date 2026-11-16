<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\GymAssignment;
use App\Models\Voucher;
use App\Support\Audit;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

/**
 * Derechos del titular sobre sus datos (ISO 27701 7.3.6 / 7.3.9, Ley 1581, GDPR):
 * acceso y portabilidad (`export`) y supresión (`destroy`). Siempre sobre el
 * usuario del token; nunca se acepta un user_id del cliente.
 */
class AccountController extends Controller
{
    /** GET /me/data-export — copia de los datos personales del usuario, en JSON. */
    public function export(Request $request): JsonResponse
    {
        $user = $request->user();
        $rows = fn ($relation) => $relation->get()->toArray();

        Audit::record('account.export', $user->id);

        return response()->json([
            'exported_at' => now()->toIso8601String(),
            'user' => $user->only(['id', 'name', 'email', 'created_at']),
            'profile' => $user->profile?->toArray(),
            'gym_assignments' => $rows($user->gymAssignments()),
            'coach_relationships' => $rows($user->coachRelationshipsAsAthlete()),
            'check_ins' => $rows($user->checkIns()),
            'activities' => $rows($user->activities()),
            'workouts' => $rows($user->workouts()),
            'programs' => $rows($user->programs()),
            'point_transactions' => $rows($user->pointTransactions()),
            'challenge_claims' => $rows($user->challengeClaims()),
            'reward_claims' => $rows($user->rewardClaims()),
            'duels' => array_merge($rows($user->duelsAsChallenger()), $rows($user->duelsAsOpponent())),
            'vouchers' => Voucher::where('athlete_user_id', $user->id)->get()->toArray(),
        ]);
    }

    /**
     * DELETE /me/account — borra la cuenta y sus datos (cascada en BD) tras
     * confirmar la contraseña. No se permite si dejaría un gimnasio sin
     * administrador o si es administrador de la plataforma. El evento queda en
     * la auditoría sin identificar a la persona (user_id pasa a NULL).
     */
    public function destroy(Request $request): JsonResponse
    {
        $user = $request->user();
        $data = $request->validate(['password' => ['required', 'string']]);

        if (! Hash::check($data['password'], $user->password)) {
            throw ValidationException::withMessages(['password' => ['The password is incorrect.']]);
        }

        if ($user->is_platform_admin) {
            throw ValidationException::withMessages(['account' => ['A platform admin cannot delete their account; remove the role first.']]);
        }

        $soleAdmin = GymAssignment::where('user_id', $user->id)
            ->where('role', GymAssignment::ROLE_GYM_ADMIN)->where('status', GymAssignment::STATUS_ACTIVE)
            ->pluck('gym_id')->unique()
            ->contains(fn ($gymId) => ! GymAssignment::where('gym_id', $gymId)
                ->where('role', GymAssignment::ROLE_GYM_ADMIN)->where('status', GymAssignment::STATUS_ACTIVE)
                ->where('user_id', '!=', $user->id)->exists());

        if ($soleAdmin) {
            throw ValidationException::withMessages(['account' => ['You are the only admin of a gym; assign another admin before deleting your account.']]);
        }

        DB::transaction(function () use ($user) {
            $user->tokens()->delete();
            DB::table('sessions')->where('user_id', $user->id)->delete();
            $user->delete();
        });
        // Después de borrar: sin user_id, sin correo (ISO 27701 7.4.5).
        Audit::record('account.deleted', null);

        return response()->json(['message' => 'Account deleted.']);
    }
}
