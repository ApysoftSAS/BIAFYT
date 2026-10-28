/**
 * DUELOS REALES (roadmap 3b).
 *
 * El ESTADO del duelo lo lleva el backend (`GET /me/duels`); LocalStorage
 * solo concilia la APUESTA visible de puntos. Estos tests fijan:
 *  - crear/aceptar BLOQUEA `stake` puntos (points -stake, lockedPoints +stake);
 *  - cuando el backend marca el duelo terminal, `reconcileDuels` libera el
 *    bloqueo UNA sola vez: gano → +stake neto, pierdo → -stake neto,
 *    empate / no validado / rechazo / cancelación → devolución íntegra;
 *  - `identity.user.duels.{wins,losses}` se actualiza solo con resultados
 *    decisivos.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { mountApp, actAsync } from "./testHarness.jsx";

// --- backend simulado de duelos -----------------------------------
let duelsDb = [];
let seq = 100;
// Cómo resuelve el backend el próximo duelo con 2 ejecuciones.
let resolveAs = "challenger"; // challenger | opponent | draw | unvalidated

const tokensToUser = {};

function shape(d, uid) {
  const role = d.challenger.id === uid ? "challenger" : "opponent";
  const otherId = role === "challenger" ? d.opponent.id : d.challenger.id;
  return {
    id: d.id,
    status: d.status,
    viewer_role: role,
    modality: d.modality,
    stake: d.stake,
    challenger: d.challenger,
    opponent: d.opponent,
    winner_user_id: d.winner_user_id,
    outcome: d.outcome,
    result: d.result,
    you_submitted: d.runs.includes(uid),
    opponent_submitted: d.runs.includes(otherId),
    your_run: null,
    their_run: null,
  };
}

function maybeResolve(d) {
  if (d.runs.length < 2 || d.status !== "in_progress") return;
  if (resolveAs === "unvalidated") {
    d.status = "unvalidated";
    d.winner_user_id = null;
    d.outcome = null;
    return;
  }
  d.status = "finished";
  if (resolveAs === "draw") {
    d.winner_user_id = null;
    d.outcome = "draw";
  } else {
    d.winner_user_id = resolveAs === "challenger" ? d.challenger.id : d.opponent.id;
    d.outcome = resolveAs;
  }
  d.result = {
    modality: d.modality,
    challenger: { total: 80, breakdown: { Tiempo: 80 } },
    opponent: { total: 60, breakdown: { Tiempo: 60 } },
    winner: d.outcome,
  };
}

vi.mock("../utils/api.js", async () => {
  const actual = await vi.importActual("../utils/api.js");
  let s = 1;
  return {
    ...actual,
    apiGetPoints: vi.fn(async () => ({ balance: 0, transactions: [], next_cursor: null, has_more: false })),
    apiRegister: vi.fn(async ({ name, email }) => {
      const user = { id: `u-${email}`, name, email };
      const token = `token-${s++}`;
      tokensToUser[token] = user;
      return { user, token };
    }),
    apiMe: vi.fn(async (token) => {
      const user = tokensToUser[token];
      if (!user) throw new actual.ApiError("No autenticado.", { status: 401 });
      return { user };
    }),
    apiGetStreak: vi.fn(async () => ({ current_streak: 0, longest_streak: 0 })),
    apiGetDuels: vi.fn(async (token) => {
      const uid = tokensToUser[token]?.id;
      return { duels: duelsDb.filter((d) => d.challenger.id === uid || d.opponent.id === uid).map((d) => shape(d, uid)).reverse() };
    }),
    apiGetDuelOpponents: vi.fn(async () => ({ opponents: [{ id: "u-rival@test.com", name: "Rival", duels_won: 1, duels_lost: 0 }] })),
    apiCreateDuel: vi.fn(async (token, { opponentUserId, modality, stake }) => {
      const uid = tokensToUser[token].id;
      const d = {
        id: `d-${seq++}`,
        status: "pending",
        modality,
        stake,
        challenger: { id: uid, name: "Me" },
        opponent: { id: opponentUserId, name: "Rival" },
        winner_user_id: null,
        outcome: null,
        result: null,
        runs: [],
      };
      duelsDb.push(d);
      return { duel: shape(d, uid) };
    }),
    apiAcceptDuel: vi.fn(async (token, id) => {
      const d = duelsDb.find((x) => x.id === id);
      d.status = "accepted";
      return { duel: shape(d, tokensToUser[token].id) };
    }),
    apiRejectDuel: vi.fn(async (token, id) => {
      const d = duelsDb.find((x) => x.id === id);
      d.status = "rejected";
      return { duel: shape(d, tokensToUser[token].id) };
    }),
    apiCancelDuel: vi.fn(async (token, id) => {
      const d = duelsDb.find((x) => x.id === id);
      d.status = "cancelled";
      return { duel: shape(d, tokensToUser[token].id) };
    }),
    apiSubmitDuelRun: vi.fn(async (token, id) => {
      const uid = tokensToUser[token].id;
      const d = duelsDb.find((x) => x.id === id);
      if (d.status === "accepted") d.status = "in_progress";
      if (!d.runs.includes(uid)) d.runs.push(uid);
      maybeResolve(d);
      return { duel: shape(d, uid) };
    }),
  };
});

import { apiCreateDuel } from "../utils/api.js";

let harness;

async function signedIn(email = "me@test.com") {
  harness = mountApp();
  await actAsync(() => harness.app.actions.registerRemote({ name: "Me", email, password: "x" }));
  await settle();
  await actAsync(() => harness.app.actions.addPoints(1000, "seed"));
  await settle();
  return harness.app.state.identity.user.id;
}

const settle = () => actAsync(async () => { await new Promise((r) => setTimeout(r, 0)); });

afterEach(() => {
  harness?.unmount();
  harness = null;
  localStorage.clear();
  vi.clearAllMocks();
  duelsDb = [];
  seq = 100;
  resolveAs = "challenger";
});

const RIVAL = "u-rival@test.com";

describe("AppContext — duelos reales", () => {
  it("crear un duelo BLOQUEA la apuesta y lo añade a duels.list", async () => {
    await signedIn();
    const p0 = harness.app.state.identity.user.points;

    let duel;
    await actAsync(async () => { duel = await harness.app.actions.createDuel({ opponentUserId: RIVAL, modality: "routine", stake: 150 }); });
    await settle();

    expect(apiCreateDuel).toHaveBeenCalled();
    expect(harness.app.state.identity.user.points).toBe(p0 - 150);
    expect(harness.app.state.identity.user.lockedPoints).toBe(150);
    expect(harness.app.duels.list.map((d) => d.id)).toContain(duel.id);
    const rec = harness.app.state.identity.duels.find((r) => r.id === duel.id);
    expect(rec).toMatchObject({ stake: 150, locked: true, settled: false });
  });

  it("gano el duelo → +stake neto, bloqueo liberado, victoria contada, una sola vez", async () => {
    const me = await signedIn();
    const p0 = harness.app.state.identity.user.points;
    resolveAs = "challenger";

    let duel;
    await actAsync(async () => { duel = await harness.app.actions.createDuel({ opponentUserId: RIVAL, modality: "routine", stake: 150 }); });
    // el rival acepta y ejecuta primero (lo lleva el backend)
    duelsDb.find((d) => d.id === duel.id).status = "in_progress";
    duelsDb.find((d) => d.id === duel.id).runs.push(RIVAL);
    await actAsync(() => harness.app.actions.submitDuelRun(duel.id, { durationSeconds: 1500, exercisesCompleted: 8, setsCompleted: 20, validReps: 160, consistency: 90, penalties: 0, competitiveEligible: true }));
    await settle();

    expect(harness.app.duels.list.find((d) => d.id === duel.id).status).toBe("finished");
    // net: -150 (lock) +300 (win releasePoints doble) = +150
    expect(harness.app.state.identity.user.points).toBe(p0 + 150);
    expect(harness.app.state.identity.user.lockedPoints).toBe(0);
    expect(harness.app.state.identity.user.duels.wins).toBe(1);
    expect(harness.app.state.identity.user.duels.losses).toBe(0);
    expect(me).toBe(harness.app.duels.list.find((d) => d.id === duel.id).winner_user_id);

    // recargar otra vez NO vuelve a aplicar
    await actAsync(() => harness.app.actions.refreshDuels());
    await settle();
    expect(harness.app.state.identity.user.points).toBe(p0 + 150);
    expect(harness.app.state.identity.user.duels.wins).toBe(1);
  });

  it("pierdo el duelo → -stake neto, derrota contada", async () => {
    await signedIn();
    const p0 = harness.app.state.identity.user.points;
    resolveAs = "opponent";

    let duel;
    await actAsync(async () => { duel = await harness.app.actions.createDuel({ opponentUserId: RIVAL, modality: "routine", stake: 150 }); });
    duelsDb.find((d) => d.id === duel.id).status = "in_progress";
    duelsDb.find((d) => d.id === duel.id).runs.push(RIVAL);
    await actAsync(() => harness.app.actions.submitDuelRun(duel.id, { durationSeconds: 3000, exercisesCompleted: 3, setsCompleted: 8, validReps: 40, consistency: 40, penalties: 2, competitiveEligible: true }));
    await settle();

    expect(harness.app.state.identity.user.points).toBe(p0 - 150);
    expect(harness.app.state.identity.user.lockedPoints).toBe(0);
    expect(harness.app.state.identity.user.duels.losses).toBe(1);
  });

  it("empate → devolución íntegra, sin victoria ni derrota", async () => {
    await signedIn();
    const p0 = harness.app.state.identity.user.points;
    resolveAs = "draw";

    let duel;
    await actAsync(async () => { duel = await harness.app.actions.createDuel({ opponentUserId: RIVAL, modality: "routine", stake: 200 }); });
    duelsDb.find((d) => d.id === duel.id).status = "in_progress";
    duelsDb.find((d) => d.id === duel.id).runs.push(RIVAL);
    await actAsync(() => harness.app.actions.submitDuelRun(duel.id, { durationSeconds: 1800, exercisesCompleted: 6, setsCompleted: 18, validReps: 120, consistency: 80, penalties: 0, competitiveEligible: true }));
    await settle();

    expect(harness.app.state.identity.user.points).toBe(p0);
    expect(harness.app.state.identity.user.lockedPoints).toBe(0);
    expect(harness.app.state.identity.user.duels.wins).toBe(0);
    expect(harness.app.state.identity.user.duels.losses).toBe(0);
  });

  it("duelo NO validado → devolución íntegra", async () => {
    await signedIn();
    const p0 = harness.app.state.identity.user.points;
    resolveAs = "unvalidated";

    let duel;
    await actAsync(async () => { duel = await harness.app.actions.createDuel({ opponentUserId: RIVAL, modality: "routine", stake: 120 }); });
    duelsDb.find((d) => d.id === duel.id).status = "in_progress";
    duelsDb.find((d) => d.id === duel.id).runs.push(RIVAL);
    await actAsync(() => harness.app.actions.submitDuelRun(duel.id, { durationSeconds: 1800, exercisesCompleted: 6, setsCompleted: 18, validReps: 120, consistency: 80, penalties: 0, competitiveEligible: false }));
    await settle();

    expect(harness.app.duels.list.find((d) => d.id === duel.id).status).toBe("unvalidated");
    expect(harness.app.state.identity.user.points).toBe(p0);
    expect(harness.app.state.identity.user.lockedPoints).toBe(0);
  });

  it("cancelar un duelo pendiente devuelve la apuesta bloqueada", async () => {
    await signedIn();
    const p0 = harness.app.state.identity.user.points;

    let duel;
    await actAsync(async () => { duel = await harness.app.actions.createDuel({ opponentUserId: RIVAL, modality: "routine", stake: 100 }); });
    expect(harness.app.state.identity.user.points).toBe(p0 - 100);

    await actAsync(() => harness.app.actions.cancelDuel(duel.id));
    await settle();

    expect(harness.app.state.identity.user.points).toBe(p0);
    expect(harness.app.state.identity.user.lockedPoints).toBe(0);
  });

  it("como rival, ACEPTAR bloquea mi apuesta; después gano y recibo +stake neto", async () => {
    const me = await signedIn("opp@test.com");
    const p0 = harness.app.state.identity.user.points;
    resolveAs = "opponent"; // el "opponent" del duelo soy yo

    const d = {
      id: `d-${seq++}`, status: "pending", modality: "routine", stake: 100,
      challenger: { id: "u-challenger", name: "Otro" }, opponent: { id: me, name: "Me" },
      winner_user_id: null, outcome: null, result: null, runs: [],
    };
    duelsDb.push(d);

    await actAsync(() => harness.app.actions.acceptDuel(d.id, 100));
    await settle();
    expect(harness.app.state.identity.user.points).toBe(p0 - 100);
    expect(harness.app.state.identity.user.lockedPoints).toBe(100);

    d.status = "in_progress";
    d.runs.push("u-challenger");
    await actAsync(() => harness.app.actions.submitDuelRun(d.id, { durationSeconds: 1500, exercisesCompleted: 8, setsCompleted: 20, validReps: 160, consistency: 90, penalties: 0, competitiveEligible: true }));
    await settle();

    expect(harness.app.state.identity.user.points).toBe(p0 + 100);
    expect(harness.app.state.identity.user.duels.wins).toBe(1);
  });

  it("sin sesión, duels queda en 'idle' y no se llama al backend", async () => {
    harness = mountApp();
    await settle();
    expect(harness.app.duels).toEqual({ list: [], status: "idle" });
  });
});
