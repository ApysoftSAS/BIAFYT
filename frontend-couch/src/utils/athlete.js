/**
 * BIAFYT COUCH — INFORMACIÓN DEL ATLETA
 * ---------------------------------------------------------------
 * Lógica pura sobre la respuesta de `GET /me/coach/athletes/{id}`.
 * El perfil llega como objeto (o `null` si el atleta no tiene datos);
 * cada campo puede además venir `null` por separado.
 */

const PROFILE_FIELDS = [
  { key: "level", label: "Nivel" },
  { key: "focus_id", label: "Enfoque" },
  { key: "age", label: "Edad", suffix: " años" },
  { key: "weight", label: "Peso", suffix: " kg" },
  { key: "height", label: "Altura", suffix: " cm" },
  { key: "months_training", label: "Meses entrenando" },
];

/**
 * Filas `{ label, value }` para los campos de perfil que tienen valor.
 * Devuelve `[]` si el perfil es `null` o todos sus campos están vacíos
 * — la pantalla usa eso para el estado vacío.
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
