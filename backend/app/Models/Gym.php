<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Gym extends Model
{
    /**
     * The attributes that are mass assignable.
     *
     * @var list<string>
     */
    protected $fillable = [
        'name',
    ];

    /**
     * Get the branches that belong to this gym.
     */
    public function branches(): HasMany
    {
        return $this->hasMany(Branch::class);
    }

    /**
     * Get the gym assignments for this gym.
     */
    public function gymAssignments(): HasMany
    {
        return $this->hasMany(GymAssignment::class);
    }

    /**
     * The raw inventory rows for this gym (catalog link + `available` flag).
     */
    public function equipmentInventory(): HasMany
    {
        return $this->hasMany(GymEquipment::class);
    }

    /**
     * The catalog equipment items in this gym's inventory, with the
     * `available` flag exposed on the pivot.
     *
     * @return BelongsToMany<Equipment, $this>
     */
    public function equipment(): BelongsToMany
    {
        return $this->belongsToMany(Equipment::class, 'gym_equipment')
            ->withPivot('available')
            ->withTimestamps();
    }
}
