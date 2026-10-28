/**
 * BIAFYT — INTERPRETACIÓN DE PRESCRIPCIÓN POR TIPO
 * Única fuente de verdad para leer "cuánto hay que hacer" en un ejercicio,
 * sin importar su `type` (fuerza | cardio | isométrico). Cualquier ejercicio
 * sin `type` (customRoutines antiguas creadas antes de este modelo) se
 * interpreta como fuerza.
 */

export function typeOf(exercise) {
  return exercise.type ?? "fuerza";
}

/** Nº de series a ejecutar. Cardio no tiene series reales (bloque continuo) → 1. */
export function setsFor(exercise) {
  return exercise.sets ?? 1;
}

/**
 * Unidad de trabajo por serie/bloque, según el tipo:
 *  - fuerza: repeticiones.
 *  - isométrico: segundos de hold.
 *  - cardio: duración total del bloque en segundos, o `open: true` cuando
 *    no hay objetivo de tiempo definido (modo abierto — el usuario confirma
 *    manualmente cuándo termina, sin cronómetro objetivo).
 */
export function unitFor(exercise) {
  const type = typeOf(exercise);
  if (type === "cardio") {
    const duration = exercise.duration ?? null;
    return { value: duration, label: "DURACIÓN", isTime: true, open: duration == null };
  }
  if (type === "isométrico") {
    return { value: exercise.seconds ?? 0, label: "SEGUNDOS", isTime: true, open: false };
  }
  return { value: exercise.reps ?? 0, label: "REPETICIONES", isTime: false, open: false };
}
