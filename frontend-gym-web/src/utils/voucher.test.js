import { describe, expect, it } from "vitest";
import { audienceCount, benefitText, claimsLabel, templatePayload, validityPayload } from "./voucher.js";

const form = { title: " Clase gratis ", type: "percent", value: "20", description: " 20% en tu mensualidad ", appliesTo: "" };

describe("voucher utils", () => {
  it("validityPayload: días, fecha exacta o nada (nunca ambos)", () => {
    expect(validityPayload("none")).toEqual({});
    expect(validityPayload("30")).toEqual({ valid_days: 30 });
    expect(validityPayload("date", "2026-12-01")).toEqual({ expires_at: "2026-12-01" });
    expect(validityPayload("date", "")).toEqual({});
  });

  it("templatePayload limpia textos y solo manda valor si el beneficio lo necesita", () => {
    expect(templatePayload(form, "7")).toMatchObject({ title: "Clase gratis", benefit_type: "percent", benefit_value: 20, applies_to: null, valid_days: 7 });
    expect(templatePayload({ ...form, type: "text" }, "none")).toMatchObject({ benefit_value: null });
  });

  it("benefitText, claimsLabel y audienceCount", () => {
    expect(benefitText({ benefit_type: "percent", benefit_value: 20 })).toBe("20% de descuento");
    expect(benefitText({ benefit_type: "text", benefit_description: "Una clase" })).toBe("Una clase");
    expect(claimsLabel({ claimed: 12, max_claims: 50 })).toBe("12 / 50");
    expect(claimsLabel({ claimed: 3, max_claims: null })).toBe("3 (sin límite)");

    const members = [{ branch: { id: 1 } }, { branch: { id: 1 } }, { branch: { id: 2 } }];
    expect(audienceCount("all", members, "", 0)).toBe(3);
    expect(audienceCount("branch", members, "1", 0)).toBe(2);
    expect(audienceCount("selected", members, "", 5)).toBe(5);
  });
});
