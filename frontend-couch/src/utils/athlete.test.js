import { describe, expect, it } from "vitest";
import { profileRows, formatDuration } from "./athlete.js";

describe("profileRows", () => {
  it("devuelve [] si el perfil es null", () => {
    expect(profileRows(null)).toEqual([]);
  });

  it("devuelve [] si todos los campos están vacíos", () => {
    expect(profileRows({ level: null, focus_id: null, age: null })).toEqual([]);
  });

  it("omite solo los campos null/undefined y formatea el resto con su sufijo", () => {
    const rows = profileRows({
      level: "intermedio",
      focus_id: "fuerza",
      age: 30,
      weight: null,
      height: 168,
      months_training: 0,
    });
    expect(rows).toEqual([
      { label: "Nivel", value: "intermedio" },
      { label: "Enfoque", value: "fuerza" },
      { label: "Edad", value: "30 años" },
      { label: "Altura", value: "168 cm" },
      // 0 es un dato real (principiante), no un campo vacío.
      { label: "Meses entrenando", value: "0" },
    ]);
  });
});

describe("formatDuration", () => {
  it("marca cero / inválido como —", () => {
    expect(formatDuration(0)).toBe("—");
    expect(formatDuration(undefined)).toBe("—");
  });

  it("formatea minutos y horas", () => {
    expect(formatDuration(42 * 60)).toBe("42 min");
    expect(formatDuration(3600 + 5 * 60)).toBe("1 h 05 min");
  });
});
