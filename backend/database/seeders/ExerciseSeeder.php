<?php

namespace Database\Seeders;

use App\Models\Exercise;
use Illuminate\Database\Seeder;

class ExerciseSeeder extends Seeder
{
    /**
     * Seed the exercise catalog.
     *
     * This is a 1:1 copy of frontend-usuario/src/data/exercises.js — same
     * slugs (the frontend's `id`), same names, same types, same machine_id
     * (the frontend's `machineId`, or null when absent). Do not add, remove,
     * or reclassify entries here without updating that source first.
     */
    public function run(): void
    {
        $exercises = [
            ['slug' => 'ex-press-pecho', 'name' => 'Press de pecho', 'type' => 'fuerza', 'machine_id' => 'm-press-pecho'],
            ['slug' => 'ex-jalon-pecho', 'name' => 'Jalón al pecho', 'type' => 'fuerza', 'machine_id' => 'm-jalon'],
            ['slug' => 'ex-press-hombro', 'name' => 'Press de hombro', 'type' => 'fuerza', 'machine_id' => 'm-hombro'],
            ['slug' => 'ex-prensa-piernas', 'name' => 'Prensa de piernas', 'type' => 'fuerza', 'machine_id' => 'm-prensa'],
            ['slug' => 'ex-curl-femoral', 'name' => 'Curl femoral', 'type' => 'fuerza', 'machine_id' => 'm-femoral'],
            ['slug' => 'ex-extension-triceps', 'name' => 'Extensión de tríceps', 'type' => 'fuerza', 'machine_id' => null],
            ['slug' => 'ex-sentadilla', 'name' => 'Sentadilla', 'type' => 'fuerza', 'machine_id' => null],
            ['slug' => 'ex-press-banca', 'name' => 'Press banca', 'type' => 'fuerza', 'machine_id' => null],
            ['slug' => 'ex-peso-muerto', 'name' => 'Peso muerto', 'type' => 'fuerza', 'machine_id' => null],
            ['slug' => 'ex-remo-barra', 'name' => 'Remo con barra', 'type' => 'fuerza', 'machine_id' => null],
            ['slug' => 'ex-press-militar', 'name' => 'Press militar', 'type' => 'fuerza', 'machine_id' => null],
            ['slug' => 'ex-cinta-correr', 'name' => 'Cinta de correr', 'type' => 'cardio', 'machine_id' => 'm-cinta'],
            ['slug' => 'ex-remo-sentado', 'name' => 'Remo sentado', 'type' => 'fuerza', 'machine_id' => 'm-remo'],
            ['slug' => 'ex-plancha', 'name' => 'Plancha', 'type' => 'isométrico', 'machine_id' => null],
            ['slug' => 'ex-sentadilla-goblet', 'name' => 'Sentadilla goblet', 'type' => 'fuerza', 'machine_id' => null],
            ['slug' => 'ex-zancadas', 'name' => 'Zancadas', 'type' => 'fuerza', 'machine_id' => null],
            // DEUDA DE CLASIFICACIÓN (aprobada, sin resolver, ver exercises.js):
            // son drills de movilidad, no ejercicios de fuerza, pero se
            // mantienen como "fuerza" a falta de una categoría propia.
            ['slug' => 'ex-movilidad-cadera', 'name' => 'Movilidad de cadera', 'type' => 'fuerza', 'machine_id' => null],
            ['slug' => 'ex-movilidad-toracica', 'name' => 'Movilidad torácica', 'type' => 'fuerza', 'machine_id' => null],
            ['slug' => 'ex-sentadilla-profunda-asistida', 'name' => 'Sentadilla profunda asistida', 'type' => 'fuerza', 'machine_id' => null],
            ['slug' => 'ex-plancha-lateral', 'name' => 'Plancha lateral', 'type' => 'isométrico', 'machine_id' => null],
            ['slug' => 'ex-hip-thrust', 'name' => 'Hip thrust', 'type' => 'fuerza', 'machine_id' => 'm-hip-thrust'],
            // DEUDA DE CLASIFICACIÓN (aprobada, sin resolver, ver exercises.js):
            // gesto de potencia/pliometría, no de fuerza cargada tradicional.
            ['slug' => 'ex-salto-cajon', 'name' => 'Salto al cajón', 'type' => 'fuerza', 'machine_id' => null],
        ];

        foreach ($exercises as $exercise) {
            Exercise::updateOrCreate(['slug' => $exercise['slug']], $exercise);
        }
    }
}
