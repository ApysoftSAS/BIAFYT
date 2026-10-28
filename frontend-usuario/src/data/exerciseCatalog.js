/**
 * BIAFYT — CATÁLOGO DE EJERCICIOS (frontera de integración backend)
 * ---------------------------------------------------------------
 * `data/exercises.js` sigue siendo la fuente local (fallback) y el
 * shape que consume el resto de la app (`training.js#findExercise`,
 * `buildRoutine`, etc.) — ninguno de los dos cambia aquí.
 *
 * `loadExerciseCatalog()` intenta hidratar desde el backend
 * (`GET /api/v1/exercises`, público) y normaliza cada fila hacia el
 * mismo shape local (`slug`→`id`, `machine_id`→`machineId`, omitido
 * si no hay máquina). El `id` numérico interno del backend NUNCA sale
 * de este archivo — el resto de la app sigue usando el `id` string
 * estable (slug).
 *
 * ACEPTACIÓN ATÓMICA (fix de MEDIUM de QA): el catálogo remoto solo se
 * usa si coincide EXACTAMENTE, ejercicio por ejercicio, con el local
 * (`catalogMatchesLocal`) — misma cantidad (derivada de `local.length`,
 * nunca hardcodeada), mismo conjunto de ids, sin duplicados, y
 * name/type/machineId idénticos para cada uno. Cualquier anomalía
 * (fila inválida, faltante, duplicada, modificada, o count distinto)
 * descarta el catálogo remoto COMPLETO — nunca se devuelve un
 * subconjunto parcial. Si el backend no responde, responde con un
 * formato inesperado, o el catálogo remoto no pasa esa comparación, se
 * devuelve el local (`data/exercises.js`) tal cual, sin lanzar.
 */

import { exercises as localExercises } from "./exercises.js";
import { apiGetExercises } from "../utils/api.js";

export function normalizeApiExercise(row) {
  if (!row || typeof row !== "object") return null;
  const { slug, name, type, machine_id: machineId } = row;
  if (typeof slug !== "string" || !slug) return null;
  if (typeof name !== "string" || !name) return null;
  if (typeof type !== "string" || !type) return null;
  return {
    id: slug,
    name,
    type,
    ...(machineId ? { machineId } : {}),
  };
}

/**
 * Compara `normalized` (ya pasado por `normalizeApiExercise`, sin nulos)
 * contra `local` (fuente de verdad, `data/exercises.js` por defecto).
 * Todo o nada: cualquier diferencia devuelve `false`.
 */
export function catalogMatchesLocal(normalized, local = localExercises) {
  if (!Array.isArray(normalized) || normalized.length !== local.length) return false;

  const byId = new Map();
  for (const row of normalized) {
    if (!row || typeof row.id !== "string" || !row.id) return false;
    if (byId.has(row.id)) return false; // duplicado
    byId.set(row.id, row);
  }

  return local.every((expected) => {
    const actual = byId.get(expected.id);
    if (!actual) return false; // falta un ejercicio esperado
    if (actual.name !== expected.name) return false;
    if (actual.type !== expected.type) return false;
    const expectsMachine = "machineId" in expected;
    const hasMachine = "machineId" in actual;
    if (expectsMachine !== hasMachine) return false;
    if (expectsMachine && actual.machineId !== expected.machineId) return false;
    return true;
  });
}

/**
 * Nunca lanza. Devuelve siempre un catálogo utilizable: el remoto
 * normalizado solo si coincide atómicamente con el local
 * (`catalogMatchesLocal`), o el local en cualquier otro caso (backend
 * caído, error de red, formato inesperado, o cualquier discrepancia).
 */
export async function loadExerciseCatalog() {
  try {
    const data = await apiGetExercises();
    const rows = Array.isArray(data?.exercises) ? data.exercises : null;
    if (!rows) return localExercises;

    const normalized = rows.map(normalizeApiExercise);
    if (normalized.some((row) => row === null)) return localExercises; // cualquier fila inválida descarta todo el catálogo remoto

    if (!catalogMatchesLocal(normalized, localExercises)) return localExercises;

    return normalized;
  } catch {
    return localExercises;
  }
}
