<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One append-only audit entry for an EquipmentRequest: who did what, when.
 */
class EquipmentRequestEvent extends Model
{
    /**
     * @var list<string>
     */
    protected $fillable = [
        'equipment_request_id',
        'actor_user_id',
        'action',
        'note',
    ];

    /**
     * @var list<string>
     */
    protected $hidden = [
        'actor_user_id',
    ];

    public function request(): BelongsTo
    {
        return $this->belongsTo(EquipmentRequest::class, 'equipment_request_id');
    }

    public function actor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'actor_user_id');
    }
}
