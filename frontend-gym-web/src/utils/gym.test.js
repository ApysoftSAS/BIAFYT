import { describe, expect, it } from "vitest";
import { dedupeById, adminGymsFrom, profileRows, formatDuration, formatDate } from "./gym.js";

describe("dedupeById", () => {
  it("conserva el primero de cada id y tolera entradas nulas", () => {
    expect(dedupeById([{ id: 1 }, { id: 2 }, { id: 1 }, null])).toEqual([{ id: 1 }, { id: 2 }]);
  });
  it("tolera la entrada vacía", () => {
    expect(dedupeById()).toEqual([]);
  });
});

describe("adminGymsFrom", () => {
  const rows = [
    { id: 10, role: "member", gym: { id: 3, name: "Zeta" } },
    { id: 11, role: "gym_admin", gym: { id: 3, name: "Zeta" } },
    { id: 12, role: "gym_admin", gym: { id: 1, name: "Alfa" } },
    { id: 13, role: "gym_admin", gym: { id: 3, name: "Zeta" } }, // dup gym
    { id: 14, role: "coach", gym: { id: 9, name: "Nueve" } },
  ];

  it("filtra solo role=gym_admin, deduplica por gym y ordena por nombre luego id", () => {
    expect(adminGymsFrom(rows)).toEqual([
      { id: 1, name: "Alfa" },
      { id: 3, name: "Zeta" },
    ]);
  });

  it("sin ningún gym_admin → []", () => {
    expect(adminGymsFrom([{ id: 1, role: "member", gym: { id: 2, name: "X" } }])).toEqual([]);
  });

  it("tolera entrada vacía / undefined", () => {
    expect(adminGymsFrom()).toEqual([]);
    expect(adminGymsFrom([])).toEqual([]);
  });
});

describe("profileRows", () => {
  it("null → []", () => {
    expect(profileRows(null)).toEqual([]);
  });
  it("todos vacíos → []", () => {
    expect(profileRows({ level: null, age: null })).toEqual([]);
  });
  it("omite null/undefined, mantiene 0 y aplica sufijos", () => {
    expect(profileRows({ level: "novato", focus_id: null, age: 30, weight: null, months_training: 0 })).toEqual([
      { label: "Nivel", value: "novato" },
      { label: "Edad", value: "30 años" },
      { label: "Meses entrenando", value: "0" },
    ]);
  });
});

describe("formatDuration", () => {
  it("cero / inválido → —", () => {
    expect(formatDuration(0)).toBe("—");
    expect(formatDuration(undefined)).toBe("—");
  });
  it("minutos y horas", () => {
    expect(formatDuration(42 * 60)).toBe("42 min");
    expect(formatDuration(3600 + 5 * 60)).toBe("1 h 05 min");
  });
});

describe("formatDate", () => {
  it("entrada inválida → cadena (sin lanzar)", () => {
    expect(typeof formatDate("no-es-fecha")).toBe("string");
  });
});
