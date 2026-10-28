/** Iniciales de un nombre (máx 2). Copia de frontend-couch/src/utils/format.js. */
export function initialsOf(name = "") {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join("");
}
