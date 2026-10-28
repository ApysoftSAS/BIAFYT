<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

/**
 * A global BIAFYT equipment catalog item (e.g. "Prensa de piernas").
 *
 * 1:1 mirror of `frontend-usuario/src/data/machines.js` — see
 * `EquipmentSeeder`. The `slug` matches `exercises.machine_id`, which is how
 * an exercise resolves to the equipment it needs.
 */
class Equipment extends Model
{
    /**
     * "equipment" is uncountable, so pin the table name rather than rely on
     * pluralization.
     *
     * @var string
     */
    protected $table = 'equipment';

    /**
     * @var list<string>
     */
    protected $fillable = [
        'slug',
        'name',
        'description',
        'brand',
        'model',
        'category',
        'photo_urls',
        'is_active',
        // Educational catalog (ported from machines.js).
        'purpose',
        'primary_muscle',
        'secondary_muscles',
        'movement',
        'level',
        'tips',
        'mistakes',
        'related',
        'art',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'photo_urls' => 'array',
            'is_active' => 'boolean',
            'secondary_muscles' => 'array',
            'tips' => 'array',
            'mistakes' => 'array',
            'related' => 'array',
        ];
    }

    /**
     * The gyms whose inventory includes this item, with the `available` flag
     * from the pivot.
     *
     * @return BelongsToMany<Gym, $this>
     */
    public function gyms(): BelongsToMany
    {
        return $this->belongsToMany(Gym::class, 'gym_equipment')
            ->withPivot('available')
            ->withTimestamps();
    }
}
