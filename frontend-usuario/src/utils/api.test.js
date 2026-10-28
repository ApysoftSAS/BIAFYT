/**
 * ACTIVITY + POINTS — build del payload write-through (fase A, copia sombra).
 * `buildActivityPayload` es puro: traduce el objeto de actividad del frontend
 * al contrato de `POST /me/activities` sin enviar nunca points/amount/user_id.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildActivityPayload,
  apiCreateGymRegistrationRequest,
  apiGetCoachRelationships,
  apiAcceptCoachRelationship,
  apiRevokeCoachRelationship,
} from "./api.js";

const NOW = new Date("2026-08-28T11:05:00.000Z");

describe("buildActivityPayload", () => {
  it("mapea los campos del frontend al contrato backend", () => {
    const payload = buildActivityPayload(
      { routine: "Hipertrofia", durationSeconds: 3600, sets: 18, exercises: 6, validation: "VALID", activityPoints: 999 },
      NOW
    );

    expect(payload).toEqual({
      workout_id: null,
      routine_label: "Hipertrofia",
      duration_seconds: 3600,
      sets_completed: 18,
      exercises_completed: 6,
      streak: 0,
      started_at: "2026-08-28T10:05:00.000Z", // finished_at - 3600s
      finished_at: "2026-08-28T11:05:00.000Z",
    });
  });

  it("envía streak como hecho de sesión (paridad con computeWorkoutPoints)", () => {
    const payload = buildActivityPayload({ routine: "X", durationSeconds: 60, sets: 1, exercises: 1 }, NOW, 5);
    expect(payload.streak).toBe(5);
  });

  it("clampa streak negativo o inválido a 0", () => {
    const payload = buildActivityPayload({ routine: "X", durationSeconds: 60, sets: 1, exercises: 1 }, NOW, -3);
    expect(payload.streak).toBe(0);
  });

  it("started_at = finished_at - durationSeconds exacto", () => {
    const payload = buildActivityPayload({ routine: "X", durationSeconds: 90, sets: 1, exercises: 1 }, NOW);
    const delta = (new Date(payload.finished_at).getTime() - new Date(payload.started_at).getTime()) / 1000;
    expect(delta).toBe(90);
  });

  it("redondea durationSeconds float a entero (el backend exige integer)", () => {
    const payload = buildActivityPayload({ routine: "X", durationSeconds: 125.7, sets: 3, exercises: 2 }, NOW);
    expect(payload.duration_seconds).toBe(126);
    expect(Number.isInteger(payload.duration_seconds)).toBe(true);
  });

  it("clampa conteos negativos o inválidos a 0", () => {
    const payload = buildActivityPayload({ routine: "X", durationSeconds: -5, sets: -3, exercises: NaN }, NOW);
    expect(payload.duration_seconds).toBe(0);
    expect(payload.sets_completed).toBe(0);
    expect(payload.exercises_completed).toBe(0);
  });

  it("routine ausente → routine_label null; workout_id siempre null", () => {
    const payload = buildActivityPayload({ durationSeconds: 60, sets: 1, exercises: 1 }, NOW);
    expect(payload.routine_label).toBeNull();
    expect(payload.workout_id).toBeNull();
  });

  it("nunca incluye points/amount/user_id/activityPoints/competitivePoints/duelId", () => {
    const payload = buildActivityPayload(
      { routine: "X", durationSeconds: 60, sets: 1, exercises: 1, activityPoints: 42, competitivePoints: 42, duelId: "d-1" },
      NOW
    );
    for (const forbidden of ["points", "amount", "user_id", "activityPoints", "competitivePoints", "competitive_points", "duelId", "points_awarded"]) {
      expect(payload).not.toHaveProperty(forbidden);
    }
  });
});

describe("apiCreateGymRegistrationRequest", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("mapea gymName/branchName/applicantMessage al contrato backend, nunca status/user_id/gym_id", async () => {
    let sent;
    vi.stubGlobal("fetch", vi.fn(async (_url, opts) => {
      sent = JSON.parse(opts.body);
      return { ok: true, json: async () => ({ gym_registration_request: {} }) };
    }));

    await apiCreateGymRegistrationRequest("tok", { gymName: "KAIROS GYM", branchName: "Norte", applicantMessage: "Hola" });

    expect(sent).toEqual({ gym_name: "KAIROS GYM", branch_name: "Norte", applicant_message: "Hola" });
    for (const forbidden of ["status", "user_id", "gym_id", "role", "reviewed_by_user_id"]) {
      expect(sent).not.toHaveProperty(forbidden);
    }
  });

  it("mensaje vacío → applicant_message null", async () => {
    let sent;
    vi.stubGlobal("fetch", vi.fn(async (_url, opts) => {
      sent = JSON.parse(opts.body);
      return { ok: true, json: async () => ({}) };
    }));

    await apiCreateGymRegistrationRequest("tok", { gymName: "G", branchName: "B", applicantMessage: "" });
    expect(sent.applicant_message).toBeNull();
  });
});

describe("coach-relationship (lado atleta)", () => {
  afterEach(() => vi.unstubAllGlobals());

  const captureFetch = () => {
    const calls = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url, opts = {}) => {
        calls.push({ url: String(url), method: opts.method ?? "GET", auth: opts.headers?.Authorization });
        return { ok: true, json: async () => ({ coach_relationships: [] }) };
      })
    );
    return calls;
  };

  it("apiGetCoachRelationships → GET /me/coach-relationships con Bearer", async () => {
    const calls = captureFetch();
    await apiGetCoachRelationships("tok");
    expect(calls[0].method).toBe("GET");
    expect(calls[0].url).toMatch(/\/me\/coach-relationships$/);
    expect(calls[0].auth).toBe("Bearer tok");
  });

  it("apiAcceptCoachRelationship → POST /me/coach-relationships/{id}/accept", async () => {
    const calls = captureFetch();
    await apiAcceptCoachRelationship("tok", 42);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toMatch(/\/me\/coach-relationships\/42\/accept$/);
  });

  it("apiRevokeCoachRelationship → DELETE /me/coach-relationships/{id}", async () => {
    const calls = captureFetch();
    await apiRevokeCoachRelationship("tok", 7);
    expect(calls[0].method).toBe("DELETE");
    expect(calls[0].url).toMatch(/\/me\/coach-relationships\/7$/);
  });
});
