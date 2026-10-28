import { describe, expect, it } from "vitest";
import { statusLabel, countByStatus, formatDate, benefitTypeLabel } from "./admin.js";

describe("statusLabel", () => {
  it("mapea los tres estados", () => {
    expect(statusLabel("pending").tone).toBe("warning");
    expect(statusLabel("approved").tone).toBe("success");
    expect(statusLabel("rejected").tone).toBe("error");
  });
  it("estado desconocido → default", () => {
    expect(statusLabel("otro")).toEqual({ text: "otro", tone: "default" });
    expect(statusLabel(undefined).tone).toBe("default");
  });
});

describe("countByStatus", () => {
  it("cuenta por estado, tolera entradas nulas", () => {
    const rows = [{ status: "pending" }, { status: "pending" }, { status: "approved" }, null, { status: "rejected" }];
    expect(countByStatus(rows)).toEqual({ pending: 2, approved: 1, rejected: 1 });
  });
  it("entrada vacía", () => {
    expect(countByStatus()).toEqual({ pending: 0, approved: 0, rejected: 0 });
  });
});

describe("formatDate", () => {
  it("entrada inválida / vacía → cadena sin lanzar", () => {
    expect(formatDate("")).toBe("");
    expect(typeof formatDate("no-es-fecha")).toBe("string");
  });
});

describe("benefitTypeLabel", () => {
  it("mapea los tres tipos", () => {
    expect(benefitTypeLabel("percent")).toBe("Porcentaje");
    expect(benefitTypeLabel("fixed")).toBe("Monto fijo");
    expect(benefitTypeLabel("text")).toBe("Texto libre");
  });
  it("tipo desconocido → el valor tal cual, vacío → guion", () => {
    expect(benefitTypeLabel("otro")).toBe("otro");
    expect(benefitTypeLabel(undefined)).toBe("—");
  });
});
