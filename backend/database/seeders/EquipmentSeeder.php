<?php

namespace Database\Seeders;

use App\Models\Equipment;
use Illuminate\Database\Seeder;

class EquipmentSeeder extends Seeder
{
    /**
     * Seed the global equipment catalog.
     *
     * Full 1:1 copy of `frontend-usuario/src/data/machines.js` — slug (the
     * frontend's `id`), name, and the educational fields (purpose, muscles,
     * movement, level, tips, mistakes, related, art). `machines.js` stays in
     * the frontend ONLY as the offline fallback; the DB is now the source of
     * truth. Do not add, remove, or reword entries here without updating that
     * source first (and vice versa).
     *
     * Idempotent (`updateOrCreate` by slug), safe on production
     * (`php artisan db:seed`), same as `ExerciseSeeder`.
     */
    public function run(): void
    {
        $equipment = [
            [
                'slug' => 'm-press-pecho',
                'name' => 'PRESS DE PECHO',
                'art' => 'chestPress',
                'purpose' => 'Empuje horizontal guiado. Permite trabajar el pecho con carga controlada y baja exigencia técnica.',
                'primary_muscle' => 'Pectoral mayor',
                'secondary_muscles' => ['Tríceps', 'Deltoides anterior'],
                'movement' => 'Empuje horizontal',
                'level' => 'Principiante',
                'tips' => [
                    'Ajusta el asiento para que los agarres queden a la altura del pecho.',
                    'Codos a unos 45°, no completamente abiertos.',
                    'Controla la vuelta: 2 segundos de bajada.',
                ],
                'mistakes' => ['Bloquear los codos con violencia al final', 'Despegar la espalda del respaldo', 'Recorrido demasiado corto'],
                'related' => ['Press banca', 'Fondos en paralelas', 'Aperturas en polea'],
            ],
            [
                'slug' => 'm-jalon',
                'name' => 'JALÓN AL PECHO',
                'art' => 'latPulldown',
                'purpose' => 'Tracción vertical. Base para construir espalda antes de dominar la dominada.',
                'primary_muscle' => 'Dorsal ancho',
                'secondary_muscles' => ['Bíceps', 'Trapecio medio', 'Romboides'],
                'movement' => 'Tracción vertical',
                'level' => 'Principiante',
                'tips' => ['Lleva la barra al pecho, no detrás de la nuca.', 'Inicia el movimiento bajando los hombros.', 'Pecho arriba durante todo el recorrido.'],
                'mistakes' => ['Balancear el torso para ayudarse', 'Agarre excesivamente ancho', 'Tirar solo con los brazos'],
                'related' => ['Dominadas asistidas', 'Remo sentado', 'Pullover en polea'],
            ],
            [
                'slug' => 'm-prensa',
                'name' => 'PRENSA DE PIERNAS',
                'art' => 'legPress',
                'purpose' => 'Empuje de tren inferior con espalda apoyada. Permite cargar piernas con menos exigencia lumbar.',
                'primary_muscle' => 'Cuádriceps',
                'secondary_muscles' => ['Glúteo mayor', 'Isquiotibiales', 'Aductores'],
                'movement' => 'Empuje de tren inferior',
                'level' => 'Principiante',
                'tips' => ['Pies a la anchura de los hombros en el centro de la plataforma.', 'Baja hasta 90° sin despegar la cadera.', 'No bloquees las rodillas arriba.'],
                'mistakes' => ['Levantar la cadera del asiento', 'Rodillas hacia dentro', 'Rango demasiado corto con mucho peso'],
                'related' => ['Sentadilla', 'Hack squat', 'Zancadas'],
            ],
            [
                'slug' => 'm-remo',
                'name' => 'REMO SENTADO',
                'art' => 'seatedRow',
                'purpose' => 'Tracción horizontal. Trabaja el grosor de la espalda y compensa el trabajo de empuje.',
                'primary_muscle' => 'Dorsal ancho',
                'secondary_muscles' => ['Romboides', 'Trapecio medio', 'Bíceps'],
                'movement' => 'Tracción horizontal',
                'level' => 'Principiante',
                'tips' => ['Espalda neutra, sin redondear.', 'Lleva los codos atrás pegados al cuerpo.', 'Aguanta medio segundo en la contracción.'],
                'mistakes' => ['Impulsar con el tronco hacia atrás', 'Encoger los hombros', 'Soltar el peso de golpe'],
                'related' => ['Remo con barra', 'Jalón al pecho', 'Face pull'],
            ],
            [
                'slug' => 'm-extension',
                'name' => 'EXTENSIÓN DE CUÁDRICEPS',
                'art' => 'legExtension',
                'purpose' => 'Aislamiento de cuádriceps. Útil para calentar la rodilla y añadir volumen al final de la sesión.',
                'primary_muscle' => 'Cuádriceps',
                'secondary_muscles' => ['Recto femoral'],
                'movement' => 'Aislamiento / extensión de rodilla',
                'level' => 'Principiante',
                'tips' => ['Alinea el eje de la máquina con la rodilla.', 'Sube controlado, sin patada.', 'Cargas moderadas y más repeticiones.'],
                'mistakes' => ['Impulso con la cadera', 'Bloqueo brusco arriba', 'Peso excesivo con rango parcial'],
                'related' => ['Sentadilla', 'Prensa', 'Zancadas'],
            ],
            [
                'slug' => 'm-femoral',
                'name' => 'CURL FEMORAL',
                'art' => 'legCurl',
                'purpose' => 'Aislamiento de isquiotibiales. Clave para equilibrar la rodilla frente al trabajo de cuádriceps.',
                'primary_muscle' => 'Isquiotibiales',
                'secondary_muscles' => ['Gemelos', 'Glúteo'],
                'movement' => 'Aislamiento / flexión de rodilla',
                'level' => 'Principiante',
                'tips' => ['Cadera pegada al banco.', 'Baja el peso en 3 segundos.', 'No arquees la zona lumbar.'],
                'mistakes' => ['Despegar la cadera', 'Rango incompleto', 'Rebotar el peso'],
                'related' => ['Peso muerto rumano', 'Hip thrust', 'Buenos días'],
            ],
            [
                'slug' => 'm-hombro',
                'name' => 'PRESS DE HOMBRO',
                'art' => 'shoulderPress',
                'purpose' => 'Empuje vertical guiado. Construye hombro con trayectoria estable.',
                'primary_muscle' => 'Deltoides anterior',
                'secondary_muscles' => ['Deltoides lateral', 'Tríceps', 'Trapecio'],
                'movement' => 'Empuje vertical',
                'level' => 'Intermedio',
                'tips' => ['Asiento de modo que los agarres queden a la altura de las orejas.', 'Costillas abajo, sin arquear.', 'Sube sin encoger los hombros.'],
                'mistakes' => ['Arquear la espalda para empujar', 'Recorrido demasiado corto', 'Bloqueo violento de codos'],
                'related' => ['Press militar', 'Elevaciones laterales', 'Face pull'],
            ],
            [
                'slug' => 'm-polea',
                'name' => 'POLEA DOBLE',
                'art' => 'cableStation',
                'purpose' => 'Estación versátil de tensión constante. Sirve para pecho, espalda, brazos y core.',
                'primary_muscle' => 'Variable según ejercicio',
                'secondary_muscles' => ['Core', 'Estabilizadores'],
                'movement' => 'Multiarticular / aislamiento',
                'level' => 'Intermedio',
                'tips' => ['Ajusta la altura de la polea al ángulo del ejercicio.', 'Mantén tensión también en la fase excéntrica.', 'Da un paso adelante para no perder recorrido.'],
                'mistakes' => ['Usar impulso del cuerpo', 'Altura de polea incorrecta', 'Soltar la tensión al final'],
                'related' => ['Aperturas en polea', 'Curl en polea', 'Extensión de tríceps'],
            ],
            [
                'slug' => 'm-cinta',
                'name' => 'CINTA DE CORRER',
                'art' => 'treadmill',
                'purpose' => 'Trabajo cardiovascular y calentamiento. Permite controlar ritmo e inclinación.',
                'primary_muscle' => 'Sistema cardiovascular',
                'secondary_muscles' => ['Cuádriceps', 'Gemelos', 'Glúteo'],
                'movement' => 'Cíclico / cardiovascular',
                'level' => 'Principiante',
                'tips' => ['5-8 minutos suaves antes de entrenar fuerza.', 'Usa inclinación en vez de subir mucho la velocidad.', 'No te agarres a las barras al caminar.'],
                'mistakes' => ['Zancada exagerada', 'Mirar hacia abajo', 'Bajarse en movimiento'],
                'related' => ['Elíptica', 'Bicicleta', 'Remo ergómetro'],
            ],
            [
                'slug' => 'm-hip-thrust',
                'name' => 'HIP THRUST',
                'art' => 'hipThrust',
                'purpose' => 'Extensión de cadera con máxima activación de glúteo. Referencia para fuerza y estética.',
                'primary_muscle' => 'Glúteo mayor',
                'secondary_muscles' => ['Isquiotibiales', 'Core'],
                'movement' => 'Extensión de cadera',
                'level' => 'Intermedio',
                'tips' => ['Apoya el borde inferior de la escápula en el banco.', 'Barbilla al pecho durante todo el recorrido.', 'Aprieta arriba un segundo.'],
                'mistakes' => ['Hiperextender la zona lumbar arriba', 'Pies demasiado cerca', 'Rango corto'],
                'related' => ['Puente de glúteo', 'Peso muerto rumano', 'Prensa'],
            ],
        ];

        foreach ($equipment as $item) {
            Equipment::updateOrCreate(['slug' => $item['slug']], $item);
        }
    }
}
