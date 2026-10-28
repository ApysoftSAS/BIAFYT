<?php

namespace App\Providers;

use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        // F1 (production hardening): baseline rate limit for the whole API
        // group (see bootstrap/app.php `throttleApi()`). 120 requests/minute,
        // keyed by the authenticated user id or, when unauthenticated, by
        // client IP. This is a NAMED limiter so it never shares a counter with
        // the stricter route-level `throttle:6,1` on the auth endpoints.
        RateLimiter::for('api', fn (Request $request) => Limit::perMinute(120)
            ->by($request->user()?->getAuthIdentifier() ?: $request->ip()));
    }
}
