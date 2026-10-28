/**
 * CATÁLOGO DE EJERCICIOS — INTEGRACIÓN FRONTEND (Exercise Catalog backend)
 * ---------------------------------------------------------------
 * `loadExerciseCatalog()` hidrata desde `GET /api/v1/exercises` cuando el
 * backend responde con un formato válido, y cae siempre a `data/exercises.js`
 * (backend caído, error de red, o respuesta con formato inesperado) — nunca
 * lanza.
 *
 * ACEPTACIÓN ATÓMICA (fix de MEDIUM de QA — antes, un catálogo remoto
 * parcialmente inválido podía devolver un SUBCONJUNTO silencioso en vez de
 * caer al local completo): el catálogo remoto solo se acepta si coincide
 * EXACTAMENTE, ejercicio por ejercicio, con `data/exercises.js`. Cualquier
 * anomalía (fila inválida, faltante, duplicada, modificada, o cantidad
 * distinta — nunca hardcodeada, siempre derivada de `localExercises.length`)
 * descarta el catálogo remoto COMPLETO.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { exercises as localExercises } from "./exercises.js";
import { buildRoutine, focuses } from "./training.js";
import { findExercise } from "./exercises.js";

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

/** Convierte una fila local {id,name,type,machineId?} al shape crudo de la API. */
function toApiRow(local, i) {
  return {
    id: i + 1,
    slug: local.id,
    name: local.name,
    type: local.type,
    machine_id: local.machineId ?? null,
    created_at: "2026-01-01T00:00:00.000000Z",
    updated_at: "2026-01-01T00:00:00.000000Z",
  };
}

describe("normalizeApiExercise", () => {
  it("normaliza slug→id, machine_id→machineId, y omite machineId cuando es null", async () => {
    const { normalizeApiExercise } = await import("./exerciseCatalog.js");
    expect(normalizeApiExercise({ id: 1, slug: "ex-press-pecho", name: "Press de pecho", type: "fuerza", machine_id: "m-press-pecho" })).toEqual({
      id: "ex-press-pecho",
      name: "Press de pecho",
      type: "fuerza",
      machineId: "m-press-pecho",
    });
    const withoutMachine = normalizeApiExercise({ id: 7, slug: "ex-sentadilla", name: "Sentadilla", type: "fuerza", machine_id: null });
    expect(withoutMachine).toEqual({ id: "ex-sentadilla", name: "Sentadilla", type: "fuerza" });
    expect("machineId" in withoutMachine).toBe(false);
  });

  it("rechaza filas sin slug/name/type", async () => {
    const { normalizeApiExercise } = await import("./exerciseCatalog.js");
    expect(normalizeApiExercise({ id: 1, name: "x", type: "fuerza" })).toBeNull();
    expect(normalizeApiExercise({ id: 1, slug: "x", type: "fuerza" })).toBeNull();
    expect(normalizeApiExercise({ id: 1, slug: "x", name: "x" })).toBeNull();
    expect(normalizeApiExercise(null)).toBeNull();
  });
});

