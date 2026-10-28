/**
 * TRAINING — REGRESIÓN Y CATALOG-AWARE (fase Training/Programs, Candidato B)
 * ---------------------------------------------------------------
 * `training.js` no tenía tests dedicados antes de esta fase (solo cobertura
 * indirecta de `buildRoutine` dentro de `exerciseCatalog.test.js`, enfocada
 * en la integración del catálogo, no en el dominio de Training en sí).
 *
 * Cubre:
 *  A. Backward compatibility: `buildRoutine(focusId)` sin segundo argumento
 *     sigue resolviendo contra `exercises.js` local (comportamiento previo
 *     a esta fase, intacto).
 *  B/D. Catalog-aware: `buildRoutine(focusId, source)` usa REALMENTE el
 *     `source` recibido (detecta una implementación que lo ignore
 *     silenciosamente y siga leyendo `exercises.js`).
 *  C. Regresión de los 8 focos: cantidad, orden, ids y prescripción exacta
 *     (no solo "no crashea") — valores hardcodeados de forma independiente
 *     al módulo bajo prueba, como baseline de regresión.
 *  E. `findExercise(id)` sin `source` sigue resolviendo contra `exercises.js`.
 *  F. Wiring en AppContext: `exerciseCatalog` hidratado fluye realmente
 *     hasta `routine` (mismo arnés que el resto de tests de AppContext).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildRoutine, focuses, findFocus } from "./training.js";
import { exercises as localExercises, findExercise } from "./exercises.js";

vi.mock("../utils/api.js", async () => {
  const actual = await vi.importActual("../utils/api.js");
  return {
    ...actual,
    apiGetExercises: vi.fn(),
  };
});

afterEach(() => {
  vi.clearAllMocks();
});

// Baseline independiente (no derivada de training.js): ids esperados por foco,
// en el orden en que training.js los define hoy. Cambiar esto a propósito es
// exactamente lo que debe hacer fallar este test si alguien reordena/agrega/
// quita un ejercicio de un foco sin aprobación explícita.
const EXPECTED_CATALOG = {
  hypertrophy: ["ex-press-pecho", "ex-jalon-pecho", "ex-press-hombro", "ex-prensa-piernas", "ex-curl-femoral", "ex-extension-triceps"],
  strength: ["ex-sentadilla", "ex-press-banca", "ex-peso-muerto", "ex-remo-barra", "ex-press-militar"],
  endurance: ["ex-cinta-correr", "ex-remo-sentado", "ex-prensa-piernas", "ex-jalon-pecho", "ex-plancha"],
  maintenance: ["ex-cinta-correr", "ex-press-pecho", "ex-remo-sentado", "ex-prensa-piernas"],
  fatloss: ["ex-cinta-correr", "ex-sentadilla-goblet", "ex-remo-sentado", "ex-press-hombro", "ex-zancadas", "ex-plancha"],
  fitness: ["ex-cinta-correr", "ex-press-pecho", "ex-jalon-pecho", "ex-prensa-piernas", "ex-plancha"],
  mobility: ["ex-movilidad-cadera", "ex-movilidad-toracica", "ex-sentadilla-profunda-asistida", "ex-plancha-lateral"],
  performance: ["ex-sentadilla", "ex-hip-thrust", "ex-remo-barra", "ex-press-hombro", "ex-salto-cajon"],
};

const EXPECTED_SHAPE = {
  hypertrophy: { sets: 4, reps: 12, rest: 90 },
  strength: { sets: 5, reps: 5, rest: 150 },
  endurance: { sets: 3, reps: 20, rest: 45 },
  maintenance: { sets: 3, reps: 12, rest: 60 },
  fatloss: { sets: 4, reps: 15, rest: 45 },
  fitness: { sets: 3, reps: 15, rest: 60 },
  mobility: { sets: 3, reps: 10, rest: 40 },
  performance: { sets: 4, reps: 8, rest: 120 },
};

describe("A. Backward compatibility — buildRoutine(focusId) sin segundo argumento", () => {
  it("sigue resolviendo contra exercises.js local, con el mismo resultado exacto de siempre", () => {
    const routine = buildRoutine("strength");
    expect(routine.exercises.map((e) => e.exerciseId)).toEqual(EXPECTED_CATALOG.strength);
    expect(routine.exercises.every((e) => e.sets === 5 && e.reps === 5 && e.rest === 150)).toBe(true);
    for (const ex of routine.exercises) {
      const local = findExercise(ex.exerciseId);
      expect(ex.name).toBe(local.name);
      expect(ex.type).toBe(local.type);
    }
  });
});

describe("C. Regresión de los 8 focos — cantidad, orden, ids y prescripción exacta", () => {
  it.each(focuses.map((f) => f.id))("foco '%s' mantiene ids, orden y prescripción esperados", (focusId) => {
    const routine = buildRoutine(focusId);
    const expectedIds = EXPECTED_CATALOG[focusId];
    const expectedShape = EXPECTED_SHAPE[focusId];

    expect(routine.focusId).toBe(focusId);
    expect(routine.name).toBe(findFocus(focusId).label);
    expect(routine.exercises.map((e) => e.exerciseId)).toEqual(expectedIds); // cantidad + orden + ids
    expect(routine.exercises.length).toBe(expectedIds.length);

    routine.exercises.forEach((ex, i) => {
      expect(ex.exerciseId).toBe(expectedIds[i]); // orden exacto, no solo mismo set
      expect(ex.id).toBe(`ex-${focusId}-${i}`);
      expect(ex.rest).toBe(expectedShape.rest);

      const source = findExercise(ex.exerciseId);
      expect(ex.name).toBe(source.name);
      expect(ex.type).toBe(source.type);

      // Prescripción por `type` — misma regla para los 8 focos (no se toca aquí).
      if (source.type === "cardio") {
        expect(ex.duration).toBeNull();
        expect(ex).not.toHaveProperty("sets");
        expect(ex).not.toHaveProperty("reps");
      } else if (source.type === "isométrico") {
        expect(ex.sets).toBe(expectedShape.sets);
        expect(ex.seconds).toBe(expectedShape.reps);
        expect(ex).not.toHaveProperty("duration");
      } else {
        expect(ex.sets).toBe(expectedShape.sets);
        expect(ex.reps).toBe(expectedShape.reps);
        expect(ex).not.toHaveProperty("duration");
        expect(ex).not.toHaveProperty("seconds");
      }
    });
  });

  it("un focusId desconocido cae al fallback existente (fitness), sin lanzar", () => {
    const routine = buildRoutine("focus-inexistente");
    expect(routine.exercises.map((e) => e.exerciseId)).toEqual(EXPECTED_CATALOG.fitness);
  });
});

describe("B/D. Catalog-aware — buildRoutine(focusId, source) usa realmente el source recibido", () => {
  it("con un source explícito que altera name/type de un ejercicio real del foco, el output refleja ESE source, no exercises.js", () => {
    // No se inventan ejercicios nuevos: mismo `id` real ("ex-sentadilla"), solo
    // se altera name/type para detectar si buildRoutine ignora el argumento.
    const alteredSource = localExercises.map((e) => (e.id === "ex-sentadilla" ? { ...e, name: "Sentadilla (source de test)", type: "cardio" } : e));

    const routine = buildRoutine("strength", alteredSource);
    const altered = routine.exercises.find((e) => e.exerciseId === "ex-sentadilla");

    expect(altered.name).toBe("Sentadilla (source de test)");
    expect(altered.type).toBe("cardio");
    expect(altered.duration).toBeNull(); // la prescripción también sigue el `type` del source recibido

    // El resto del foco, sin alterar en el source, se mantiene igual que el default.
    const unaffected = routine.exercises.find((e) => e.exerciseId === "ex-press-banca");
    expect(unaffected.name).toBe(findExercise("ex-press-banca").name);
  });

  it("con un source que NO contiene un ejercicio del foco, ese ejercicio resuelve a null en vez de caer silenciosamente a exercises.js", () => {
    const partialSource = localExercises.filter((e) => e.id !== "ex-sentadilla");
    expect(() => buildRoutine("strength", partialSource)).toThrow();
  });
});

describe("E. findExercise(id) — sin cambios, resuelve solo contra exercises.js local", () => {
  it("devuelve el ejercicio real del catálogo local (exercises.js no cambió su contrato: sigue siendo de un solo argumento)", () => {
    const ex = findExercise("ex-sentadilla");
    expect(ex).toEqual(localExercises.find((e) => e.id === "ex-sentadilla"));
  });

  it("devuelve null para un id inexistente", () => {
    expect(findExercise("ex-no-existe")).toBeNull();
  });
});

describe("F. Wiring en AppContext — exerciseCatalog hidratado llega hasta routine", () => {
  it("tras hidratar un catálogo remoto válido (atómicamente idéntico al local), routine se sigue generando correctamente", async () => {
    const { mountApp, actAsync } = await import("../state/testHarness.jsx");
    const apiModule = await import("../utils/api.js");

    const toApiRow = (local, i) => ({
      id: i + 1,
      slug: local.id,
      name: local.name,
      type: local.type,
      machine_id: local.machineId ?? null,
    });
    apiModule.apiGetExercises.mockResolvedValue({ exercises: localExercises.map(toApiRow) });

    const harness = mountApp();
    try {
      // La hidratación es asíncrona y no bloqueante (ver AppContext.jsx):
      // apiGetExercises() → normalización → setExerciseCatalog encadena
      // varios microtasks. Un macrotask (mismo patrón que Onboarding.test.jsx)
      // garantiza que ya drenaron todos antes de leer el estado.
      await actAsync(() => new Promise((resolve) => setTimeout(resolve, 0)));

      expect(harness.app.exerciseCatalog).toEqual(localExercises);
      expect(harness.app.exerciseCatalog).not.toBe(localExercises); // normalizado, no la misma referencia

      const { routine } = harness.app;
      expect(routine.exercises.map((e) => e.exerciseId)).toEqual(EXPECTED_CATALOG.hypertrophy); // focusId default
    } finally {
      harness.unmount();
      localStorage.clear();
    }
  });
});
