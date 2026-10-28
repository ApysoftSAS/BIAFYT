<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Program extends Model
{
    /**
     * The attributes that are mass assignable.
     *
     * @var list<string>
     */
    protected $fillable = [
        'user_id',
        'name',
        'reference_gym_id',
        'created_by_user_id',
        'imported_at',
    ];

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'imported_at' => 'datetime',
        ];
    }

    /**
     * The attributes that should be hidden for serialization.
     *
     * @var list<string>
     */
    protected $hidden = [
        'user_id',
    ];

    /**
     * Get the user this program belongs to.
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /**
     * Get the days that make up this program, ordered by position.
     */
    public function days(): HasMany
    {
        return $this->hasMany(ProgramDay::class)->orderBy('position');
    }

    /**
     * Optional "train at this gym" context. The owner does not need a
     * GymAssignment there.
     */
    public function referenceGym(): BelongsTo
    {
        return $this->belongsTo(Gym::class, 'reference_gym_id');
    }

    /**
     * Who authored the program. NULL / equal to `user_id` means the owner;
     * a different user is the coach who created it for the athlete.
     */
    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by_user_id');
    }
}