describe("catalogMatchesLocal — comparación atómica contra data/exercises.js", () => {
  it("acepta un catálogo normalizado que coincide exactamente con el local", async () => {
    const { catalogMatchesLocal } = await import("./exerciseCatalog.js");
    // Copia estructural (no la misma referencia) para probar comparación por valor, no identidad.
    const identical = localExercises.map((e) => ({ ...e }));
    expect(catalogMatchesLocal(identical, localExercises)).toBe(true);
  });

  it("rechaza si falta un ejercicio (cantidad derivada de local.length, no hardcodeada)", async () => {
    const { catalogMatchesLocal } = await import("./exerciseCatalog.js");
    const missingOne = localExercises.slice(0, localExercises.length - 1);
    expect(missingOne.length).toBe(localExercises.length - 1);
    expect(catalogMatchesLocal(missingOne, localExercises)).toBe(false);
  });

  it("rechaza si hay un duplicado (misma cantidad total, pero un id repetido y otro ausente)", async () => {
    const { catalogMatchesLocal } = await import("./exerciseCatalog.js");
    const withDuplicate = [...localExercises.slice(0, localExercises.length - 1), { ...localExercises[0] }];
    expect(withDuplicate.length).toBe(localExercises.length);
    expect(catalogMatchesLocal(withDuplicate, localExercises)).toBe(false);
  });

  it("rechaza si un ejercicio tiene el name modificado", async () => {
    const { catalogMatchesLocal } = await import("./exerciseCatalog.js");
    const modified = localExercises.map((e, i) => (i === 0 ? { ...e, name: "Nombre alterado" } : { ...e }));
    expect(catalogMatchesLocal(modified, localExercises)).toBe(false);
  });

  it("rechaza si un ejercicio tiene el type modificado", async () => {
    const { catalogMatchesLocal } = await import("./exerciseCatalog.js");
    const modified = localExercises.map((e, i) => (i === 0 ? { ...e, type: "otro-tipo" } : { ...e }));
    expect(catalogMatchesLocal(modified, localExercises)).toBe(false);
  });

  it("rechaza si machineId aparece donde el local no lo tiene, o falta donde el local sí lo tiene", async () => {
    const { catalogMatchesLocal } = await import("./exerciseCatalog.js");
    const withoutMachine = localExercises.find((e) => "machineId" in e);
    const withMachine = localExercises.find((e) => !("machineId" in e));

    const addedMachine = localExercises.map((e) => (e.id === withMachine.id ? { ...e, machineId: "m-inventado" } : { ...e }));
    expect(catalogMatchesLocal(addedMachine, localExercises)).toBe(false);

    const removedMachine = localExercises.map((e) => {
      if (e.id !== withoutMachine.id) return { ...e };
      const { machineId, ...rest } = e; // eslint-disable-line no-unused-vars
      return rest;
    });
    expect(catalogMatchesLocal(removedMachine, localExercises)).toBe(false);
  });
});

describe("loadExerciseCatalog — backend disponible", () => {
  it("con las filas reales del backend (derivadas de data/exercises.js), devuelve el catálogo remoto (paridad 1:1)", async () => {
    const apiModule = await import("../utils/api.js");
    apiModule.apiGetExercises.mockResolvedValue({ exercises: localExercises.map(toApiRow) });

    const { loadExerciseCatalog } = await import("./exerciseCatalog.js");
    const catalog = await loadExerciseCatalog();

    expect(catalog.length).toBe(localExercises.length);
    expect(catalog).toEqual(localExercises);
  });
});

