/**
 * BIAFYT — ANALYTICS (capa de lectura)
 * ---------------------------------------------------------------
 * Funciones puras que derivan métricas reales a partir de datos que la
 * app ya genera: state.identity.activities (historial de entrenamientos),
 * data/training.js (enfoques y su rutina determinística) y
 * data/machines.js (primary/secondary muscle de cada máquina).
 *
 * No hay aquí ningún dato inventado ni un segundo almacén de estadísticas:
 * todo se recalcula en cada llamada a partir del estado existente.
 *
 * LIMITACIÓN DE ORIGEN (ver CLAUDE.md/informe final):
 * state.identity.activities NO guarda peso, reps reales ni el detalle de qué
 * ejercicios se hicieron — solo agregados por sesión (sets/exercises
 * completados, duración, validación). Por eso métricas como "peso
 * levantado", "PRs de carga" o "volumen en kg" no pueden calcularse hoy:
 * no se inventan aquí.
 */
import { focuses, buildRoutine } from "../data/training.js";
import { machines as localMachines } from "../data/machines.js";

export const MUSCLE_GROUPS = ["Pecho", "Espalda", "Piernas", "Hombros", "Brazos", "Core"];

// Traduce los nombres específicos de músculo que YA existen en
// data/machines.js (primary/secondary) a los 6 grupos visuales de arriba.
// No es una taxonomía nueva de ejercicios: solo agrupa las mismas cadenas
// de texto que machines.js ya define.
const GROUP_BY_MUSCLE = {
  "Pectoral mayor": "Pecho",
  "Dorsal ancho": "Espalda",
  "Trapecio medio": "Espalda",
  "Trapecio": "Espalda",
  "Romboides": "Espalda",
  "Cuádriceps": "Piernas",
  "Isquiotibiales": "Piernas",
  "Glúteo mayor": "Piernas",
  "Glúteo": "Piernas",
  "Aductores": "Piernas",
  "Recto femoral": "Piernas",
  "Gemelos": "Piernas",
  "Deltoides anterior": "Hombros",
  "Deltoides lateral": "Hombros",
  "Tríceps": "Brazos",
  "Bíceps": "Brazos",
  "Core": "Core",
  "Estabilizadores": "Core",
};

function findMachineByExerciseName(name, catalog) {
  const normalized = name.trim().toLowerCase();
  return catalog.find((m) => m.name.trim().toLowerCase() === normalized) || null;
}

/**
 * Grupos musculares que trabaja una lista de ejercicios (p.ej. la rutina
 * activa), a partir del `primary` de cada máquina que coincide por
 * nombre. Ejercicios sin máquina equivalente (levantamientos libres como
 * sentadilla, peso muerto, press banca) no tienen taxonomía muscular en
 * el proyecto hoy, así que quedan en `unmatched` en vez de adivinarse.
 *
 * `machineCatalog` es el catálogo de máquinas ya hidratado del backend
 * (`state.machineCatalog`); por defecto usa el local (`data/machines.js`)
 * para las llamadas sin contexto (p.ej. tests o utilidades internas).
 */
export function routineMuscleGroups(exercises, machineCatalog = localMachines) {
  const catalog = Array.isArray(machineCatalog) && machineCatalog.length ? machineCatalog : localMachines;
  const counts = Object.fromEntries(MUSCLE_GROUPS.map((g) => [g, 0]));
  const unmatched = [];
  for (const ex of exercises) {
    const machine = findMachineByExerciseName(ex.name, catalog);
    const group = machine ? GROUP_BY_MUSCLE[machine.primary] : undefined;
    if (group) counts[group] += 1;
    else unmatched.push(ex.name);
  }
  const groups = MUSCLE_GROUPS.map((group) => ({ group, count: counts[group] }));
  const maxCount = Math.max(1, ...groups.map((g) => g.count));
  return { groups, maxCount, unmatched };
}

/** Métricas agregadas reales de un conjunto de entrenamientos. */
export function summaryMetrics(activities) {
  const count = activities.length;
  const totalSets = activities.reduce((t, a) => t + a.sets, 0);
  const totalDurationSeconds = activities.reduce((t, a) => t + a.durationSeconds, 0);
  const totalActivityPoints = activities.reduce((t, a) => t + a.activityPoints, 0);
  const totalCompetitivePoints = activities.reduce((t, a) => t + a.competitivePoints, 0);
  const validCount = activities.filter((a) => a.validation === "VALID").length;
  const suspiciousCount = activities.filter((a) => a.validation === "SUSPICIOUS").length;
  const invalidCount = activities.filter((a) => a.validation === "INVALID").length;
  return {
    count,
    totalSets,
    totalDurationSeconds,
    avgDurationSeconds: count > 0 ? totalDurationSeconds / count : 0,
    totalActivityPoints,
    totalCompetitivePoints,
    validCount,
    suspiciousCount,
    invalidCount,
  };
}

function withinLastDays(activity, days, now) {
  const ageMs = now - new Date(activity.date).getTime();
  return ageMs >= 0 && ageMs < days * 24 * 60 * 60 * 1000;
}

/**
 * Compara el período reciente (últimos `days`) contra el período previo
 * inmediatamente anterior, ambos con datos reales. Si no hay actividad
 * suficiente en el período previo, `hasBaseline` es false y no se
 * calculan porcentajes (no se inventa una base de comparación).
 */
