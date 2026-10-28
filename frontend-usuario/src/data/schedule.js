/**
 * BIAFYT — JORNADAS Y UTILIDADES DE CALENDARIO
 * Separado de los componentes para no romper fast refresh.
 */

export const SLOTS = [
  { id: "madrugada", label: "Madrugada", range: "5:00 – 8:00" },
  { id: "manana", label: "Mañana", range: "8:00 – 12:00" },
  { id: "tarde", label: "Tarde", range: "12:00 – 18:00" },
  { id: "noche", label: "Noche", range: "18:00 – 22:00" },
];

export const DAY_LABELS = ["D", "L", "M", "M", "J", "V", "S"];

// Nombres completos, mismo índice que DAY_LABELS y Date#getDay() (0 = domingo).
export const WEEKDAY_NAMES = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

// Orden natural de semana (lunes a domingo) para mostrar los días seleccionados.
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

export const MONTHS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

export function dayKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/**
 * Valida la programación semanal (días + hora de inicio/fin) antes de
 * guardarla. Devuelve un mensaje de error en español o null si es válida.
 * No soporta jornadas que cruzan medianoche (endTime debe ser posterior).
 */
export function validateSchedule({ days, startTime, endTime }) {
  if (!days || days.length === 0) return "Selecciona al menos un día de entrenamiento.";
  if (!startTime) return "Indica la hora de inicio.";
  if (!endTime) return "Indica la hora de finalización.";
  if (endTime <= startTime) return "La hora de finalización debe ser posterior a la hora de inicio.";
  return null;
}

/** Progreso real del día para los retos diarios. Recibe `state.identity` (no `state` completo). */
export function progressForDay(identity, key) {
  const stored = identity.challengeProgress[key] ?? { claimed: [] };
  const dayActivities = identity.activities.filter((a) => a.date.slice(0, 10) === key);
  const checkedIn = identity.lastCheckIn && identity.lastCheckIn.slice(0, 10) === key ? 1 : 0;

  return {
    claimed: stored.claimed ?? [],
    checkin: checkedIn,
    sets: dayActivities.reduce((t, a) => t + a.sets, 0),
    workouts: dayActivities.length,
    minutes: Math.round(dayActivities.reduce((t, a) => t + a.durationSeconds, 0) / 60),
    validated: dayActivities.filter((a) => a.validation === "VALID").length,
    machinesViewed: stored.machinesViewed ?? 0,
  };
}
