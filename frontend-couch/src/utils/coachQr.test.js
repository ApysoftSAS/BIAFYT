import { describe, expect, it } from "vitest";
import { buildAthleteQr, parseAthleteQr } from "./coachQr.js";

describe("parseAthleteQr", () => {
  it("acepta el formato canónico (case-insensitive, con o sin '/')", () => {
    expect(parseAthleteQr("BIAFYT://athlete/100")).toEqual({ athleteId: 100 });
    expect(parseAthleteQr("  BIAFYT://athlete/7/  ")).toEqual({ athleteId: 7 });
    expect(parseAthleteQr("BIAFYT://ATHLETE/12")).toEqual({ athleteId: 12 });
  });

  it("tolera un QR que es solo el número", () => {
    expect(parseAthleteQr("100")).toEqual({ athleteId: 100 });
  });

  it("rechaza lo que no identifica a un atleta", () => {
    for (const bad of [
      "",
      "   ",
      "https://example.com/athlete/100",
      "BIAFYT://coach/100",
      "BIAFYT://athlete/0",
      "BIAFYT://athlete/abc",
      "athlete/100",
      "0",
      "3.5",
      null,
      undefined,
      123,
    ]) {
      expect(parseAthleteQr(bad)).toBeNull();
    }
  });

  it("build → parse round-trip", () => {
    expect(parseAthleteQr(buildAthleteQr(583))).toEqual({ athleteId: 583 });
  });
});