describe("loadExerciseCatalog — aceptación atómica: cualquier anomalía descarta TODO el remoto", () => {
  it("API vacía → fallback local completo", async () => {
    const apiModule = await import("../utils/api.js");
    apiModule.apiGetExercises.mockResolvedValue({ exercises: [] });

    const { loadExerciseCatalog } = await import("./exerciseCatalog.js");
    const catalog = await loadExerciseCatalog();

    expect(catalog).toEqual(localExercises);
  });

  it("API con una fila inválida (sin slug) entre las demás válidas → fallback local completo, no un subconjunto", async () => {
    const apiModule = await import("../utils/api.js");
    const rows = localExercises.map(toApiRow);
    rows[3] = { id: 999, name: "Sin slug", type: "fuerza", machine_id: null };
    apiModule.apiGetExercises.mockResolvedValue({ exercises: rows });

    const { loadExerciseCatalog } = await import("./exerciseCatalog.js");
    const catalog = await loadExerciseCatalog();

    expect(catalog).toEqual(localExercises);
    expect(catalog.length).not.toBe(localExercises.length - 1);
  });

  it("API con 21/22 (falta un ejercicio) → fallback local completo", async () => {
    const apiModule = await import("../utils/api.js");
    const rows = localExercises.slice(0, -1).map(toApiRow);
    apiModule.apiGetExercises.mockResolvedValue({ exercises: rows });

    const { loadExerciseCatalog } = await import("./exerciseCatalog.js");
    const catalog = await loadExerciseCatalog();

    expect(catalog).toEqual(localExercises);
  });

  it("API con la cantidad completa pero una fila modificada (name distinto) → fallback local completo", async () => {
    const apiModule = await import("../utils/api.js");
    const rows = localExercises.map(toApiRow);
    rows[0] = { ...rows[0], name: "Nombre alterado en backend" };
    apiModule.apiGetExercises.mockResolvedValue({ exercises: rows });

    const { loadExerciseCatalog } = await import("./exerciseCatalog.js");
    const catalog = await loadExerciseCatalog();

    expect(catalog).toEqual(localExercises);
  });

  it("API con un duplicado (un slug repetido, otro ausente) → fallback local completo", async () => {
    const apiModule = await import("../utils/api.js");
    const rows = localExercises.map(toApiRow);
    rows[rows.length - 1] = { ...rows[0] }; // pisa el último con una copia del primero
    apiModule.apiGetExercises.mockResolvedValue({ exercises: rows });

    const { loadExerciseCatalog } = await import("./exerciseCatalog.js");
    const catalog = await loadExerciseCatalog();

    expect(catalog).toEqual(localExercises);
  });

  it("respuesta con formato inesperado (sin `exercises`) → fallback local completo", async () => {
    const apiModule = await import("../utils/api.js");
    apiModule.apiGetExercises.mockResolvedValue({ data: [] });

    const { loadExerciseCatalog } = await import("./exerciseCatalog.js");
    const catalog = await loadExerciseCatalog();

    expect(catalog).toEqual(localExercises);
  });

  it("backend caído / error de red → fallback local completo", async () => {
    const apiModule = await import("../utils/api.js");
    apiModule.apiGetExercises.mockRejectedValue(new Error("No pudimos conectar con el servidor."));

    const { loadExerciseCatalog } = await import("./exerciseCatalog.js");
    const catalog = await loadExerciseCatalog();

    expect(catalog).toEqual(localExercises);
  });

  it("el fallback es siempre deep-equal a data/exercises.js, exista o no un intento remoto previo", async () => {
    const apiModule = await import("../utils/api.js");
    apiModule.apiGetExercises.mockRejectedValue(new Error("red caída"));

    const { loadExerciseCatalog } = await import("./exerciseCatalog.js");
    const catalog = await loadExerciseCatalog();

    expect(catalog).toEqual(localExercises);
    expect(catalog.length).toBe(localExercises.length);
  });
});

describe("buildRoutine() — sin cambios de resultado tras la integración", () => {
  it("genera una rutina para cada uno de los 8 focos sin lanzar, con exercises consistentes con data/exercises.js", () => {
    for (const focus of focuses) {
      const routine = buildRoutine(focus.id);
      expect(routine.focusId).toBe(focus.id);
      expect(routine.exercises.length).toBeGreaterThan(0);
      for (const ex of routine.exercises) {
        const source = findExercise(ex.exerciseId);
        expect(source).not.toBeNull();
        expect(ex.name).toBe(source.name);
        expect(ex.type).toBe(source.type);
      }
    }
  });

  it("mantiene exactamente el mismo resultado (regresión) para el foco 'strength'", () => {
    const routine = buildRoutine("strength");
    expect(routine.name).toBe("Fuerza");
    expect(routine.exercises.map((e) => e.exerciseId)).toEqual(["ex-sentadilla", "ex-press-banca", "ex-peso-muerto", "ex-remo-barra", "ex-press-militar"]);
    expect(routine.exercises.every((e) => e.sets === 5 && e.reps === 5 && e.rest === 150)).toBe(true);
  });
});
