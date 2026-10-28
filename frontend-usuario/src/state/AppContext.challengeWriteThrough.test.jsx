/**
 * RETOS DIARIOS — write-through best-effort (fase Challenges, copia sombra).
 *
 * `claimChallenge` conserva EXACTAMENTE su escritura LocalStorage (suma el
 * `reward` a `user.points`, marca `challengeProgress[dayKey].claimed`) y
 * además envía el claim al backend:
 *  - solo si hay token y el claim local ocurrió;
 *  - el cliente envía SOLO { challenge_id, challenge_date } — nunca el reward;
 *  - un 2º claim local del mismo reto NO genera POST;
 *  - un fallo del backend NO altera el estado local ni propaga excepción.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { mountApp, actAsync } from "./testHarness.jsx";

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
    apiClaimChallenge: vi.fn(async () => ({ challenge_claim: { id: 1, challenge_id: "dc-sets", challenge_date: "2026-08-28" } })),
  };
});

import { apiClaimChallenge } from "../utils/api.js";

const DAY = "2026-08-28";
let harness;

afterEach(() => {
  harness?.unmount();
  harness = null;
  localStorage.clear();
  vi.clearAllMocks();
});

describe("AppContext#claimChallenge — write-through backend best-effort", () => {
  it("con token: suma el reward local Y llama a apiClaimChallenge(token, challengeId, dayKey) sin enviar el reward", async () => {
    harness = mountApp();
    await actAsync(() => harness.app.actions.registerRemote({ name: "Ana", email: "ch1@test.com", password: "x" }));
    const token = harness.app.state.auth.token;
    const pointsBefore = harness.app.state.identity.user.points;

    await actAsync(() => harness.app.actions.claimChallenge(DAY, "dc-sets", 60));

    // Local intacto (comportamiento existente).
    expect(harness.app.state.identity.user.points).toBe(pointsBefore + 60);
    expect(harness.app.state.identity.challengeProgress[DAY].claimed).toContain("dc-sets");

    // Backend: 1 llamada, args = (token, challengeId, dayKey). El reward NO viaja.
    expect(apiClaimChallenge).toHaveBeenCalledTimes(1);
    expect(apiClaimChallenge).toHaveBeenCalledWith(token, "dc-sets", DAY);
    const args = apiClaimChallenge.mock.calls[0];
    expect(args).not.toContain(60);
  });

  it("segundo claim del mismo reto: no cambia el estado local y NO genera un segundo POST", async () => {
    harness = mountApp();
    await actAsync(() => harness.app.actions.registerRemote({ name: "Ben", email: "ch2@test.com", password: "x" }));
    await actAsync(() => harness.app.actions.claimChallenge(DAY, "dc-sets", 60));
    const pointsAfterFirst = harness.app.state.identity.user.points;
    expect(apiClaimChallenge).toHaveBeenCalledTimes(1);

    await actAsync(() => harness.app.actions.claimChallenge(DAY, "dc-sets", 60));

    expect(harness.app.state.identity.user.points).toBe(pointsAfterFirst);
    expect(apiClaimChallenge).toHaveBeenCalledTimes(1); // no se repitió
  });

  it("retos distintos del mismo día generan un POST cada uno", async () => {
    harness = mountApp();
    await actAsync(() => harness.app.actions.registerRemote({ name: "Cyd", email: "ch3@test.com", password: "x" }));

    await actAsync(() => harness.app.actions.claimChallenge(DAY, "dc-sets", 60));
    await actAsync(() => harness.app.actions.claimChallenge(DAY, "dc-duration", 70));

    expect(apiClaimChallenge).toHaveBeenCalledTimes(2);
    expect(harness.app.state.identity.challengeProgress[DAY].claimed).toEqual(["dc-sets", "dc-duration"]);
  });

  it("si apiClaimChallenge falla, el estado local NO cambia y claimChallenge no lanza", async () => {
    apiClaimChallenge.mockRejectedValueOnce(new Error("backend caído"));
    harness = mountApp();
    await actAsync(() => harness.app.actions.registerRemote({ name: "Dux", email: "ch4@test.com", password: "x" }));
    const pointsBefore = harness.app.state.identity.user.points;

    let threw = false;
    await actAsync(async () => {
      try {
        harness.app.actions.claimChallenge(DAY, "dc-sets", 60);
      } catch {
        threw = true;
      }
      await Promise.resolve();
    });

    expect(threw).toBe(false);
    expect(apiClaimChallenge).toHaveBeenCalledTimes(1);
    expect(harness.app.state.identity.user.points).toBe(pointsBefore + 60);
    expect(harness.app.state.identity.challengeProgress[DAY].claimed).toContain("dc-sets");
  });

  it("sin token (anónimo): NO llama al backend, la suma local ocurre igual", async () => {
    harness = mountApp();
    expect(harness.app.state.auth.token).toBeNull();
    const pointsBefore = harness.app.state.identity.user.points;

    await actAsync(() => harness.app.actions.claimChallenge(DAY, "dc-sets", 60));

    expect(apiClaimChallenge).not.toHaveBeenCalled();
    expect(harness.app.state.identity.user.points).toBe(pointsBefore + 60);
    expect(harness.app.state.identity.challengeProgress[DAY].claimed).toContain("dc-sets");
  });
});
