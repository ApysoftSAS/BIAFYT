<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A user's request to register a gym on the platform.
 *
 * Reviewed by a BIAFYT Admin (`User::is_platform_admin`). Approving it
 * creates, in one transaction: the Gym, its main Branch, and an active
 * `gym_admin` GymAssignment for the applicant. See
 * App\Http\Controllers\Api\V1\Admin\GymRegistrationRequestController.
 */
class GymRegistrationRequest extends Model
{
    public const STATUS_PENDING = 'pending';

    public const STATUS_APPROVED = 'approved';

    public const STATUS_REJECTED = 'rejected';

    /**
     * @var list<string>
     */
    protected $fillable = [
        'user_id',
        'status',
        'gym_name',
        'branch_name',
        'applicant_message',
        'review_note',
        'reviewed_by_user_id',
        'reviewed_at',
        'gym_id',
    ];

    /**
     * @var list<string>
     */
    protected $hidden = [
        'user_id',
        'reviewed_by_user_id',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'reviewed_at' => 'datetime',
        ];
    }

    /**
     * The user who submitted the request.
     */
    public function applicant(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    /**
     * The BIAFYT Admin who approved/rejected it, if any.
     */
    public function reviewer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'reviewed_by_user_id');
    }

    /**
     * The Gym created by approving this request, if any.
     */
    public function gym(): BelongsTo
    {
        return $this->belongsTo(Gym::class);
    }
}
