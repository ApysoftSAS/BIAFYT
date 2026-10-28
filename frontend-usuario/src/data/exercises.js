/**
 * BIAFYT — REGISTRO CANÓNICO DE EJERCICIOS (fase 1: identidad estable)
 * Da identidad estable (`id`) a los ejercicios usados por training.js,
 * independiente de su posición dentro de un focus. No sustituye ni
 * amplía todavía la lógica de prescripción (sets/reps/rest) de training.js.
 */

export const exercises = [
  { id: "ex-press-pecho", name: "Press de pecho", type: "fuerza", machineId: "m-press-pecho" },
  { id: "ex-jalon-pecho", name: "Jalón al pecho", type: "fuerza", machineId: "m-jalon" },
  { id: "ex-press-hombro", name: "Press de hombro", type: "fuerza", machineId: "m-hombro" },
  { id: "ex-prensa-piernas", name: "Prensa de piernas", type: "fuerza", machineId: "m-prensa" },
  { id: "ex-curl-femoral", name: "Curl femoral", type: "fuerza", machineId: "m-femoral" },
  { id: "ex-extension-triceps", name: "Extensión de tríceps", type: "fuerza" },
  { id: "ex-sentadilla", name: "Sentadilla", type: "fuerza" },
  { id: "ex-press-banca", name: "Press banca", type: "fuerza" },
  { id: "ex-peso-muerto", name: "Peso muerto", type: "fuerza" },
  { id: "ex-remo-barra", name: "Remo con barra", type: "fuerza" },
  { id: "ex-press-militar", name: "Press militar", type: "fuerza" },
  { id: "ex-cinta-correr", name: "Cinta de correr", type: "cardio", machineId: "m-cinta" },
  { id: "ex-remo-sentado", name: "Remo sentado", type: "fuerza", machineId: "m-remo" },
  { id: "ex-plancha", name: "Plancha", type: "isométrico" },
  { id: "ex-sentadilla-goblet", name: "Sentadilla goblet", type: "fuerza" },
  { id: "ex-zancadas", name: "Zancadas", type: "fuerza" },
  // DEUDA DE CLASIFICACIÓN (aprobada, sin resolver): son drills de movilidad,
  // no ejercicios de fuerza, pero se mantienen como "fuerza" a falta de una
  // categoría propia (ver revisión de fitness). No añadir `type: "movilidad"`
  // sin aprobación explícita.
  { id: "ex-movilidad-cadera", name: "Movilidad de cadera", type: "fuerza" },
  { id: "ex-movilidad-toracica", name: "Movilidad torácica", type: "fuerza" },
  { id: "ex-sentadilla-profunda-asistida", name: "Sentadilla profunda asistida", type: "fuerza" },
  { id: "ex-plancha-lateral", name: "Plancha lateral", type: "isométrico" },
  { id: "ex-hip-thrust", name: "Hip thrust", type: "fuerza", machineId: "m-hip-thrust" },
  // DEUDA DE CLASIFICACIÓN (aprobada, sin resolver): gesto de potencia/pliometría,
  // no de fuerza cargada tradicional; hereda la plantilla de reps/rest de
  // `performance` sin ajuste (ver revisión de fitness). No inventar un nuevo
  // rango de reps sin aprobación explícita.
  { id: "ex-salto-cajon", name: "Salto al cajón", type: "fuerza" },
];

export function findExercise(id) {
  return exercises.find((e) => e.id === id) || null;
}
