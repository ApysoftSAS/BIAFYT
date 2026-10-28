<?php

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        // F1 (production hardening): apply the named `api` rate limiter
        // (defined in AppServiceProvider::boot() — 120 requests/minute per
        // user or IP) to the whole API group. Being a named limiter it keeps
        // its own counter, so the stricter route-level `throttle:6,1` on the
        // auth endpoints (routes/api.php) still governs register/login
        // independently.
        $middleware->throttleApi();

        // F2 (part 1): this is an API-only application with no `login` route.
        // The framework's default guest redirect points the Authenticate
        // middleware at `route('login')`, which it resolves EAGERLY for any
        // guest request that is not `expectsJson()` — throwing
        // RouteNotFoundException (a 500) before the AuthenticationException is
        // even constructed. Returning null keeps it a plain
        // AuthenticationException, which part 2 then renders as JSON.
        $middleware->redirectGuestsTo(fn () => null);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        // F2 (part 2): render every exception as JSON, even when the client
        // omits the `Accept: application/json` header, so an unauthenticated
        // request to a protected endpoint gets a clean 401 JSON body — never a
        // redirect or a 500.
        $exceptions->shouldRenderJsonWhen(fn () => true);
    })->create();
