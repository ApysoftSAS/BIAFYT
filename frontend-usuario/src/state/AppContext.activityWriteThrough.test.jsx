/**
 * ACTIVITY + POINTS — write-through best-effort (fase A, copia sombra).
 *
 * `addActivity` conserva intacta su escritura en LocalStorage y, además,
 * envía la actividad a `POST /me/activities` (backend = auditoría). Reglas:
 *  - si hay token: se llama a `apiCreateActivity` con el payload de
 *    `buildActivityPayload` (real, no mockeado);
 *  - un fallo del POST NO altera el estado local ni propaga excepción;
 *  - sin token (anónimo): no se llama al backend, la escritura local ocurre igual.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { mountApp, actAsync } from "./testHarness.jsx";

vi.mock("../utils/api.js", async () => {
  const actual = await vi.importActual("../utils/api.js");
  const tokensToUser = {};
  let seq = 1;
  return {
    ...actual, // buildActivityPayload real
    apiGetPoints: vi.fn(async () => ({ balance: 0, transactions: [], next_cursor: null, has_more: false })),
    apiRegister: vi.fn(async ({ name, email }) => {
      const user = { id: `u-${email}`, name, email };
      const token = `token-${seq++}`;
      tokensToUser[token] = user;
      return { user, token };
    }),
    apiMe: vi.fn(async (token) => {
      const user = tokensToUser[token];
      if (!user) throw new actual.ApiError("No autenticado.", { status: 401 });
      return { user };
    }),
    apiCreateActivity: vi.fn(async () => ({ activity: { id: 1, points_awarded: 42 } })),
    apiCheckIn: vi.fn(async () => ({ check_in: { id: 1, check_in_date: "2026-08-28" } })),
  };
});

import { apiCreateActivity } from "../utils/api.js";

let harness;

afterEach(() => {
  harness?.unmount();
  harness = null;
  localStorage.clear();
  vi.clearAllMocks();
});

const ACTIVITY = { routine: "Hipertrofia", durationSeconds: 3600, sets: 18, exercises: 6, validation: "VALID", activityPoints: 999, competitivePoints: 0, duelId: null };

describe("AppContext#addActivity — write-through backend best-effort", () => {
  it("con token: escribe local Y envía POST /me/activities con el payload correcto", async () => {
    harness = mountApp();
    await actAsync(() => harness.app.actions.registerRemote({ name: "Ana", email: "wt1@test.com", password: "x" }));
    const token = harness.app.state.auth.token;

    await actAsync(() => harness.app.actions.addActivity(ACTIVITY));

    // Local intacto.
    expect(harness.app.state.identity.activities.length).toBe(1);
    expect(harness.app.state.identity.activities[0].routine).toBe("Hipertrofia");

    // Backend: llamado 1 vez, con token + payload de contrato (sin points/amount/user_id).
    expect(apiCreateActivity).toHaveBeenCalledTimes(1);
    const [sentToken, payload] = apiCreateActivity.mock.calls[0];
    expect(sentToken).toBe(token);
    expect(payload).toMatchObject({
      workout_id: null,
      routine_label: "Hipertrofia",
      duration_seconds: 3600,
      sets_completed: 18,
      exercises_completed: 6,
      streak: harness.app.state.identity.user.streak,
    });
    expect(payload.started_at).toBeDefined();
    expect(payload.finished_at).toBeDefined();
    expect((new Date(payload.finished_at) - new Date(payload.started_at)) / 1000).toBe(3600);
    for (const k of ["points", "amount", "user_id", "activityPoints", "competitivePoints", "duelId"]) {
      expect(payload).not.toHaveProperty(k);
    }
  });

  it("las actividades de duelo también se envían (duelId presente en local, ausente en el payload)", async () => {
    harness = mountApp();
    await actAsync(() => harness.app.actions.registerRemote({ name: "Ben", email: "wt2@test.com", password: "x" }));

    await actAsync(() => harness.app.actions.addActivity({ ...ACTIVITY, duelId: "d-99" }));

    expect(harness.app.state.identity.activities[0].duelId).toBe("d-99");
    expect(apiCreateActivity).toHaveBeenCalledTimes(1);
    expect(apiCreateActivity.mock.calls[0][1]).not.toHaveProperty("duelId");
  });

  it("si el POST falla, el estado local NO cambia y addActivity no lanza", async () => {
    apiCreateActivity.mockRejectedValueOnce(new Error("backend caído"));
    harness = mountApp();
    await actAsync(() => harness.app.actions.registerRemote({ name: "Cae", email: "wt3@test.com", password: "x" }));

    let threw = false;
    await actAsync(async () => {
      try {
        harness.app.actions.addActivity(ACTIVITY);
      } catch {
        threw = true;
      }
      await Promise.resolve(); // deja settlear la promesa rechazada (ya .catch()-eada)
    });

    expect(threw).toBe(false);
    expect(apiCreateActivity).toHaveBeenCalledTimes(1);
    // Local exactamente como si el backend no existiera.
    expect(harness.app.state.identity.activities.length).toBe(1);
    expect(harness.app.state.identity.activities[0].routine).toBe("Hipertrofia");
    expect(harness.app.state.identity.activities[0].activityPoints).toBe(999);
  });

  it("envía la racha local actual (no 0) en el payload cuando el usuario ya tiene racha", async () => {
    harness = mountApp();
    await actAsync(() => harness.app.actions.registerRemote({ name: "Rac", email: "wt4@test.com", password: "x" }));
    await actAsync(() => harness.app.actions.checkIn({ gymId: "g1" })); // racha -> 1

    await actAsync(() => harness.app.actions.addActivity(ACTIVITY));

    expect(harness.app.state.identity.user.streak).toBe(1);
    const payload = apiCreateActivity.mock.calls.at(-1)[1];
    expect(payload.streak).toBe(1);
  });

  it("sin token (anónimo, antes de login): NO llama al backend, la escritura local ocurre igual", async () => {
    harness = mountApp();
    expect(harness.app.state.auth.token).toBeNull();

    await actAsync(() => harness.app.actions.addActivity(ACTIVITY));

    expect(apiCreateActivity).not.toHaveBeenCalled();
    expect(harness.app.state.identity.activities.length).toBe(1);
  });
});
