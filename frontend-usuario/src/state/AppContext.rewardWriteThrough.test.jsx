/**
 * PREMIOS — write-through best-effort (fase Rewards, copia sombra) + B1.
 *
 * `claimPrize`:
 *  - hace el GATE de "¿alcanza el saldo?" contra el saldo AUTORITATIVO del
 *    backend (`points.balance` de `GET /me/points`) — B1. Sin `points`
 *    cargado (anónimo / error) el canje NO procede.
 *  - conserva el débito LEGADO en `identity.user.points` (ya no se muestra,
 *    se mantiene para la copia sombra y estos tests).
 *  - envía el canje al backend (solo prizeId + rewardUid, nunca el cost);
 *  - tras el POST revalida el saldo con `loadPoints` (no lo adivina).
 *  - un fallo del backend no altera el canje local ni propaga excepción.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { mountApp, actAsync } from "./testHarness.jsx";

let backendBalance = 1000;

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
    apiGetPoints: vi.fn(async () => ({ balance: backendBalance, transactions: [], next_cursor: null, has_more: false })),
    apiClaimReward: vi.fn(async () => ({ reward_claim: { id: 1, prize_id: "pz-clase-gratis", cost: 600 } })),
  };
});

import { apiClaimReward, apiGetPoints } from "../utils/api.js";

const PRIZE = { id: "pz-clase-gratis", title: "Clase gratis", kind: "Beneficio", cost: 600, transferable: true };
const settle = () => actAsync(async () => { await new Promise((r) => setTimeout(r, 0)); });

let harness;

afterEach(() => {
  harness?.unmount();
  harness = null;
  localStorage.clear();
  vi.clearAllMocks();
  backendBalance = 1000;
});

describe("AppContext#claimPrize — gate backend + write-through best-effort", () => {
  it("con saldo backend suficiente: canjea, débito legado local, y llama a apiClaimReward(token, prizeId, uid) sin el cost", async () => {
    backendBalance = 1000;
    harness = mountApp();
    await actAsync(() => harness.app.actions.registerRemote({ name: "Ana", email: "rw1@test.com", password: "x" }));
    await settle();
    const token = harness.app.state.auth.token;
    await actAsync(() => harness.app.actions.addPoints(1000, "seed")); // valor legado
    const pointsBefore = harness.app.state.identity.user.points;

    await actAsync(() => harness.app.actions.claimPrize(PRIZE));

    expect(harness.app.state.identity.user.points).toBe(pointsBefore - 600); // débito legado
    expect(harness.app.state.identity.rewards).toHaveLength(1);
    const createdUid = harness.app.state.identity.rewards[0].uid;
    expect(createdUid).toMatch(/^r-/);

    expect(apiClaimReward).toHaveBeenCalledTimes(1);
    expect(apiClaimReward).toHaveBeenCalledWith(token, "pz-clase-gratis", createdUid);
    expect(apiClaimReward.mock.calls[0]).not.toContain(600);
  });

  it("tras un canje exitoso se revalida el saldo desde el backend (no se adivina)", async () => {
    backendBalance = 1000;
    harness = mountApp();
    await actAsync(() => harness.app.actions.registerRemote({ name: "Rev", email: "rw-rev@test.com", password: "x" }));
    await settle();
    apiGetPoints.mockClear();

    backendBalance = 400; // el backend ya debitó el premio
    await actAsync(() => harness.app.actions.claimPrize(PRIZE));
    await settle();

    expect(apiGetPoints).toHaveBeenCalled();
    expect(harness.app.points.balance).toBe(400); // del backend, no 1000-600 local
  });

  it("saldo backend insuficiente: no canjea y NO llama al backend", async () => {
    backendBalance = 0;
    harness = mountApp();
    await actAsync(() => harness.app.actions.registerRemote({ name: "Ben", email: "rw2@test.com", password: "x" }));
    await settle();
    await actAsync(() => harness.app.actions.addPoints(5000, "seed")); // saldo local alto: NO debe alcanzar

    await actAsync(() => harness.app.actions.claimPrize(PRIZE));

    expect(harness.app.state.identity.rewards).toHaveLength(0);
    expect(apiClaimReward).not.toHaveBeenCalled();
  });

  it("dos canjes del mismo prize generan dos POST con uid distinto", async () => {
    backendBalance = 2000;
    harness = mountApp();
    await actAsync(() => harness.app.actions.registerRemote({ name: "Cyd", email: "rw3@test.com", password: "x" }));
    await settle();
    await actAsync(() => harness.app.actions.addPoints(2000, "seed"));

    await actAsync(() => harness.app.actions.claimPrize(PRIZE));
    await actAsync(() => harness.app.actions.claimPrize(PRIZE));

    expect(apiClaimReward).toHaveBeenCalledTimes(2);
    expect(apiClaimReward.mock.calls[0][2]).not.toBe(apiClaimReward.mock.calls[1][2]);
    expect(harness.app.state.identity.rewards).toHaveLength(2);
  });

  it("si apiClaimReward falla, el canje local ya concedido NO se revierte y claimPrize no lanza", async () => {
    backendBalance = 1000;
    apiClaimReward.mockRejectedValueOnce(new Error("422 backend"));
    harness = mountApp();
    await actAsync(() => harness.app.actions.registerRemote({ name: "Dux", email: "rw4@test.com", password: "x" }));
    await settle();
    await actAsync(() => harness.app.actions.addPoints(1000, "seed"));
    const pointsBefore = harness.app.state.identity.user.points;

    let threw = false;
    await actAsync(async () => {
      try {
        harness.app.actions.claimPrize(PRIZE);
      } catch {
        threw = true;
      }
      await Promise.resolve();
    });

    expect(threw).toBe(false);
    expect(apiClaimReward).toHaveBeenCalledTimes(1);
    expect(harness.app.state.identity.user.points).toBe(pointsBefore - 600);
    expect(harness.app.state.identity.rewards).toHaveLength(1);
  });

  it("sin sesión (anónimo): sin saldo autoritativo, el canje NO procede", async () => {
    harness = mountApp();
    expect(harness.app.state.auth.token).toBeNull();
    await actAsync(() => harness.app.actions.addPoints(5000, "seed")); // saldo local: irrelevante

    await actAsync(() => harness.app.actions.claimPrize(PRIZE));

    expect(apiClaimReward).not.toHaveBeenCalled();
    expect(harness.app.state.identity.rewards).toHaveLength(0);
    expect(harness.app.points.status).toBe("idle");
  });
});
