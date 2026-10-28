<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Api\V1\EquipmentController as PublicEquipmentController;
use App\Http\Controllers\Controller;
use App\Models\Equipment;
use App\Models\GymEquipment;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

/**
 * The BIAFYT Admin side of the GLOBAL equipment catalog.
 *
 * Every action is gated by `User::is_platform_admin` (`assertPlatformAdmin`);
 * a non-admin gets a 404, so the surface is not discoverable. This is the
 * ONLY place the `equipment` table is written — a gym never touches it (a
 * gym only manages its own `gym_equipment` inventory and can request a new
 * catalog item via EquipmentRequest).
 *
 * `slug` is assigned once at creation (derived from the name) and never
 * changes: `exercises.machine_id` joins on it, and gym inventories +
 * routine validation rely on it being stable.
 */
class EquipmentController extends Controller
{
    /**
     * The full catalog (active and inactive), each annotated with how many
     * gyms have it in their inventory. `?active=1` / `?active=0` filters.
     */
    public function index(Request $request): JsonResponse
    {
        $this->assertPlatformAdmin($request);

        $validated = $request->validate([
            'active' => ['nullable', 'boolean'],
        ]);

        $counts = GymEquipment::query()
            ->selectRaw('equipment_id, COUNT(*) as gym_count')
            ->groupBy('equipment_id')
            ->pluck('gym_count', 'equipment_id');

        $query = Equipment::query()->orderBy('name');
        if (array_key_exists('active', $validated) && $validated['active'] !== null) {
            $query->where('is_active', (bool) $validated['active']);
        }

        $items = $query->get()
            ->map(fn (Equipment $item) => $this->mapEquipment($item, (int) ($counts[$item->id] ?? 0)))
            ->values();

        return response()->json(['equipment' => $items]);
    }

    public function show(Request $request, int $equipment): JsonResponse
    {
        $this->assertPlatformAdmin($request);

        $item = Equipment::findOrFail($equipment);
        $gymCount = GymEquipment::where('equipment_id', $item->id)->count();

        return response()->json(['equipment' => $this->mapEquipment($item, $gymCount)]);
    }

    /**
     * Create a catalog item. The `slug` is derived from the name and made
     * unique; the client never supplies it.
     */
    public function store(Request $request): JsonResponse
    {
        $this->assertPlatformAdmin($request);

        $validated = $this->validatePayload($request, creating: true);

        $item = Equipment::create([
            ...$validated,
            'slug' => $this->uniqueSlug($validated['name']),
            'is_active' => $validated['is_active'] ?? true,
        ]);

        return response()->json(['equipment' => $this->mapEquipment($item, 0)], 201);
    }

    /**
     * Edit a catalog item. `slug` is intentionally not editable.
     */
    public function update(Request $request, int $equipment): JsonResponse
    {
        $this->assertPlatformAdmin($request);

        $item = Equipment::findOrFail($equipment);
        $validated = $this->validatePayload($request, creating: false);

        $item->fill($validated)->save();
        $gymCount = GymEquipment::where('equipment_id', $item->id)->count();

        return response()->json(['equipment' => $this->mapEquipment($item->fresh(), $gymCount)]);
    }

    /**
     * @return array<string, mixed>
     */
    private function validatePayload(Request $request, bool $creating): array
    {
        return $request->validate([
            'name' => [$creating ? 'required' : 'sometimes', 'string', 'max:255'],
            'description' => ['sometimes', 'nullable', 'string', 'max:2000'],
            'brand' => ['sometimes', 'nullable', 'string', 'max:255'],
            'model' => ['sometimes', 'nullable', 'string', 'max:255'],
            'category' => ['sometimes', 'nullable', 'string', 'max:120'],
            'photo_urls' => ['sometimes', 'nullable', 'array', 'max:8'],
            'photo_urls.*' => ['string', 'url', 'max:2048'],
            'is_active' => ['sometimes', 'boolean'],
            // Educational catalog.
            'purpose' => ['sometimes', 'nullable', 'string', 'max:2000'],
            'primary_muscle' => ['sometimes', 'nullable', 'string', 'max:120'],
            'secondary_muscles' => ['sometimes', 'nullable', 'array', 'max:12'],
            'secondary_muscles.*' => ['string', 'max:120'],
            'movement' => ['sometimes', 'nullable', 'string', 'max:120'],
            'level' => ['sometimes', 'nullable', 'string', 'max:60'],
            'tips' => ['sometimes', 'nullable', 'array', 'max:12'],
            'tips.*' => ['string', 'max:500'],
            'mistakes' => ['sometimes', 'nullable', 'array', 'max:12'],
            'mistakes.*' => ['string', 'max:500'],
            'related' => ['sometimes', 'nullable', 'array', 'max:12'],
            'related.*' => ['string', 'max:200'],
            'art' => ['sometimes', 'nullable', 'string', 'max:120'],
        ]);
    }

    private function uniqueSlug(string $name): string
    {
        $base = Str::slug($name) ?: 'equipo';
        $slug = $base;
        $n = 2;
        while (Equipment::where('slug', $slug)->exists()) {
            $slug = "{$base}-{$n}";
            $n++;
        }

        return $slug;
    }

    private function assertPlatformAdmin(Request $request): void
    {
        abort_unless((bool) $request->user()->is_platform_admin, 404);
    }

    /**
     * @return array<string, mixed>
     */
    private function mapEquipment(Equipment $item, int $gymCount): array
    {
        return [
            ...PublicEquipmentController::mapItem($item),
            'is_active' => (bool) $item->is_active,
            'gym_count' => $gymCount,
            'created_at' => $item->created_at,
        ];
    }
}
