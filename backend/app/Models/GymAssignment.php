<?php

namespace App\Models;

use DomainException;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class GymAssignment extends Model
{
    public const STATUS_ACTIVE = 'active';

    public const STATUS_INACTIVE = 'inactive';

    public const ROLE_MEMBER = 'member';

    public const ROLE_COACH = 'coach';

    public const ROLE_STAFF = 'staff';

    public const ROLE_GYM_ADMIN = 'gym_admin';

    /**
     * Capability rank of each administrative role, from lowest to highest.
     * `gym_admin` implies `staff`, which implies `member`.
     *
     * `coach` is intentionally not part of this ranking: it is an
     * independent role that neither inherits from nor is implied by any
     * other role. It must always be checked explicitly by role name.
     *
     * @var array<string, int>
     */
    public const ROLE_RANK = [
        self::ROLE_MEMBER => 1,
        self::ROLE_STAFF => 2,
        self::ROLE_GYM_ADMIN => 3,
    ];

    /**
     * The attributes that are mass assignable.
     *
     * @var list<string>
     */
    protected $fillable = [
        'user_id',
        'gym_id',
        'branch_id',
        'role',
        'status',
    ];

    /**
     * The attributes that should be hidden for serialization.
     *
     * `branch_id_norm` is a purely technical column that backs the unique
     * constraint and must never be part of any API contract.
     *
     * @var list<string>
     */
    protected $hidden = [
        'branch_id_norm',
    ];

    /**
     * Domain rule: a `member` assignment can never have a global
     * (`branch_id = NULL`) scope. This cannot be enforced by the schema
     * alone (nothing stops `role` and `branch_id` from being independently
     * nullable/free-form at the column level), so it is enforced here on
     * every create/update regardless of the caller (tests, controllers,
     * tinker, ...).
     */
    protected static function booted(): void
    {
        static::saving(function (GymAssignment $assignment) {
            if ($assignment->role === self::ROLE_MEMBER && $assignment->branch_id === null) {
                throw new DomainException(
                    'A gym assignment with role "member" must have a branch_id; it cannot have gym-wide scope.'
                );
            }
        });
    }

    /**
     * Get the user this assignment belongs to.
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /**
     * Get the gym this assignment belongs to.
     */
    public function gym(): BelongsTo
    {
        return $this->belongsTo(Gym::class);
    }

    /**
     * Get the branch this assignment is scoped to, if any.
     */
    public function branch(): BelongsTo
    {
        return $this->belongsTo(Branch::class);
    }

    /**
     * Active assignments for the given user that are in scope for the given
     * gym/branch. An assignment with `branch_id = NULL` is in scope for any
     * branch of that gym (gym-wide scope); an assignment with a specific
     * `branch_id` is only in scope for that exact branch.
     *
     * @return Builder<GymAssignment>
     */
    public static function activeFor(User $user, int $gymId, ?int $branchId = null): Builder
    {
        return static::query()
            ->where('user_id', $user->id)
            ->where('gym_id', $gymId)
            ->where('status', self::STATUS_ACTIVE)
            ->where(function (Builder $query) use ($branchId) {
                $query->whereNull('branch_id');

                if ($branchId !== null) {
                    $query->orWhere('branch_id', $branchId);
                }
            });
    }
}
