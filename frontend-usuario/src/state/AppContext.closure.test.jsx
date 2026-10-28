/**
 * TEST DE CIERRE DINÁMICO — monta <AppProvider> real y ejercita acciones
 * reales de `actions` (no simuladas). Atrapa el caso `pointsLog`: un writer
 * que crea una clave nueva fuera del árbol `device`/`auth`/`identitySnapshots`/
 * `identity` (o fuera del schema conocido dentro de `identity`) hace fallar
 * este test, sin tener que enumerar manualmente cada acción nueva que se
 * añada en el futuro.
 */
import { afterEach, describe, expect, it } from "vitest";
import { mountApp, actAsync } from "./testHarness.jsx";
import { STATE_KEYS, DEVICE_KEYS, AUTH_KEYS, IDENTITY_KEYS, IDENTITY_USER_KEYS } from "./stateSchema.js";

let harness;

afterEach(() => {
  harness?.unmount();
  harness = null;
  localStorage.clear();
});

describe("AppContext — cierre dinámico de acciones reales", () => {
  it("addPoints, checkIn, saveRoutine y otras acciones representativas no crean claves fuera de stateSchema.js", async () => {
    harness = mountApp();

    await actAsync(() => harness.app.actions.addPoints(50, "test"));
    await actAsync(() => harness.app.actions.checkIn({ gymId: "g1" }));
    await actAsync(() =>
      harness.app.actions.saveRoutine({
        name: "Mi rutina",
        focusId: "hypertrophy",
        exercises: [{ id: "ex-1", name: "Sentadilla", sets: 3, reps: 10, rest: 60 }],
      })
    );
    await actAsync(() =>
      harness.app.actions.addActivity({
        routine: "Test",
        durationSeconds: 100,
        sets: 5,
        exercises: 2,
        validation: "VALID",
        activityPoints: 10,
        competitivePoints: 0,
      })
    );
    await actAsync(() =>
      harness.app.actions.claimPrize({ id: "p1", title: "Premio", kind: "descuento", cost: 0, transferable: false })
    );
    await actAsync(() => harness.app.actions.notify({ channel: "training", title: "Hola" }));
    await actAsync(() => harness.app.actions.updateUser({ gymId: "g1" }));
    await actAsync(() => harness.app.actions.setCoach({ hidden: true }));
    await actAsync(() => harness.app.actions.scheduleSession({ date: "2026-08-25", slot: "tarde" }));
    await actAsync(() => harness.app.actions.bumpChallenge("2026-08-25", "sets", 1));
    await actAsync(() => harness.app.actions.markPostRead("post-1"));
    await actAsync(() => harness.app.actions.updateDeviceSettings({ sound: false }));
    await actAsync(() => harness.app.actions.updateIdentitySettings({ rankingOptIn: false }));

    const { state } = harness.app;

    expect(Object.keys(state).sort(), "state top-level").toEqual([...STATE_KEYS].sort());
    expect(Object.keys(state.device).sort(), "device").toEqual([...DEVICE_KEYS].sort());
    expect(Object.keys(state.auth).sort(), "auth").toEqual([...AUTH_KEYS].sort());
    expect(Object.keys(state.identity).sort(), "identity").toEqual([...IDENTITY_KEYS].sort());
    expect(Object.keys(state.identity.user).sort(), "identity.user").toEqual([...IDENTITY_USER_KEYS].sort());

    // pointsLog en particular: ya no es ad hoc, vive dentro de identity.
    // 2 entradas: addPoints(50) y checkIn (POINT_RULES.checkin) — checkIn
    // ahora comparte el mismo registro que addPoints (ver grantPoints en
    // AppContext.jsx), así que también deja su propia entrada en el log.
    expect(state.identity.pointsLog.length).toBe(2);
    expect(state.identity.pointsLog[1].amount).toBe(50);
  });
});
