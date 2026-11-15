import { describe, expect, it } from "vitest";
import { benefitText, claimErrorMessage, issuerName, validUntil } from "./vouchers.js";

describe("vouchers utils", () => {
  it("benefitText e issuerName", () => {
    expect(benefitText({ benefit_type: "percent", benefit_value: 30 })).toBe("30% de descuento");
    expect(benefitText({ benefit_type: "fixed", benefit_value: 5000 })).toBe("Descuento de 5000");
    expect(benefitText({ benefit_type: "text", benefit_description: "Una clase" })).toBe("Una clase");
    expect(issuerName({ gym: { name: "KAIROS" } })).toBe("KAIROS");
    expect(issuerName({ coach: { name: "Carlos" } })).toBe("Carlos");
    expect(issuerName({})).toBe("BIAFYT");
  });

  it("validUntil formatea la fecha sin puntos", () => {
    expect(validUntil("2026-11-20T18:00:00Z")).toMatch(/20.*nov.*2026/);
    expect(validUntil("2026-11-20T18:00:00Z")).not.toContain(".");
  });

  it("claimErrorMessage traduce los errores conocidos y degrada con gracia", () => {
    const err = (m) => ({ errors: { code: [m] } });
    expect(claimErrorMessage(err("You already claimed this code."))).toBe("Ya canjeaste este código.");
    expect(claimErrorMessage(err("This code has no claims left."))).toContain("cupos");
    expect(claimErrorMessage(err("This code has expired."))).toContain("venció");
    expect(claimErrorMessage(err("This code is not valid for you."))).toContain("no es válido");
    expect(claimErrorMessage({ status: 429 })).toContain("Demasiados intentos");
    expect(claimErrorMessage({ status: 0 })).toContain("conectar");
    expect(claimErrorMessage({})).toBe("No se pudo canjear el código.");
  });
});
