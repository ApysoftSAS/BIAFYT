/**
 * MIGRACIÓN LEGACY — fixture con el shape PLANO anterior a este refactor
 * (sin `schemaVersion`, `user`/`settings`/`duels`/etc. en el top-level de
 * `state`, `auth.account` en vez de `device.rememberedEmail`). Verifica
 * `migrateLegacyState` directamente y también `load()` end-to-end contra
 * un blob real en localStorage.
 */
import { afterEach, describe, expect, it } from "vitest";
import { STORAGE_KEY } from "../config/appConfig.js";
import { ANONYMOUS_ID, DEFAULT_IDENTITY_STATE, load, migrateLegacyState } from "./AppContext.jsx";

function legacyFixture() {
  return {
    onboarded: true,
    user: {
      id: "u-legacy-1",
      name: "Legacy User",
      initials: "LU",
      email: "legacy@test.com",
      focusId: "strength",
      gymId: "gym-legacy",
      branchId: "branch-legacy",
      city: "Bogotá",
      country: "Colombia",
      points: 1234,
      lockedPoints: 50,
      streak: 9,
      profile: { age: 30, weight: 80, height: 180, monthsTraining: 12, level: "Avanzado" },
      profileSynced: true,
      stats: { strength: 90, endurance: 70, consistency: 85, experience: 60, frequency: 5 },
      duels: { wins: 3, losses: 1 },
      plan: { id: "plan-free", status: "active", startedAt: null, expiresAt: null },
      schedule: { slot: "manana", days: [1, 3, 5], startTime: "07:00", endTime: "08:00", reminder: true },
    },
    settings: {
      sound: false,
      vibration: true,
      gpsCompetitive: true,
      rankingOptIn: false,
      publicProfile: false,
      visibleData: { level: true, streak: false, physical: true },
      notifications: { training: true, rankings: false, challenges: true, duels: true, promos: true },
    },
    gyms: [{ id: "gym-legacy-custom", userRegistered: true, name: "GYM CUSTOM", branches: [] }],
    prospects: [{ gymId: "gym-legacy-custom", name: "GYM CUSTOM" }],
    discountUsage: { SOMA20: 1 },
    activities: [{ id: "a-1", date: "2026-08-20T10:00:00.000Z", routine: "Fuerza", durationSeconds: 1800, sets: 12, exercises: 4, validation: "VALID", activityPoints: 40, competitivePoints: 20 }],
    duels: [{ id: "d-1", rivalName: "Rival", status: "PENDING" }],
    rewards: [{ uid: "r-1", title: "Descuento", status: "Disponible" }],
    notifications: [{ id: "n-1", title: "Hola", read: false, date: "2026-08-20T10:00:00.000Z" }],
    checkins: [{ date: "2026-08-20T10:00:00.000Z", gymId: "gym-legacy" }],
    customRoutines: [{ id: "r-custom-1", name: "Mi rutina", focusId: "strength", exercises: [] }],
    activeRoutineId: "r-custom-1",
    challengeProgress: { "2026-08-20": { sets: 5, claimed: ["dc-sets"] } },
    readPosts: ["post-1", "post-2"],
    coach: { hidden: true, position: { x: 10, y: 20 } },
    agenda: [{ id: "ag-2026-08-21", date: "2026-08-21", slot: "manana" }],
    lastCheckIn: "2026-08-20T10:00:00.000Z",
    lastCheckOut: "2026-08-20T11:00:00.000Z",
    pointsLog: [{ amount: 40, reason: "Entrenamiento", date: "2026-08-20T10:00:00.000Z" }],
    auth: {
      account: { email: "legacy@test.com" },
      token: "legacy-token-123",
      signedIn: true,
      biometric: { enabled: true, credentialId: "cred-1" },
      locked: false,
    },
  };
}

afterEach(() => {
  localStorage.clear();
});

