<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Support\Audit;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Validation\Rules\Password;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    /**
     * Register a new user and issue an access token.
     *
     * No `promo_code` here (Promotion V1 changed this on purpose): a
     * Promotion V1 discount is keyed by audience + plan duration, neither of
     * which exists yet at registration time — redemption belongs to a future
     * purchase flow, not to sign-up. `PromotionRedemption` and its snapshot
     * pattern are unaffected and kept for that future flow.
     */
    public function register(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'string', 'email', 'max:255', 'unique:users,email'],
            // Misma política que el formulario del cliente (utils/auth.js#passwordIssues):
            // el servidor es quien la hace cumplir (SOC 2 CC6.1 / ISO 27001 A.5.17).
            'password' => ['required', 'string', Password::min(8)->letters()->numbers()],
        ]);

        $user = User::create([
            'name' => $validated['name'],
            'email' => $validated['email'],
            'password' => $validated['password'],
        ]);

        $token = $user->createToken('auth_token', ['*'], now()->addDays(config('auth.token_ttl_days')))->plainTextToken;

        Audit::record('auth.register', $user->id);

        return response()->json([
            'user' => $user,
            'token' => $token,
        ], 201);
    }

    /**
     * Authenticate a user and issue an access token.
     */
    public function login(Request $request): JsonResponse
    {
        $credentials = $request->validate([
            'email' => ['required', 'string', 'email'],
            'password' => ['required', 'string'],
        ]);

        // Bloqueo por CUENTA (además del throttle por IP de la ruta): 5 fallos en
        // 15 min bloquean ese correo desde cualquier IP (SOC 2 CC6.1 / ISO 27001 A.8.5).
        $lockKey = 'login-fail:'.sha1(strtolower($credentials['email']));
        if (RateLimiter::tooManyAttempts($lockKey, 5)) {
            Audit::record('auth.login_locked', null, ['email_hash' => hash('sha256', strtolower($credentials['email']))]);

            return response()->json([
                'message' => 'Too many failed attempts. Try again later.',
            ], 429)->header('Retry-After', (string) RateLimiter::availableIn($lockKey));
        }

        $user = User::where('email', $credentials['email'])->first();

        // Se calcula un hash siempre (aunque el correo no exista) para que el
        // tiempo de respuesta no revele qué correos están registrados.
        $valid = $user
            ? Hash::check($credentials['password'], $user->password)
            : (bool) Hash::make($credentials['password']) && false;

        if (! $user || ! $valid) {
            // Auditoría (SOC 2 CC7.2 / ISO 27001 A.8.15): sin correo ni contraseña
            // en claro; solo un hash del correo para poder correlacionar intentos.
            RateLimiter::hit($lockKey, 900);
            Audit::record('auth.login_failed', $user?->id, ['email_hash' => hash('sha256', strtolower($credentials['email']))]);
            Log::warning('auth.login_failed', [
                'email_hash' => hash('sha256', strtolower($credentials['email'])),
                'ip' => $request->ip(),
            ]);

            throw ValidationException::withMessages([
                'email' => ['The provided credentials are incorrect.'],
            ]);
        }

        $token = $user->createToken('auth_token', ['*'], now()->addDays(config('auth.token_ttl_days')))->plainTextToken;

        RateLimiter::clear($lockKey);
        Audit::record('auth.login', $user->id);

        return response()->json([
            'user' => $user,
            'token' => $token,
        ]);
    }

    /**
     * Revoke the access token used for the current request.
     */
    public function logout(Request $request): JsonResponse
    {
        $request->user()->currentAccessToken()->delete();
        Audit::record('auth.logout', $request->user()->id);

        return response()->json([
            'message' => 'Logged out successfully.',
        ]);
    }

    /**
     * Return the authenticated user.
     */
    public function me(Request $request): JsonResponse
    {
        return response()->json([
            'user' => $request->user(),
        ]);
    }
}
