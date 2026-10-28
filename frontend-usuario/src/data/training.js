/**
 * BIAFYT — ENFOQUES Y RUTINAS (punto 71)
 * Los objetivos originales se mantienen y se agrupan con los
 * enfoques nuevos: "Hipertrofia / Masa muscular".
 */

import { findExercise } from "./exercises.js";

export const focuses = [
  { id: "hypertrophy", label: "Hipertrofia / Masa muscular", legacy: "Masa muscular", hint: "Volumen y tensión mecánica" },
  { id: "strength", label: "Fuerza", legacy: "Fuerza", hint: "Cargas altas, pocas repeticiones" },
  { id: "endurance", label: "Resistencia", legacy: "Resistencia", hint: "Series largas, descansos cortos" },
  { id: "maintenance", label: "Mantenimiento", legacy: "Mantenerme activo", hint: "Constancia sin sobrecarga" },
  { id: "fatloss", label: "Pérdida de grasa", legacy: "Pérdida de grasa", hint: "Densidad y gasto calórico" },
  { id: "fitness", label: "Condición física", legacy: "Condición física", hint: "Equilibrio general" },
  { id: "mobility", label: "Movilidad", hint: "Rango articular y control" },
  { id: "performance", label: "Rendimiento", hint: "Potencia y transferencia deportiva" },
];

export function findFocus(id) {
  return focuses.find((f) => f.id === id) || focuses[0];
}

/** Parámetros por enfoque: series, repeticiones y descanso. */
const shape = {
  hypertrophy: { sets: 4, reps: 12, rest: 90 },
  strength: { sets: 5, reps: 5, rest: 150 },
  endurance: { sets: 3, reps: 20, rest: 45 },
  maintenance: { sets: 3, reps: 12, rest: 60 },
  fatloss: { sets: 4, reps: 15, rest: 45 },
  fitness: { sets: 3, reps: 15, rest: 60 },
  mobility: { sets: 3, reps: 10, rest: 40 },
  performance: { sets: 4, reps: 8, rest: 120 },
};

/** Cada entrada referencia el `id` estable del ejercicio en data/exercises.js. */
const catalog = {
  hypertrophy: ["ex-press-pecho", "ex-jalon-pecho", "ex-press-hombro", "ex-prensa-piernas", "ex-curl-femoral", "ex-extension-triceps"],
  strength: ["ex-sentadilla", "ex-press-banca", "ex-peso-muerto", "ex-remo-barra", "ex-press-militar"],
  endurance: ["ex-cinta-correr", "ex-remo-sentado", "ex-prensa-piernas", "ex-jalon-pecho", "ex-plancha"],
  maintenance: ["ex-cinta-correr", "ex-press-pecho", "ex-remo-sentado", "ex-prensa-piernas"],
  fatloss: ["ex-cinta-correr", "ex-sentadilla-goblet", "ex-remo-sentado", "ex-press-hombro", "ex-zancadas", "ex-plancha"],
  fitness: ["ex-cinta-correr", "ex-press-pecho", "ex-jalon-pecho", "ex-prensa-piernas", "ex-plancha"],
  mobility: ["ex-movilidad-cadera", "ex-movilidad-toracica", "ex-sentadilla-profunda-asistida", "ex-plancha-lateral"],
  performance: ["ex-sentadilla", "ex-hip-thrust", "ex-remo-barra", "ex-press-hombro", "ex-salto-cajon"],
};

/**
 * Genera la rutina personalizada del enfoque (demo, punto 98).
 * La prescripción varía por `type` (fase 2 — prescripción por unidad):
 *  - fuerza: sets + reps + rest, sin cambios.
 *  - isométrico: sets + seconds + rest. PLACEHOLDER NO VALIDADO: se
 *    reutiliza temporalmente el valor de `reps` de la plantilla del focus
 *    como segundos de hold (aprobado explícitamente como deuda conocida,
 *    ver revisión de fitness). No tratar como prescripción fitness real
 *    hasta que un revisor de fitness confirme los segundos correctos.
 *  - cardio: duration + rest. `duration` queda deliberadamente sin valor
 *    (null) — NO se deriva de sets×reps porque esos números nunca
 *    representaron una duración real. Sin `duration`, Workout ejecuta el
 *    ejercicio en modo abierto (sin objetivo de tiempo).
 *
 * Deuda de clasificación conocida, aprobada para dejar sin resolver en
 * esta fase (ver revisión de fitness): "Salto al cajón" (`ex-salto-cajon`)
 * es un gesto de potencia/pliometría pero hereda la plantilla de fuerza de
 * `performance` sin ajuste — su reps/rest actuales NO están validados para
 * ese tipo de esfuerzo. "Movilidad de cadera" y "Movilidad torácica" son
 * drills de movilidad, no de fuerza, pero se mantienen con `type: "fuerza"`
 * a falta de una categoría propia. Ninguno de los dos casos se corrige
 * aquí: no se introduce un override por ejercicio ni un tipo nuevo.
 *
 * `exerciseSource` es opcional: si se omite, resuelve contra el catálogo
 * local `exercises.js` vía `findExercise` (mismo comportamiento que
 * siempre tuvo esta función; `exercises.js` no cambia su contrato). Si se
 * proporciona (p. ej. `exerciseCatalog` ya hidratado en AppContext), se
 * usa ESE catálogo — no se mezcla silenciosamente con `exercises.js`: un
 * id ausente en `exerciseSource` no cae al local, resuelve a `null`.
 */
function resolveExercise(id, source) {
  if (!source) return findExercise(id);
  return source.find((e) => e.id === id) || null;
}

export function buildRoutine(focusId, exerciseSource) {
  const params = shape[focusId] ?? shape.fitness;
  const ids = catalog[focusId] ?? catalog.fitness;
  return {
    focusId,
    name: findFocus(focusId).label,
    exercises: ids.map((exerciseId, i) => {
      const exercise = resolveExercise(exerciseId, exerciseSource);
      const base = {
        id: `ex-${focusId}-${i}`,
        exerciseId,
        name: exercise.name,
        type: exercise.type,
        rest: params.rest,
      };
      if (exercise.type === "cardio") {
        return { ...base, duration: null };
      }
      if (exercise.type === "isométrico") {
        return { ...base, sets: params.sets, seconds: params.reps };
      }
      return { ...base, sets: params.sets, reps: params.reps };
    }),
  };
}
