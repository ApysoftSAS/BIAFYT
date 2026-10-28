<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Equipment;
use App\Models\Gym;
use Illuminate\Http\JsonResponse;

/**
 * Read access to the global equipment catalog and to a single gym's
 * inventory (which catalog items that gym has, and whether each is
 * available).
 *
 * Both endpoints are public — not user data, same precedent as
 * `GET /exercises` and `GET /gyms`. Nothing here is gated by GymAssignment
 * or a coach relationship: the catalog is global and a gym's inventory is
 * not sensitive.
 */
class EquipmentController extends Controller
{
    /**
     * The global equipment catalog. Only ACTIVE items — a retired item
     * (`is_active = false`) stays in the DB for history / existing
     * inventories but is not offered here.
     *
     * This is the single source of truth for the machine library: it
     * carries the full educational shape (purpose, muscles, movement, level,
     * tips, mistakes, related, art). `frontend-usuario` consumes it in
     * `Machines.jsx` + `analytics.js` (`data/machines.js` is only the
     * offline fallback).
     */
    public function index(): JsonResponse
    {
        $equipment = Equipment::where('is_active', true)->orderBy('name')->get()
            ->map(fn (Equipment $item) => self::mapItem($item))
            ->values();

        return response()->json([
            'equipment' => $equipment,
        ]);
    }

    /**
     * One gym's inventory: the catalog items it holds, each with its
     * `available` flag. Items not in the gym's inventory are simply absent.
     * Only globally-active items appear. A gym that does not exist is a 404.
     */
    public function gymIndex(int $gym): JsonResponse
    {
        $gymModel = Gym::findOrFail($gym);

        $equipment = $gymModel->equipment()
            ->where('equipment.is_active', true)
            ->orderBy('name')
            ->get()
            ->map(fn (Equipment $item) => [
                ...self::mapItem($item),
                'available' => (bool) $item->pivot->available,
            ])
            ->values();

        return response()->json([
            'equipment' => $equipment,
        ]);
    }

    /**
     * The public catalog shape. `id` is the numeric DB id; `slug` is the
     * stable string id the rest of the platform keys on
     * (`exercises.machine_id`, gym inventories, `MachineArt` via `art`).
     *
     * @return array<string, mixed>
     */
    public static function mapItem(Equipment $item): array
    {
        return [
            'id' => $item->id,
            'slug' => $item->slug,
            'name' => $item->name,
            'description' => $item->description,
            'brand' => $item->brand,
            'model' => $item->model,
            'category' => $item->category,
            'photo_urls' => $item->photo_urls ?? [],
            'purpose' => $item->purpose,
            'primary_muscle' => $item->primary_muscle,
            'secondary_muscles' => $item->secondary_muscles ?? [],
            'movement' => $item->movement,
            'level' => $item->level,
            'tips' => $item->tips ?? [],
            'mistakes' => $item->mistakes ?? [],
            'related' => $item->related ?? [],
            'art' => $item->art,
        ];
    }
}
