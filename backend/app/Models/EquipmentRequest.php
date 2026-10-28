<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * A gym_admin's request for BIAFYT to add a machine to the global
 * equipment catalog. Reviewed by a BIAFYT Admin — see
 * App\Http\Controllers\Api\V1\Admin\EquipmentRequestController.
 *
 * The gym can never approve/reject its own request, and can never write to
 * the `equipment` catalog directly.
 */
class EquipmentRequest extends Model
{
    public const STATUS_PENDING = 'pending';

    public const STATUS_IN_REVIEW = 'in_review';

    public const STATUS_CHANGES_REQUESTED = 'changes_requested';

    public const STATUS_APPROVED = 'approved';

    public const STATUS_REJECTED = 'rejected';

    /** Statuses the requesting gym may still edit the proposal in. */
    public const GYM_EDITABLE = [self::STATUS_PENDING, self::STATUS_CHANGES_REQUESTED];

    /** Terminal statuses. */
    public const TERMINAL = [self::STATUS_APPROVED, self::STATUS_REJECTED];

    /**
     * @var list<string>
     */
    protected $fillable = [
        'gym_id',
        'requested_by_user_id',
        'status',
        'name',
        'brand',
        'model',
        'description',
        'category',
        'photo_urls',
        'review_note',
        'reviewed_by_user_id',
        'reviewed_at',
        'resulting_equipment_id',
    ];

    /**
     * @var list<string>
     */
    protected $hidden = [
        'requested_by_user_id',
        'reviewed_by_user_id',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'photo_urls' => 'array',
            'reviewed_at' => 'datetime',
        ];
    }

    public function gym(): BelongsTo
    {
        return $this->belongsTo(Gym::class);
    }

    public function requester(): BelongsTo
    {
        return $this->belongsTo(User::class, 'requested_by_user_id');
    }

    public function reviewer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'reviewed_by_user_id');
    }

    public function resultingEquipment(): BelongsTo
    {
        return $this->belongsTo(Equipment::class, 'resulting_equipment_id');
    }

    /**
     * @return HasMany<EquipmentRequestEvent, $this>
     */
    public function events(): HasMany
    {
        return $this->hasMany(EquipmentRequestEvent::class)->orderBy('id');
    }

    /**
     * Append one audit event.
     */
    public function recordEvent(string $action, ?int $actorUserId, ?string $note = null): EquipmentRequestEvent
    {
        return $this->events()->create([
            'actor_user_id' => $actorUserId,
            'action' => $action,
            'note' => $note,
        ]);
    }
}
