<?php

namespace App\Models;

// use Illuminate\Contracts\Auth\MustVerifyEmail;
use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasApiTokens, HasFactory, Notifiable;

    /**
     * The attributes that are mass assignable.
     *
     * @var list<string>
     */
    protected $fillable = [
        'name',
        'email',
        'password',
    ];

    /**
     * The attributes that should be hidden for serialization.
     *
     * @var list<string>
     */
    protected $hidden = [
        'password',
        'remember_token',
    ];

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            // Platform-level "BIAFYT Admin" flag. Never mass-assignable
            // (not in $fillable); set only by `BIAFYT:grant-platform-admin`.
            'is_platform_admin' => 'boolean',
        ];
    }

    /**
     * Get the profile associated with the user.
     */
    public function profile(): HasOne
    {
        return $this->hasOne(Profile::class);
    }

    /**
     * Get the gym-registration requests this user has submitted.
     */
    public function gymRegistrationRequests(): HasMany
    {
        return $this->hasMany(GymRegistrationRequest::class);
    }

    /**
     * Get the gym assignments (multi-gym, multi-branch, multi-role)
     * belonging to the user.
     */
    public function gymAssignments(): HasMany
    {
        return $this->hasMany(GymAssignment::class);
    }

    /**
     * Get the training programs belonging to the user.
     */
    public function programs(): HasMany
    {
        return $this->hasMany(Program::class);
    }

    /**
     * Get the workouts (actual training sessions) belonging to the user.
     */
    public function workouts(): HasMany
    {
        return $this->hasMany(Workout::class);
    }

    /**
     * Get the activities (historical records of completed training
     * sessions) belonging to the user.
     */
    public function activities(): HasMany
    {
        return $this->hasMany(Activity::class);
    }

    /**
     * Get the point ledger entries belonging to the user. The user's
     * balance is `SUM(amount)` over this relation.
     */
    public function pointTransactions(): HasMany
    {
        return $this->hasMany(PointTransaction::class);
    }

    /**
     * Get the daily gym check-ins belonging to the user (at most one per
     * calendar day).
     */
    public function checkIns(): HasMany
    {
        return $this->hasMany(CheckIn::class);
    }

    /**
     * Get the daily challenge claims belonging to the user (at most one per
     * day per challenge).
     */
    public function challengeClaims(): HasMany
    {
        return $this->hasMany(ChallengeClaim::class);
    }

    /**
     * Get the prize redemptions belonging to the user (at most one per
     * `reward_uid`, the client's local redemption id).
     */
    public function rewardClaims(): HasMany
    {
        return $this->hasMany(RewardClaim::class);
    }

    /**
     * Get the coach<->athlete relationships where this user is the coach
     * (the requesting party).
     */
    public function coachRelationshipsAsCoach(): HasMany
    {
        return $this->hasMany(CoachAthleteRelationship::class, 'coach_user_id');
    }

    /**
     * Get the coach<->athlete relationships where this user is the athlete
     * (the accepting/revoking party).
     */
    public function coachRelationshipsAsAthlete(): HasMany
    {
        return $this->hasMany(CoachAthleteRelationship::class, 'athlete_user_id');
    }

    /**
     * Get the duels this user started (challenger side).
     */
    public function duelsAsChallenger(): HasMany
    {
        return $this->hasMany(Duel::class, 'challenger_user_id');
    }

    /**
     * Get the duels this user was challenged to (opponent side).
     */
    public function duelsAsOpponent(): HasMany
    {
        return $this->hasMany(Duel::class, 'opponent_user_id');
    }

    /**
     * Get the feedback notes this user has written as a coach.
     */
    public function coachNotesWritten(): HasMany
    {
        return $this->hasMany(CoachNote::class, 'coach_user_id');
    }

    /**
     * Get the feedback notes this user has received as an athlete.
     */
    public function coachNotesReceived(): HasMany
    {
        return $this->hasMany(CoachNote::class, 'athlete_user_id');
    }

    /**
     * Whether the user has an active assignment in the given gym/branch
     * scope whose role rank is at least `$minRole`. Uses
     * `GymAssignment::ROLE_RANK`, so `gym_admin` satisfies a `staff`
     * requirement, etc. `coach` never participates in this comparison —
     * use `hasExactRoleInGym()` for it.
     */
    public function hasRoleInGym(int $gymId, ?int $branchId, string $minRole): bool
    {
        $minRank = GymAssignment::ROLE_RANK[$minRole] ?? null;

        if ($minRank === null) {
            return false;
        }

        return GymAssignment::activeFor($this, $gymId, $branchId)
            ->get()
            ->contains(fn (GymAssignment $assignment) => (GymAssignment::ROLE_RANK[$assignment->role] ?? 0) >= $minRank);
    }

    /**
     * Whether the user has an active assignment with exactly `$role` in the
     * given gym/branch scope. Roles outside the rank hierarchy (`coach`)
     * must be checked this way, never via `hasRoleInGym()`.
     */
    public function hasExactRoleInGym(int $gymId, ?int $branchId, string $role): bool
    {
        return GymAssignment::activeFor($this, $gymId, $branchId)
            ->where('role', $role)
            ->exists();
    }
}
