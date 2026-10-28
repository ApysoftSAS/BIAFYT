<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    use WithoutModelEvents;

    /**
     * Seed the application's database.
     */
    public function run(): void
    {
        // User::factory(10)->create();

        // F3 (production hardening): never create the throwaway test account in
        // production. `php artisan db:seed` (bare) must stay safe to run on the
        // production database — only `ExerciseSeeder` should have an effect
        // there. See docs/PRODUCTION_HARDENING_DISCOVERY.md §2.
        if (! app()->environment('production')) {
            User::factory()->create([
                'name' => 'Test User',
                'email' => 'test@example.com',
            ]);
        }

        $this->call(ExerciseSeeder::class);
        $this->call(EquipmentSeeder::class);
    }
}
