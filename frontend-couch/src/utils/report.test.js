import { describe, expect, it } from "vitest";
import { dayLabel, heatLevel, hourLabel, hourRange, minutesLabel, niceMax, percent, shortDate } from "./report.js";

describe("report utils", () => {
  it("niceMax da un techo redondo y nunca menor a 4", () => {
    expect(niceMax(0)).toBe(4);
    expect(niceMax(1)).toBe(4);
    expect(niceMax(6)).toBe(10);
    expect(niceMax(12)).toBe(20);
    expect(niceMax(37)).toBe(50);
    expect(niceMax(100)).toBe(100);
    expect(niceMax(101)).toBe(200);
  });

  it("hourRange recorta a las horas con datos ±1 y garantiza 6 columnas", () => {
    const empty = Array.from({ length: 7 }, () => Array(24).fill(0));
    expect(hourRange(empty)).toEqual([6, 22]);

    const m = Array.from({ length: 7 }, () => Array(24).fill(0));
    m[0][7] = 3;
    m[2][18] = 1;
    expect(hourRange(m)).toEqual([6, 19]);

    const narrow = Array.from({ length: 7 }, () => Array(24).fill(0));
    narrow[1][12] = 2;
    const [lo, hi] = hourRange(narrow);
    expect(hi - lo).toBeGreaterThanOrEqual(5);
    expect(lo).toBeLessThanOrEqual(11);
    expect(hi).toBeGreaterThanOrEqual(13);
  });

  it("heatLevel: 0 sin datos, 1..5 por intensidad", () => {
    expect(heatLevel(0, 10)).toBe(0);
    expect(heatLevel(1, 100)).toBe(1);
    expect(heatLevel(10, 10)).toBe(5);
    expect(heatLevel(5, 10)).toBe(3);
  });

  it("formatos", () => {
    expect(hourLabel(7)).toBe("07:00");
    expect(percent(1, 4)).toBe(25);
    expect(percent(1, 0)).toBe(0);
    expect(minutesLabel(null)).toBe("—");
    expect(minutesLabel(45)).toBe("45 min");
    expect(minutesLabel(75)).toBe("1 h 15 min");
    expect(minutesLabel(120)).toBe("2 h");
    expect(shortDate("2026-11-18")).toContain("18");
    // Sin desfase de zona: el 8 sigue siendo 8 aunque la zona sea UTC−5.
    expect(dayLabel("2026-10-08")).toMatch(/^8 oct/);
    expect(dayLabel("2026-08-22")).toMatch(/^22 ago/);
  });
});

import { csvCell, reportToCsv } from "./report.js";

describe("exportación CSV", () => {
  it("csvCell escapa separadores/comillas y neutraliza fórmulas", () => {
    expect(csvCell("Ana")).toBe("Ana");
    expect(csvCell("a;b")).toBe('"a;b"');
    expect(csvCell('di "hola"')).toBe('"di ""hola"""');
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvCell("-5")).toBe("-5"); // un número negativo no es una fórmula
    expect(csvCell(null)).toBe("");
    expect(csvCell(0)).toBe("0");
  });

  it("reportToCsv arma las secciones con coma decimal y sin romper filas", () => {
    const heat = Array.from({ length: 7 }, () => Array(24).fill(0));
    const csv = reportToCsv(
      {
        period: { days: 30, from: "2026-10-17", to: "2026-11-15", timezone: "America/Bogota" },
        branch_id: null,
        totals: { members: 2, new_members: 0, active_members: 1, inactive_members: 1, check_ins: 3, check_ins_today: 1, inside_now_estimate: 0, visits_per_active_member: 1.5, avg_stay_minutes: 75, workouts: 2, avg_workout_minutes: 50 },
        by_hour: Array(24).fill(0),
        by_weekday_hour: heat,
        by_day: [{ date: "2026-11-15", check_ins: 3 }],
        by_branch: [{ id: 1, name: "Norte", members: 2, check_ins: 3, active_members: 1 }],
        inactive_members: [{ user: { id: 9, name: "=Pedro" }, branch: { id: 1, name: "Norte" }, last_check_in_date: null, days_since: null, member_since: "2026-08-22" }],
      },
      "KAIROS"
    );
    expect(csv).toContain("Reporte de asistencia;KAIROS");
    expect(csv).toContain("Visitas por miembro activo;1,5");
    expect(csv).toContain("Sede;Todas");
    expect(csv).toContain("'=Pedro;Norte;Nunca");
    expect(csv.split("\r\n").find((l) => l.startsWith("Lun;"))?.split(";")).toHaveLength(25);
  });
});
