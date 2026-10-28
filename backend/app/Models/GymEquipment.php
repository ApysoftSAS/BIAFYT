<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One row of a gym's inventory: a link to a catalog `Equipment` item plus
 * whether it is currently available in that gym.
 */
class GymEquipment extends Model
{
    /**
     * @var string
     */
    protected $table = 'gym_equipment';

    /**
     * @var list<string>
     */
    protected $fillable = [
        'gym_id',
        'equipment_id',
        'available',
    ];

    /**
     * @var array<string, string>
     */
    protected $casts = [
        'available' => 'boolean',
    ];

    /**
     * @return BelongsTo<Gym, $this>
     */
    public function gym(): BelongsTo
    {
        return $this->belongsTo(Gym::class);
    }

    /**
     * @return BelongsTo<Equipment, $this>
     */
    public function equipment(): BelongsTo
    {
        return $this->belongsTo(Equipment::class);
    }
}