describe("AppContext — migración de LocalStorage legado (shape plano)", () => {
  it("migrateLegacyState arranca con identity EN BLANCO (nunca promueve el blob viejo directo)", () => {
    const migrated = migrateLegacyState(legacyFixture());

    expect(migrated.schemaVersion).toBe(2);
    expect(migrated.identity).toEqual(DEFAULT_IDENTITY_STATE);
  });

  it("migrateLegacyState guarda el usuario legado completo en identitySnapshots[userId]", () => {
    const migrated = migrateLegacyState(legacyFixture());
    const snap = migrated.identitySnapshots["u-legacy-1"];

    expect(snap).toBeDefined();
    expect(snap.onboarded).toBe(true);
    expect(snap.user.name).toBe("Legacy User");
    expect(snap.user.gymId).toBe("gym-legacy");
    expect(snap.user.points).toBe(1234);
    expect(snap.user.streak).toBe(9);
    expect(snap.user.stats.strength).toBe(90);
    expect(snap.user.duels).toEqual({ wins: 3, losses: 1 });
    expect(snap.settings.rankingOptIn).toBe(false);
    expect(snap.discountUsage).toEqual({ SOMA20: 1 });
    expect(snap.activities.length).toBe(1);
    expect(snap.duels.length).toBe(1);
    expect(snap.rewards.length).toBe(1);
    expect(snap.notifications.length).toBe(1);
    expect(snap.checkins.length).toBe(1);
    expect(snap.customRoutines.length).toBe(1);
    expect(snap.activeRoutineId).toBe("r-custom-1");
    expect(snap.challengeProgress["2026-08-20"].sets).toBe(5);
    expect(snap.readPosts).toEqual(["post-1", "post-2"]);
    expect(snap.agenda.length).toBe(1);
    expect(snap.lastCheckIn).toBe("2026-08-20T10:00:00.000Z");
    expect(snap.lastCheckOut).toBe("2026-08-20T11:00:00.000Z");
    expect(snap.pointsLog.length).toBe(1);
  });

  it("migrateLegacyState mueve coach/gyms/settings de dispositivo y auth.account → device.rememberedEmail", () => {
    const migrated = migrateLegacyState(legacyFixture());

    expect(migrated.device.coach).toEqual({ hidden: true, position: { x: 10, y: 20 } });
    expect(migrated.device.settings).toEqual({ sound: false, vibration: true, gpsCompetitive: true });
    expect(migrated.device.rememberedEmail).toBe("legacy@test.com");
    expect(migrated.device.gyms.some((g) => g.id === "gym-legacy-custom")).toBe(true);
    expect(migrated.device.prospects.length).toBe(1);
  });

  it("migrateLegacyState preserva auth.token: el arranque normal puede revalidar y reconectar al usuario real", () => {
    const migrated = migrateLegacyState(legacyFixture());
    expect(migrated.auth.token).toBe("legacy-token-123");
    // signedIn se recalcula igual que hoy (no se confía ciegamente del blob viejo).
    expect(migrated.auth.signedIn).toBe(true);
  });

  it("load() detecta ausencia de schemaVersion y migra automáticamente desde localStorage", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(legacyFixture()));
    const state = load();

    expect(state.schemaVersion).toBe(2);
    expect(state.identity).toEqual(DEFAULT_IDENTITY_STATE);
    expect(state.identitySnapshots["u-legacy-1"].user.points).toBe(1234);
    expect(state.device.rememberedEmail).toBe("legacy@test.com");
  });

  it("un blob sin usuario real (id ausente o 'me') no crea un snapshot bajo ANONYMOUS_ID", () => {
    const fixture = legacyFixture();
    fixture.user.id = "me"; // placeholder legado nunca-autenticado
    const migrated = migrateLegacyState(fixture);

    expect(migrated.identitySnapshots[ANONYMOUS_ID]).toBeUndefined();
    expect(Object.keys(migrated.identitySnapshots)).toEqual([]);
  });
});