export function comparePeriods(activities, days = 14, now = Date.now()) {
  const current = activities.filter((a) => withinLastDays(a, days, now));
  const previous = activities.filter((a) => {
    const ageMs = now - new Date(a.date).getTime();
    return ageMs >= days * 24 * 60 * 60 * 1000 && ageMs < days * 2 * 24 * 60 * 60 * 1000;
  });

  const cur = summaryMetrics(current);
  const prev = summaryMetrics(previous);
  const hasBaseline = prev.count > 0;

  const delta = (curVal, prevVal) => (hasBaseline && prevVal > 0 ? Math.round(((curVal - prevVal) / prevVal) * 100) : null);

  return {
    days,
    hasBaseline,
    current: cur,
    previous: prev,
    trainingsDeltaPct: delta(cur.count, prev.count),
    setsDeltaPct: delta(cur.totalSets, prev.totalSets),
    minutesDeltaPct: delta(cur.totalDurationSeconds, prev.totalDurationSeconds),
  };
}

function startOfWeek(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = d.getDay(); // 0 = domingo
  const diff = day === 0 ? -6 : 1 - day; // retrocede al lunes
  d.setDate(d.getDate() + diff);
  return d;
}

/**
 * Serie semanal real (entrenamientos/series/minutos) para las últimas
 * `weeks` semanas, incluyendo semanas sin entrenamientos (en 0), para
 * que la gráfica de evolución temporal tenga continuidad.
 */
export function weeklySeries(activities, weeks = 8, referenceDate = new Date()) {
  const currentWeekStart = startOfWeek(referenceDate);
  const buckets = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const start = new Date(currentWeekStart);
    start.setDate(start.getDate() - i * 7);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    buckets.push({ start, end, count: 0, sets: 0, minutes: 0 });
  }
  for (const a of activities) {
    const date = new Date(a.date);
    const bucket = buckets.find((b) => date >= b.start && date < b.end);
    if (!bucket) continue;
    bucket.count += 1;
    bucket.sets += a.sets;
    bucket.minutes += a.durationSeconds / 60;
  }
  return buckets.map((b) => ({ start: b.start, count: b.count, sets: b.sets, minutes: Math.round(b.minutes) }));
}

/**
 * Récords reales detectados desde el historial (sin sistema de PRs
 * aparte): la sesión más larga, con más series y con más puntos.
 * No incluye récords de peso: esa información no existe en el proyecto.
 */
export function personalRecords(activities) {
  if (activities.length === 0) return { longestSession: null, mostSetsSession: null, mostPointsSession: null };
  const by = (key) => activities.reduce((best, a) => (best === null || a[key] > best[key] ? a : best), null);
  return {
    longestSession: by("durationSeconds"),
    mostSetsSession: by("sets"),
    mostPointsSession: by("activityPoints"),
  };
}

/**
 * Intenta reconstruir qué grupos musculares trabajó cada entrenamiento
 * de los últimos 7 días. Solo es posible cuando `activity.routine`
 * coincide con la etiqueta de un enfoque conocido (buildRoutine es
 * determinístico) y la sesión se completó por entero contra esa
 * plantilla. Las rutinas propias (nombre libre) no pueden reconstruirse
 * con certeza y se excluyen — se informan en `unmatchedSessions`.
 */
export function weeklyMuscleFrequency(activities, referenceDate = new Date(), machineCatalog = localMachines) {
  const now = referenceDate.getTime();
  const recent = activities.filter((a) => withinLastDays(a, 7, now));

  const sessions = Object.fromEntries(MUSCLE_GROUPS.map((g) => [g, 0]));
  let matchedSessions = 0;
  let unmatchedSessions = 0;

  for (const a of recent) {
    const focus = focuses.find((f) => f.label === a.routine);
    if (!focus) {
      unmatchedSessions += 1;
      continue;
    }
    const template = buildRoutine(focus.id);
    if (a.exercises < template.exercises.length) {
      unmatchedSessions += 1; // sesión incompleta: no se puede afirmar qué trabajó
      continue;
    }
    matchedSessions += 1;
    const { groups } = routineMuscleGroups(template.exercises, machineCatalog);
    groups.forEach(({ group, count }) => {
      if (count > 0) sessions[group] += 1;
    });
  }

  return {
    groups: MUSCLE_GROUPS.map((group) => ({ group, sessions: sessions[group] })),
    matchedSessions,
    unmatchedSessions,
  };
}

/**
 * Último entrenamiento real, con el detalle de su rutina cuando se
 * puede reconstruir de forma determinística (ver weeklyMuscleFrequency).
 * `plannedExercises` es la plantilla del enfoque (objetivo planificado),
 * no un registro de peso/reps reales por serie — eso no existe hoy.
 */
export function lastActivityDetail(activities) {
  if (activities.length === 0) return null;
  const last = activities.reduce((most, a) => (new Date(a.date) > new Date(most.date) ? a : most), activities[0]);
  const focus = focuses.find((f) => f.label === last.routine);
  const template = focus ? buildRoutine(focus.id) : null;
  return {
    activity: last,
    plannedExercises: template?.exercises ?? null,
  };
}
