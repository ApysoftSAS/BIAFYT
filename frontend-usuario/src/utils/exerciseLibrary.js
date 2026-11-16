/**
 * BIAFYT — BIBLIOTECA DE EJERCICIOS (consulta)
 * ---------------------------------------------------------------
 * 1.324 ejercicios del dataset hasaneyldrm/exercises-dataset (datos MIT;
 * imágenes/GIF © Gym visual, ver THIRD_PARTY_NOTICES.md), generados por
 * `scripts/build-exercise-library.mjs` en `data/exerciseLibrary.json`.
 *
 * Es contenido de REFERENCIA: independiente del catálogo de 22 ejercicios
 * (`data/exercises.js` / `exerciseCatalog.js`) que usan el generador de
 * rutinas y el backend. No define series, repeticiones ni cargas.
 */

export const ATTRIBUTION = "© Gym visual — https://gymvisual.com/";

export const CATEGORY_ES = {
  "upper arms": "Brazos",
  "lower arms": "Antebrazos",
  "upper legs": "Muslos",
  "lower legs": "Pantorrillas",
  back: "Espalda",
  chest: "Pecho",
  shoulders: "Hombros",
  waist: "Abdomen",
  neck: "Cuello",
  cardio: "Cardio",
};

export const EQUIPMENT_ES = {
  "body weight": "Peso corporal",
  dumbbell: "Mancuernas",
  cable: "Polea",
  barbell: "Barra",
  "olympic barbell": "Barra olímpica",
  "ez barbell": "Barra Z",
  "trap bar": "Barra hexagonal",
  "leverage machine": "Máquina",
  "smith machine": "Multipower",
  band: "Banda elástica",
  "resistance band": "Banda de resistencia",
  kettlebell: "Pesa rusa",
  weighted: "Con lastre",
  "stability ball": "Balón de estabilidad",
  "medicine ball": "Balón medicinal",
  "bosu ball": "Bosu",
  assisted: "Asistido",
  hammer: "Martillo",
  roller: "Rodillo",
  rope: "Cuerda",
  tire: "Neumático",
  "wheel roller": "Rueda abdominal",
  "elliptical machine": "Elíptica",
  "stationary bike": "Bicicleta estática",
  "stepmill machine": "Escaladora",
  "skierg machine": "SkiErg",
  "sled machine": "Trineo",
  "upper body ergometer": "Ergómetro de brazos",
};

export const MUSCLE_ES = {
  abductors: "Abductores",
  abs: "Abdominales",
  abdominals: "Abdominales",
  adductors: "Aductores",
  biceps: "Bíceps",
  brachialis: "Braquial",
  calves: "Gemelos",
  "cardiovascular system": "Sistema cardiovascular",
  delts: "Deltoides",
  deltoids: "Deltoides",
  "rear deltoids": "Deltoides posterior",
  forearms: "Antebrazos",
  glutes: "Glúteos",
  hamstrings: "Isquiotibiales",
  lats: "Dorsales",
  "latissimus dorsi": "Dorsal ancho",
  "levator scapulae": "Elevador de la escápula",
  pectorals: "Pectorales",
  quads: "Cuádriceps",
  quadriceps: "Cuádriceps",
  "serratus anterior": "Serrato anterior",
  spine: "Columna",
  traps: "Trapecio",
  trapezius: "Trapecio",
  triceps: "Tríceps",
  "upper back": "Espalda alta",
  "lower back": "Zona lumbar",
  back: "Espalda",
  chest: "Pecho",
  "upper chest": "Pecho superior",
  core: "Core",
  "lower abs": "Abdomen inferior",
  obliques: "Oblicuos",
  shoulders: "Hombros",
  "hip flexors": "Flexores de cadera",
  "inner thighs": "Muslo interno",
  groin: "Ingle",
  rhomboids: "Romboides",
  "rotator cuff": "Manguito rotador",
  soleus: "Sóleo",
  shins: "Tibiales",
  "ankle stabilizers": "Estabilizadores de tobillo",
  ankles: "Tobillos",
  feet: "Pies",
  hands: "Manos",
  wrists: "Muñecas",
  "wrist extensors": "Extensores de muñeca",
  "wrist flexors": "Flexores de muñeca",
  "grip muscles": "Músculos de agarre",
  sternocleidomastoid: "Esternocleidomastoideo",
};

