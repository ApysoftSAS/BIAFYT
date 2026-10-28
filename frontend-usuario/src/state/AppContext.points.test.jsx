/**
 * SALDO E HISTORIAL AUTORITATIVOS (roadmap 3c / B1-B2).
 *
 * El saldo VISIBLE y el historial de movimientos vienen EXCLUSIVAMENTE de
 * `GET /me/points` (backend). El contexto expone
 * `points = { balance, transactions, nextCursor, hasMore, status }`.
 *  - el frontend NO reconstruye el saldo sumando/restando eventos locales;
 *  - tras cada operación que mueve puntos se REVALIDA con `loadPoints`;
 *  - `identity.user.points` / `lockedPoints` son valores LEGADO: no se
 *    mezclan con `points.balance` ni lo sustituyen.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { mountApp, actAsync } from "./testHarness.jsx";

// Respuesta que "sirve" el backend para GET /me/points. Cursor simple:
// la primera llamada devuelve `page1`, y con cursor "c1" devuelve `page2`.
let page1 = { balance: 340, transactions: [{ id: 3, amount: 20, reason: "checkin", source_type: "check_in", source_id: 3, created_at: "2026-09-03T10:00:00Z" }, { id: 2, amount: 120, reason: "challenge_claimed", source_type: "challenge_claim", source_id: 2, created_at: "2026-09-02T10:00:00Z" }], next_cursor: "c1", has_more: true };
let page2 = { balance: 340, transactions: [{ id: 1, amount: 200, reason: "workout_completed", source_type: "activity", source_id: 1, created_at: "2026-09-01T10:00:00Z" }], next_cursor: null, has_more: false };
let pointsShouldFail = false;

vi.mock("../utils/api.js", async () => {
  const actual = await vi.importActual("../utils/api.js");
  const tokensToUser = {};
  let seq = 1;
  return {
    ...actual,
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
    apiGetStreak: vi.fn(async () => ({ current_streak: 0, longest_streak: 0 })),
    apiGetDuels: vi.fn(async () => ({ duels: [] })),
    apiCheckIn: vi.fn(async () => ({ check_in: { id: 1, check_in_date: "2026-09-04" } })),
    apiCreateActivity: vi.fn(async () => ({ activity: { id: 9, points_awarded: 42 } })),
    apiClaimChallenge: vi.fn(async () => ({ challenge_claim: { id: 5 } })),
    apiGetPoints: vi.fn(async (_token, opts) => {
      if (pointsShouldFail) throw new actual.ApiError("boom", { status: 0 });
      return opts?.cursor === "c1" ? page2 : page1;
    }),
  };
});

import { apiGetPoints } from "../utils/api.js";

const settle = () => actAsync(async () => { await new Promise((r) => setTimeout(r, 0)); });

let harness;
afterEach(() => {
  harness?.unmount();
  harness = null;
  localStorage.clear();
  vi.clearAllMocks();
  pointsShouldFail = false;
  page1 = { balance: 340, transactions: [{ id: 3, amount: 20, reason: "checkin", source_type: "check_in", source_id: 3, created_at: "2026-09-03T10:00:00Z" }, { id: 2, amount: 120, reason: "challenge_claimed", source_type: "challenge_claim", source_id: 2, created_at: "2026-09-02T10:00:00Z" }], next_cursor: "c1", has_more: true };
});

async function signIn(email = "p@test.com") {
  harness = mountApp();
  await actAsync(() => harness.app.actions.registerRemote({ name: "P", email, password: "x" }));
  await settle();
}

describe("AppContext — saldo autoritativo (B1)", () => {
  it("al iniciar sesión, points.balance = balance del backend", async () => {
    await signIn();
    expect(apiGetPoints).toHaveBeenCalledWith(harness.app.state.auth.token);
    expect(harness.app.points.balance).toBe(340);
    expect(harness.app.points.status).toBe("ok");
  });

  it("anónimo (sin token): status 'idle', sin llamada", async () => {
    harness = mountApp();
    await settle();
    expect(apiGetPoints).not.toHaveBeenCalled();
    expect(harness.app.points).toMatchObject({ balance: null, status: "idle" });
  });

  it("si GET /me/points falla: status 'error', sin fallback al valor local", async () => {
    pointsShouldFail = true;
    await signIn("p-err@test.com");
    await actAsync(() => harness.app.actions.addPoints(999, "local")); // valor legado local sube

    expect(harness.app.points.status).toBe("error");
    expect(harness.app.points.balance).toBeNull(); // NO cae al local
  });

  it("el frontend NO inventa el saldo: addPoints local no cambia points.balance", async () => {
    await signIn("p-noinvent@test.com");
    expect(harness.app.points.balance).toBe(340);

    await actAsync(() => harness.app.actions.addPoints(1000, "local"));
    await settle();

    expect(harness.app.points.balance).toBe(340); // solo GET /me/points lo cambia
    expect(harness.app.state.identity.user.points).toBe(1000); // el legado sí, pero no se muestra
  });

  it("tras un check-in se revalida el saldo desde el backend", async () => {
    await signIn("p-checkin@test.com");
    apiGetPoints.mockClear();
    page1 = { ...page1, balance: 360 };

    await actAsync(() => harness.app.actions.checkIn({ gymId: "g1" }));
    await settle();

    expect(apiGetPoints).toHaveBeenCalled();
    expect(harness.app.points.balance).toBe(360);
  });

  it("tras addActivity y claimChallenge se revalida el saldo", async () => {
    await signIn("p-ops@test.com");

    apiGetPoints.mockClear();
    await actAsync(() => harness.app.actions.addActivity({ routine: "X", durationSeconds: 100, sets: 3, exercises: 2, validation: "VALID", activityPoints: 42, competitivePoints: 0 }));
    await settle();
    expect(apiGetPoints).toHaveBeenCalled();

    apiGetPoints.mockClear();
    await actAsync(() => harness.app.actions.claimChallenge("2026-09-04", "c-1", 120));
    await settle();
    expect(apiGetPoints).toHaveBeenCalled();
  });

  it("refreshPoints() vuelve a consultar el backend", async () => {
    await signIn("p-refresh@test.com");
    apiGetPoints.mockClear();
    page1 = { ...page1, balance: 999 };

    await actAsync(() => harness.app.actions.refreshPoints());
    await settle();

    expect(apiGetPoints).toHaveBeenCalledTimes(1);
    expect(harness.app.points.balance).toBe(999);
  });

  it("lockedPoints (UX de duelos) no sustituye el saldo autoritativo", async () => {
    await signIn("p-locked@test.com");
    // lockPoints es un contador de frontend para apuestas de duelos pendientes.
    await actAsync(() => harness.app.actions.lockPoints(150));

    expect(harness.app.state.identity.user.lockedPoints).toBe(150);
    expect(harness.app.points.balance).toBe(340); // el saldo autoritativo no se toca
  });
});

describe("AppContext — historial autoritativo (B2)", () => {
  it("points.transactions viene de GET /me/points (no se reconstruye)", async () => {
    await signIn("h1@test.com");
    expect(harness.app.points.transactions.map((t) => t.id)).toEqual([3, 2]);
    expect(harness.app.points.hasMore).toBe(true);
    expect(harness.app.points.nextCursor).toBe("c1");
  });

  it("loadMorePoints() añade la siguiente página con el cursor de A2, sin duplicar", async () => {
    await signIn("h2@test.com");

    await actAsync(() => harness.app.actions.loadMorePoints());
    await settle();

    expect(apiGetPoints).toHaveBeenCalledWith(harness.app.state.auth.token, { cursor: "c1" });
    expect(harness.app.points.transactions.map((t) => t.id)).toEqual([3, 2, 1]);
    const ids = harness.app.points.transactions.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length); // sin repetidos
    expect(harness.app.points.hasMore).toBe(false);
    expect(harness.app.points.nextCursor).toBeNull();
  });

  it("estado vacío: transactions [] sin más páginas", async () => {
    page1 = { balance: 0, transactions: [], next_cursor: null, has_more: false };
    await signIn("h3@test.com");

    expect(harness.app.points.transactions).toEqual([]);
    expect(harness.app.points.hasMore).toBe(false);
    expect(harness.app.points.status).toBe("ok");
  });

  it("un retry idempotente (A1) no duplica movimientos: la lista viene del backend", async () => {
    await signIn("h4@test.com");
    // El backend dedupe (A1). El frontend solo re-lee: la 2ª carga trae la
    // MISMA página, sin añadir filas nuevas.
    apiGetPoints.mockClear();
    await actAsync(() => harness.app.actions.refreshPoints());
    await settle();

    expect(harness.app.points.transactions.map((t) => t.id)).toEqual([3, 2]); // no [3,2,3,2]
  });
});
