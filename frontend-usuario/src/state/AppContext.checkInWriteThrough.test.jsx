/**
 * CHECK-IN — write-through best-effort (fase D, copia sombra).
 *
 * `checkIn`/`checkOut` conservan intacto su comportamiento LocalStorage
 * (puntos, racha, `checkins[]`, `lastCheckIn`/`lastCheckOut`) y además
 * envían el check-in/check-out al backend:
 *  - solo si hay token y la operación local procede;
 *  - un segundo check-in local el mismo día NO genera POST;
 *  - un fallo del backend NO altera el estado local ni propaga excepción.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { mountApp, actAsync } from "./testHarness.jsx";
import { POINT_RULES } from "../utils/validation.js";

vi.mock("../utils/api.js", async () => {
  const actual = await vi.importActual("../utils/api.js");
  const tokensToUser = {};
  let seq = 1;
  return {
    ...actual,
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
    apiCheckIn: vi.fn(async () => ({ check_in: { id: 1, check_in_date: "2026-08-28" } })),
    apiCheckOut: vi.fn(async () => ({ check_in: { id: 1, checked_out_at: "2026-08-28T12:00:00Z" } })),
  };
});

import { apiCheckIn, apiCheckOut } from "../utils/api.js";

let harness;

afterEach(() => {
  harness?.unmount();
  harness = null;
  localStorage.clear();
  vi.clearAllMocks();
});

describe("AppContext#checkIn/checkOut — write-through backend best-effort", () => {
  it("con token: check-in escribe local (puntos +20, racha +1, checkins) Y llama a apiCheckIn(token)", async () => {
    harness = mountApp();
    await actAsync(() => harness.app.actions.registerRemote({ name: "Ana", email: "ci1@test.com", password: "x" }));
    const token = harness.app.state.auth.token;
    const pointsBefore = harness.app.state.identity.user.points;
    const streakBefore = harness.app.state.identity.user.streak;

    await actAsync(() => harness.app.actions.checkIn({ gymId: "g1" }));

    // Local intacto (comportamiento existente).
    expect(harness.app.state.identity.user.points).toBe(pointsBefore + POINT_RULES.checkin);
    expect(harness.app.state.identity.user.streak).toBe(streakBefore + 1);
    expect(harness.app.state.identity.checkins.length).toBe(1);
    expect(harness.app.state.identity.pointsLog[0].amount).toBe(POINT_RULES.checkin);

    // Backend: llamado 1 vez, solo con el token (sin cuerpo).
    expect(apiCheckIn).toHaveBeenCalledTimes(1);
    expect(apiCheckIn).toHaveBeenCalledWith(token);
  });

  it("segundo check-in el mismo día: no cambia el estado local y NO genera un segundo POST", async () => {
    harness = mountApp();
    await actAsync(() => harness.app.actions.registerRemote({ name: "Ben", email: "ci2@test.com", password: "x" }));
    await actAsync(() => harness.app.actions.checkIn({ gymId: "g1" }));

    const pointsAfterFirst = harness.app.state.identity.user.points;
    const logLen = harness.app.state.identity.pointsLog.length;
    expect(apiCheckIn).toHaveBeenCalledTimes(1);

    await actAsync(() => harness.app.actions.checkIn({ gymId: "g1" }));

    expect(harness.app.state.identity.user.points).toBe(pointsAfterFirst);
    expect(harness.app.state.identity.pointsLog.length).toBe(logLen);
    expect(apiCheckIn).toHaveBeenCalledTimes(1); // NO se repitió
  });

  it("si apiCheckIn falla, el estado local NO cambia y checkIn no lanza", async () => {
    apiCheckIn.mockRejectedValueOnce(new Error("backend caído"));
    harness = mountApp();
    await actAsync(() => harness.app.actions.registerRemote({ name: "Cae", email: "ci3@test.com", password: "x" }));
    const pointsBefore = harness.app.state.identity.user.points;

    let threw = false;
    await actAsync(async () => {
      try {
        harness.app.actions.checkIn({ gymId: "g1" });
      } catch {
        threw = true;
      }
      await Promise.resolve();
    });

    expect(threw).toBe(false);
    expect(apiCheckIn).toHaveBeenCalledTimes(1);
    expect(harness.app.state.identity.user.points).toBe(pointsBefore + POINT_RULES.checkin);
    expect(harness.app.state.identity.user.streak).toBe(1);
    expect(harness.app.state.identity.checkins.length).toBe(1);
  });

  it("sin token (anónimo): check-in NO llama al backend, la escritura local ocurre igual", async () => {
    harness = mountApp();
    expect(harness.app.state.auth.token).toBeNull();

    await actAsync(() => harness.app.actions.checkIn({ gymId: "g1" }));

    expect(apiCheckIn).not.toHaveBeenCalled();
    expect(harness.app.state.identity.user.points).toBe(POINT_RULES.checkin);
    expect(harness.app.state.identity.checkins.length).toBe(1);
  });

  it("check-out con token tras un check-in: escribe lastCheckOut local Y llama a apiCheckOut(token)", async () => {
    harness = mountApp();
    await actAsync(() => harness.app.actions.registerRemote({ name: "Dora", email: "ci4@test.com", password: "x" }));
    const token = harness.app.state.auth.token;
    await actAsync(() => harness.app.actions.checkIn({ gymId: "g1" }));

    await actAsync(() => harness.app.actions.checkOut());

    expect(harness.app.state.identity.lastCheckOut).not.toBeNull();
    expect(apiCheckOut).toHaveBeenCalledTimes(1);
    expect(apiCheckOut).toHaveBeenCalledWith(token);
  });

  it("check-out sin check-in previo: no cambia nada local y NO llama al backend", async () => {
    harness = mountApp();
    await actAsync(() => harness.app.actions.registerRemote({ name: "Eli", email: "ci5@test.com", password: "x" }));

    await actAsync(() => harness.app.actions.checkOut());

    expect(harness.app.state.identity.lastCheckOut).toBeNull();
    expect(apiCheckOut).not.toHaveBeenCalled();
  });
});