const label = (map, key) => map[key] ?? key;
export const categoryLabel = (k) => label(CATEGORY_ES, k);
export const equipmentLabel = (k) => label(EQUIPMENT_ES, k);
export const muscleLabel = (k) => label(MUSCLE_ES, k);

/** Minúsculas y sin tildes, para buscar "triceps" y encontrar "Tríceps". */
export const normalize = (s) =>
  String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

/** Añade el texto de búsqueda (nombre + etiquetas en español). */
export const withSearchText = (e) => ({
  ...e,
  search: normalize(
    [e.n, categoryLabel(e.c), equipmentLabel(e.q), muscleLabel(e.t), muscleLabel(e.m), ...e.s.map(muscleLabel)].join(" ")
  ),
});

/** Todas las palabras de la búsqueda deben aparecer; categoría y equipo son filtros exactos. */
export function filterLibrary(list, { query = "", category = "all", equipment = "all" } = {}) {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  return list.filter(
    (e) =>
      (category === "all" || e.c === category) &&
      (equipment === "all" || e.q === equipment) &&
      words.every((w) => e.search.includes(w))
  );
}

/** Miniatura siempre local; el GIF solo si hay base configurada (127 MB: no va dentro de la app). */
export function mediaUrls(entry, gifBase = import.meta.env?.VITE_EXERCISE_GIF_BASE_URL) {
  const base = (import.meta.env?.BASE_URL ?? "/").replace(/\/?$/, "/");
  return {
    image: `${base}exercise-media/img/${entry.f}.jpg`,
    gif: gifBase ? `${String(gifBase).replace(/\/$/, "")}/${entry.f}.gif` : null,
  };
}

/** "deep push up" → "Deep push up" (el dataset viene en minúsculas). */
export const displayName = (n) => (n ? n.charAt(0).toUpperCase() + n.slice(1) : n);

/** Tipo de prescripción (mismo vocabulario que data/exercises.js). Viene curado desde el script de generación. */
export const TYPE_BY_KIND = { cardio: "cardio", iso: "isométrico", fuerza: "fuerza" };
export const libraryType = (entry) => TYPE_BY_KIND[entry.k] ?? "fuerza";

/**
 * Fila de rutina propia (customRoutine.exercises[]) a partir de un ejercicio de la
 * biblioteca. Mismo contrato por `type` que MyRoutines#exerciseFromCatalog y
 * training.js#buildRoutine: fuerza→sets/reps/rest; isométrico→sets/seconds/rest;
 * cardio→duration/rest. 4×12, 4×20 s y 60 s son valores iniciales EDITABLES de UI,
 * no una prescripción. `exerciseId` lleva prefijo `lib-` (no choca con los `ex-*`
 * del catálogo básico) y `muscle` alimenta la analítica muscular.
 */
export function routineRowFromLibrary(entry, uid = Math.random().toString(36).slice(2, 9)) {
  const type = libraryType(entry);
  const base = {
    id: `ex-${uid}`,
    exerciseId: `lib-${entry.id}`,
    libraryId: entry.id,
    name: displayName(entry.n),
    type,
    rest: 60,
    muscle: entry.t,
  };
  if (type === "cardio") return { ...base, duration: null };
  if (type === "isométrico") return { ...base, sets: 4, seconds: 20 };
  return { ...base, sets: 4, reps: 12 };
}

let cache = null;
/** Carga diferida (chunk aparte de ~0,9 MB): no pesa en el arranque de la app. */
export function loadExerciseLibrary() {
  cache ??= import("../data/exerciseLibrary.json")
    .then((m) => m.default.map(withSearchText))
    .catch((err) => {
      cache = null; // permitir reintento
      throw err;
    });
  return cache;
}
