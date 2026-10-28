/**
 * BIAFYT — BIBLIOTECA DE MÁQUINAS
 *
 * ⚠️ FALLBACK OFFLINE ÚNICAMENTE. La fuente de verdad del catálogo de
 * máquinas es el backend: la tabla `equipment` (`GET /api/v1/equipment`).
 * `data/equipmentCatalog.js#loadEquipmentCatalog()` hidrata desde ahí y
 * solo cae a este archivo si la API no responde o devuelve un shape
 * inválido. NO se mezclan datos: o todo remoto o todo local.
 *
 * Este archivo debe mantenerse 1:1 con `backend/database/seeders/
 * EquipmentSeeder.php` (mismos slugs, nombres y contenido). La
 * ilustración se resuelve por `art` en `components/MachineArt.jsx`
 * (presentación — los SVG siempre son del frontend).
 */

export const machines = [
  {
    id: "m-press-pecho",
    name: "PRESS DE PECHO",
    art: "chestPress",
    exerciseId: "ex-press-pecho",
    purpose: "Empuje horizontal guiado. Permite trabajar el pecho con carga controlada y baja exigencia técnica.",
    primary: "Pectoral mayor",
    secondary: ["Tríceps", "Deltoides anterior"],
    movement: "Empuje horizontal",
    level: "Principiante",
    tips: [
      "Ajusta el asiento para que los agarres queden a la altura del pecho.",
      "Codos a unos 45°, no completamente abiertos.",
      "Controla la vuelta: 2 segundos de bajada.",
    ],
    mistakes: ["Bloquear los codos con violencia al final", "Despegar la espalda del respaldo", "Recorrido demasiado corto"],
    related: ["Press banca", "Fondos en paralelas", "Aperturas en polea"],
  },
  {
    id: "m-jalon",
    name: "JALÓN AL PECHO",
    art: "latPulldown",
    exerciseId: "ex-jalon-pecho",
    purpose: "Tracción vertical. Base para construir espalda antes de dominar la dominada.",
    primary: "Dorsal ancho",
    secondary: ["Bíceps", "Trapecio medio", "Romboides"],
    movement: "Tracción vertical",
    level: "Principiante",
    tips: ["Lleva la barra al pecho, no detrás de la nuca.", "Inicia el movimiento bajando los hombros.", "Pecho arriba durante todo el recorrido."],
    mistakes: ["Balancear el torso para ayudarse", "Agarre excesivamente ancho", "Tirar solo con los brazos"],
    related: ["Dominadas asistidas", "Remo sentado", "Pullover en polea"],
  },
  {
    id: "m-prensa",
    name: "PRENSA DE PIERNAS",
    art: "legPress",
    exerciseId: "ex-prensa-piernas",
    purpose: "Empuje de tren inferior con espalda apoyada. Permite cargar piernas con menos exigencia lumbar.",
    primary: "Cuádriceps",
    secondary: ["Glúteo mayor", "Isquiotibiales", "Aductores"],
    movement: "Empuje de tren inferior",
    level: "Principiante",
    tips: ["Pies a la anchura de los hombros en el centro de la plataforma.", "Baja hasta 90° sin despegar la cadera.", "No bloquees las rodillas arriba."],
    mistakes: ["Levantar la cadera del asiento", "Rodillas hacia dentro", "Rango demasiado corto con mucho peso"],
    related: ["Sentadilla", "Hack squat", "Zancadas"],
  },
  {
    id: "m-remo",
    name: "REMO SENTADO",
    art: "seatedRow",
    exerciseId: "ex-remo-sentado",
    purpose: "Tracción horizontal. Trabaja el grosor de la espalda y compensa el trabajo de empuje.",
    primary: "Dorsal ancho",
    secondary: ["Romboides", "Trapecio medio", "Bíceps"],
    movement: "Tracción horizontal",
    level: "Principiante",
    tips: ["Espalda neutra, sin redondear.", "Lleva los codos atrás pegados al cuerpo.", "Aguanta medio segundo en la contracción."],
    mistakes: ["Impulsar con el tronco hacia atrás", "Encoger los hombros", "Soltar el peso de golpe"],
    related: ["Remo con barra", "Jalón al pecho", "Face pull"],
  },
  {
    id: "m-extension",
    name: "EXTENSIÓN DE CUÁDRICEPS",
    art: "legExtension",
    purpose: "Aislamiento de cuádriceps. Útil para calentar la rodilla y añadir volumen al final de la sesión.",
    primary: "Cuádriceps",
    secondary: ["Recto femoral"],
    movement: "Aislamiento / extensión de rodilla",
    level: "Principiante",
    tips: ["Alinea el eje de la máquina con la rodilla.", "Sube controlado, sin patada.", "Cargas moderadas y más repeticiones."],
    mistakes: ["Impulso con la cadera", "Bloqueo brusco arriba", "Peso excesivo con rango parcial"],
    related: ["Sentadilla", "Prensa", "Zancadas"],
  },
  {
    id: "m-femoral",
    name: "CURL FEMORAL",
    art: "legCurl",
    exerciseId: "ex-curl-femoral",
    purpose: "Aislamiento de isquiotibiales. Clave para equilibrar la rodilla frente al trabajo de cuádriceps.",
    primary: "Isquiotibiales",
    secondary: ["Gemelos", "Glúteo"],
    movement: "Aislamiento / flexión de rodilla",
    level: "Principiante",
    tips: ["Cadera pegada al banco.", "Baja el peso en 3 segundos.", "No arquees la zona lumbar."],
    mistakes: ["Despegar la cadera", "Rango incompleto", "Rebotar el peso"],
    related: ["Peso muerto rumano", "Hip thrust", "Buenos días"],
  },
  {
    id: "m-hombro",
    name: "PRESS DE HOMBRO",
    art: "shoulderPress",
    exerciseId: "ex-press-hombro",
    purpose: "Empuje vertical guiado. Construye hombro con trayectoria estable.",
    primary: "Deltoides anterior",
    secondary: ["Deltoides lateral", "Tríceps", "Trapecio"],
    movement: "Empuje vertical",
    level: "Intermedio",
    tips: ["Asiento de modo que los agarres queden a la altura de las orejas.", "Costillas abajo, sin arquear.", "Sube sin encoger los hombros."],
    mistakes: ["Arquear la espalda para empujar", "Recorrido demasiado corto", "Bloqueo violento de codos"],
    related: ["Press militar", "Elevaciones laterales", "Face pull"],
  },
  {
    id: "m-polea",
    name: "POLEA DOBLE",
    art: "cableStation",
    purpose: "Estación versátil de tensión constante. Sirve para pecho, espalda, brazos y core.",
    primary: "Variable según ejercicio",
    secondary: ["Core", "Estabilizadores"],
    movement: "Multiarticular / aislamiento",
    level: "Intermedio",
    tips: ["Ajusta la altura de la polea al ángulo del ejercicio.", "Mantén tensión también en la fase excéntrica.", "Da un paso adelante para no perder recorrido."],
    mistakes: ["Usar impulso del cuerpo", "Altura de polea incorrecta", "Soltar la tensión al final"],
    related: ["Aperturas en polea", "Curl en polea", "Extensión de tríceps"],
  },
  {
    id: "m-cinta",
    name: "CINTA DE CORRER",
    art: "treadmill",
    exerciseId: "ex-cinta-correr",
    purpose: "Trabajo cardiovascular y calentamiento. Permite controlar ritmo e inclinación.",
    primary: "Sistema cardiovascular",
    secondary: ["Cuádriceps", "Gemelos", "Glúteo"],
    movement: "Cíclico / cardiovascular",
    level: "Principiante",
    tips: ["5-8 minutos suaves antes de entrenar fuerza.", "Usa inclinación en vez de subir mucho la velocidad.", "No te agarres a las barras al caminar."],
    mistakes: ["Zancada exagerada", "Mirar hacia abajo", "Bajarse en movimiento"],
    related: ["Elíptica", "Bicicleta", "Remo ergómetro"],
  },
  {
    id: "m-hip-thrust",
    name: "HIP THRUST",
    art: "hipThrust",
    exerciseId: "ex-hip-thrust",
    purpose: "Extensión de cadera con máxima activación de glúteo. Referencia para fuerza y estética.",
    primary: "Glúteo mayor",
    secondary: ["Isquiotibiales", "Core"],
    movement: "Extensión de cadera",
    level: "Intermedio",
    tips: ["Apoya el borde inferior de la escápula en el banco.", "Barbilla al pecho durante todo el recorrido.", "Aprieta arriba un segundo."],
    mistakes: ["Hiperextender la zona lumbar arriba", "Pies demasiado cerca", "Rango corto"],
    related: ["Puente de glúteo", "Peso muerto rumano", "Prensa"],
  },
];

export function findMachine(id) {
  return machines.find((m) => m.id === id) || null;
}
