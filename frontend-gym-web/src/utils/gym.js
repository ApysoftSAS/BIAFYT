/**
 * BIAFYT GYM WEB — LÓGICA PURA DEL SLICE GYM MVP (D-GYM)
 * ---------------------------------------------------------------
 * Sin estado, sin fetch. Sobre las respuestas de `/me/gym-assignments` y
 * `/me/gym/{gym}/members/{userId}`.
 */

/** Elimina duplicados por `id` conservando el primero. */
export function dedupeById(items = []) {
  const seen = new Set();
  return items.filter((it) => {
    if (!it || seen.has(it.id)) return false;
    seen.add(it.id);
    return true;
  });
}

/**
 * Gyms en los que el usuario es `gym_admin` ACTIVO, a partir de la
 * respuesta de `GET /me/gym-assignments` (que ya solo trae assignments
 * activos). Deduplicados y ordenados de forma determinista
 * (nombre, luego id) para que la selección por defecto sea estable.
 */
export function adminGymsFrom(assignments = []) {
  return dedupeById(
    (assignments ?? [])
      .filter((a) => a && a.role === "gym_admin" && a.gym)
      .map((a) => a.gym)
  ).sort((a, b) => (a.name || "").localeCompare(b.name || "") || a.id - b.id);
}

const PROFILE_FIELDS = [
  { key: "level", label: "Nivel" },
  { key: "focus_id", label: "Enfoque" },
  { key: "age", label: "Edad", suffix: " años" },
  { key: "weight", label: "Peso", suffix: " kg" },
  { key: "height", label: "Altura", suffix: " cm" },
  { key: "months_training", label: "Meses entrenando" },
];

/**
 * Filas `{ label, value }` para los campos de perfil con valor. `[]` si el
 * perfil es `null` o todos los campos están vacíos. `0` es un dato real
 * (principiante), no un campo vacío.
 */
export function profileRows(profile) {
  if (!profile) return [];
  return PROFILE_FIELDS.filter(({ key }) => {
    const v = profile[key];
    return v !== null && v !== undefined && v !== "";
  }).map(({ key, label, suffix }) => ({
    label,
    value: `${profile[key]}${suffix ?? ""}`,
  }));
}

/** Duración legible a partir de segundos: "1 h 05 min", "42 min", "—". */
export function formatDuration(totalSeconds) {
  const s = Math.max(0, Math.round(Number(totalSeconds) || 0));
  if (s === 0) return "—";
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  if (h > 0) return `${h} h ${String(m).padStart(2, "0")} min`;
  return `${m} min`;
}

/** Fecha corta es-CO ("14 sept") o "" si la entrada no es válida. */
export function formatDate(iso) {
  try {
    return new Date(iso).toLocaleDateString("es-CO", { day: "2-digit", month: "short" });
  } catch {
    return "";
  }
}
