import { describe, expect, it } from "vitest";
import raw from "../data/exerciseLibrary.json";
import {
  CATEGORY_ES,
  EQUIPMENT_ES,
  MUSCLE_ES,
  filterLibrary,
  loadExerciseLibrary,
  mediaUrls,
  normalize,
  withSearchText,
} from "./exerciseLibrary.js";

const list = raw.map(withSearchText);

describe("biblioteca de ejercicios — datos", () => {
  it("tiene 1.324 ejercicios con id único, nombre y pasos en español", () => {
    expect(raw).toHaveLength(1324);
    expect(new Set(raw.map((e) => e.id)).size).toBe(raw.length);
    expect(raw.every((e) => e.n && e.f && Array.isArray(e.st) && e.st.length > 0)).toBe(true);
  });

  it("toda categoría, equipo y músculo tiene traducción (nada queda en inglés)", () => {
    const miss = (vals, map) => [...new Set(vals)].filter((v) => !(v in map));
    expect(miss(raw.map((e) => e.c), CATEGORY_ES)).toEqual([]);
    expect(miss(raw.map((e) => e.q), EQUIPMENT_ES)).toEqual([]);
    expect(miss(raw.flatMap((e) => [e.t, e.m, ...e.s]), MUSCLE_ES)).toEqual([]);
  });

  it("cada ejercicio tiene su miniatura local en public/", async () => {
    const { existsSync } = await import("node:fs");
    const missing = raw.filter((e) => !existsSync(`public/exercise-media/img/${e.f}.jpg`)).map((e) => e.id);
    expect(missing).toEqual([]);
  });
});

describe("filterLibrary", () => {
  it("normaliza tildes y mayúsculas", () => {
    expect(normalize("Tríceps  ")).toBe("triceps  ");
    expect(filterLibrary(list, { query: "TRICEPS" }).length).toBeGreaterThan(0);
  });

  it("busca por etiquetas en español, no solo por el nombre en inglés", () => {
    const r = filterLibrary(list, { query: "mancuernas pecho" });
    expect(r.length).toBeGreaterThan(0);
    expect(r.every((e) => e.q === "dumbbell")).toBe(true);
  });

  it("exige todas las palabras y combina con los filtros exactos", () => {
    const base = filterLibrary(list, { category: "chest" });
    expect(base.every((e) => e.c === "chest")).toBe(true);
    expect(filterLibrary(list, { category: "chest", equipment: "barbell" }).every((e) => e.q === "barbell")).toBe(true);
    expect(filterLibrary(list, { query: "zzzxx" })).toEqual([]);
  });

  it("sin filtros devuelve todo", () => {
    expect(filterLibrary(list)).toHaveLength(1324);
  });
});

describe("mediaUrls", () => {
  const e = { f: "0001-2gPfomN" };
  it("la miniatura es local y el GIF solo existe con base configurada", () => {
    expect(mediaUrls(e, undefined).gif).toBeNull();
    expect(mediaUrls(e, undefined).image).toMatch(/exercise-media\/img\/0001-2gPfomN\.jpg$/);
    expect(mediaUrls(e, "https://cdn.example.com/gif/").gif).toBe("https://cdn.example.com/gif/0001-2gPfomN.gif");
  });
});

describe("loadExerciseLibrary", () => {
  it("carga diferida y devuelve entradas con texto de búsqueda", async () => {
    const l = await loadExerciseLibrary();
    expect(l).toHaveLength(1324);
    expect(typeof l[0].search).toBe("string");
  });
});

import { displayName, libraryType, routineRowFromLibrary } from "./exerciseLibrary.js";
import { routineMuscleGroups } from "./analytics.js";

describe("tipo y fila de rutina", () => {
  const byId = (id) => raw.find((e) => e.id === id);

  it("clasifica cardio (categoría), isométricos curados y fuerza por defecto", () => {
    expect(libraryType(byId("2135"))).toBe("isométrico"); // weighted front plank
    expect(libraryType(raw.find((e) => e.c === "cardio"))).toBe("cardio");
    expect(libraryType(raw.find((e) => /barbell bench press/.test(e.n)) ?? raw[0])).toBe("fuerza");
    // un estiramiento dinámico y un puente con movimiento NO son isométricos
    expect(libraryType(raw.find((e) => e.n === "world greatest stretch"))).toBe("fuerza");
    expect(libraryType(raw.find((e) => e.n === "glute bridge march"))).toBe("fuerza");
    expect(libraryType(raw.find((e) => e.n === "single leg bridge with outstretched leg"))).toBe("fuerza");
  });

  it("el conteo por tipo coincide con la curaduría (59 isométricos, 29 cardio)", () => {
    const count = (t) => raw.filter((e) => libraryType(e) === t).length;
    expect(count("isométrico")).toBe(59);
    expect(count("cardio")).toBe(29);
    expect(count("fuerza")).toBe(1324 - 59 - 29);
  });

  it("la fila respeta el contrato por type de training.js/MyRoutines", () => {
    const f = routineRowFromLibrary(raw.find((e) => libraryType(e) === "fuerza"), "u1");
    expect(f).toMatchObject({ id: "ex-u1", type: "fuerza", sets: 4, reps: 12, rest: 60 });
    expect(f.exerciseId).toMatch(/^lib-/);
    expect(f.seconds).toBeUndefined();

    const i = routineRowFromLibrary(byId("2135"), "u2");
    expect(i).toMatchObject({ type: "isométrico", sets: 4, seconds: 20, rest: 60 });
    expect(i.reps).toBeUndefined();

    const c = routineRowFromLibrary(raw.find((e) => e.c === "cardio"), "u3");
    expect(c).toMatchObject({ type: "cardio", duration: null, rest: 60 });
    expect(c.sets).toBeUndefined();
    expect(c.reps).toBeUndefined();
  });

  it("capitaliza el nombre y conserva el músculo objetivo", () => {
    expect(displayName("deep push up")).toBe("Deep push up");
    const row = routineRowFromLibrary(byId("1316"), "u4");
    expect(row.name).toBe("Barbell bent arm pullover");
    expect(row.muscle).toBe("lats");
  });
});

describe("analítica muscular con filas de la biblioteca", () => {
  it("usa el músculo de la fila (libre de máquinas) y deja sin grupo lo no muscular", () => {
    const rows = [
      routineRowFromLibrary(raw.find((e) => e.t === "pectorals"), "a"),
      routineRowFromLibrary(raw.find((e) => e.t === "quads"), "b"),
      routineRowFromLibrary(raw.find((e) => e.t === "abs"), "c"),
      routineRowFromLibrary(raw.find((e) => e.t === "cardiovascular system"), "d"),
    ];
    const { groups, unmatched } = routineMuscleGroups(rows);
    const n = (g) => groups.find((x) => x.group === g).count;
    expect([n("Pecho"), n("Piernas"), n("Core")]).toEqual([1, 1, 1]);
    expect(unmatched).toHaveLength(1);
  });

  it("las filas sin `muscle` siguen cruzándose por nombre con las máquinas (comportamiento previo)", () => {
    const { unmatched } = routineMuscleGroups([{ name: "Press de pecho" }, { name: "Algo inexistente" }]);
    expect(unmatched).toEqual(["Algo inexistente"]);
  });

  it("todo `target` de la biblioteca tiene grupo, salvo el sistema cardiovascular", () => {
    const targets = [...new Set(raw.map((e) => e.t))];
    const sinGrupo = targets.filter((t) => routineMuscleGroups([{ name: "x", muscle: t }]).unmatched.length > 0);
    expect(sinGrupo).toEqual(["cardiovascular system"]);
  });
});
