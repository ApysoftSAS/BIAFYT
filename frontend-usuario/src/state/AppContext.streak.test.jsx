/**
 * RACHA CANÓNICA (D2 / roadmap 3a).
 *
 * La racha VISIBLE viene EXCLUSIVAMENTE de `GET /me/streak` (backend). El
 * contexto expone `streak = { current, longest, status }`. NO se mezcla con
 * `identity.user.streak` (que se conserva como hecho de sesión para puntos).
 * Sin fallback a valores locales: si el backend no responde, `status` != "ok".
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { mountApp, actAsync } from "./testHarness.jsx";

let streakResponse = { current_streak: 7, longest_streak: 21 };
let streakShouldFail = false;

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
    apiGetStreak: vi.fn(async () => {
      if (streakShouldFail) throw new actual.ApiError("boom", { status: 0 });
      return streakResponse;
    }),
  };
});

import { apiGetStreak } from "../utils/api.js";

let harness;
afterEach(() => {
  harness?.unmount();
  harness = null;
  localStorage.clear();
  vi.clearAllMocks();
  streakResponse = { current_streak: 7, longest_streak: 21 };
  streakShouldFail = false;
});

const settle = () => actAsync(async () => { await new Promise((r) => setTimeout(r, 0)); });

describe("AppContext — racha canónica desde GET /me/streak", () => {
  it("al iniciar sesión, streak = { current, longest } del backend (no del local)", async () => {
    harness = mountApp();
    await actAsync(() => harness.app.actions.registerRemote({ name: "Ana", email: "s1@test.com", password: "x" }));
    await settle();

    expect(apiGetStreak).toHaveBeenCalledWith(harness.app.state.auth.token);
    expect(harness.app.streak).toEqual({ current: 7, longest: 21, status: "ok" });
    // el `streak` local (hecho de sesión) es 0 recién registrado — NO se mezcla
    expect(harness.app.state.identity.user.streak).toBe(0);
  });

  it("anónimo (sin token): status 'idle', sin valores, sin llamada", async () => {
    harness = mountApp();
    await settle();
    expect(apiGetStreak).not.toHaveBeenCalled();
    expect(harness.app.streak).toEqual({ current: null, longest: null, status: "idle" });
  });

  it("tras un check-in, refresca la racha desde el backend", async () => {
    harness = mountApp();
    await actAsync(() => harness.app.actions.registerRemote({ name: "Ben", email: "s2@test.com", password: "x" }));
    await settle();
    expect(harness.app.streak.current).toBe(7);
    apiGetStreak.mockClear();

    streakResponse = { current_streak: 8, longest_streak: 21 };
    await actAsync(() => harness.app.actions.checkIn({ gymId: "g1" }));
    await settle();

    expect(apiGetStreak).toHaveBeenCalledTimes(1);
    expect(harness.app.streak).toEqual({ current: 8, longest: 21, status: "ok" });
  });

  it("si GET /me/streak falla: status 'error', SIN fallback al valor local", async () => {
    streakShouldFail = true;
    harness = mountApp();
    await actAsync(() => harness.app.actions.registerRemote({ name: "Cae", email: "s3@test.com", password: "x" }));
    // el local sube a 1 con el check-in, pero la racha canónica NO lo refleja
    await actAsync(() => harness.app.actions.checkIn({ gymId: "g1" }));
    await settle();

    expect(harness.app.streak.status).toBe("error");
    expect(harness.app.streak.current).toBeNull();
    expect(harness.app.state.identity.user.streak).toBe(1); // local intacto, separado
  });

  it("refreshStreak() vuelve a consultar el backend", async () => {
    harness = mountApp();
    await actAsync(() => harness.app.actions.registerRemote({ name: "Dee", email: "s4@test.com", password: "x" }));
    await settle();
    apiGetStreak.mockClear();
    streakResponse = { current_streak: 10, longest_streak: 30 };

    await actAsync(() => harness.app.actions.refreshStreak());
    await settle();

    expect(apiGetStreak).toHaveBeenCalledTimes(1);
    expect(harness.app.streak).toEqual({ current: 10, longest: 30, status: "ok" });
  });
});
