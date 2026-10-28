/**
 * ESCENARIOS DE IDENTIDAD (requisito 6 del refactor de identidad) contra
 * <AppProvider> real, con `apiRegister`/`apiLogin`/`apiLogout`/`apiMe`
 * MOCKEADOS (no contra el backend real — eso se verifica manualmente con
 * navegador + backend real por separado). Cubre: A→logout→B,
 * A→logout→B→logout→A, y A→401→B.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { mountApp, actAsync } from "./testHarness.jsx";
import { ANONYMOUS_ID } from "./AppContext.jsx";

vi.mock("../utils/api.js", async () => {
  const actual = await vi.importActual("../utils/api.js");
  // Estado del "backend" simulado, privado a este módulo mockeado.
  // `usersByEmail` = base de datos de cuentas registradas (permanente).
  // `tokensToUser` = sesiones activas por token (se borra en logout/revoke).
  const usersByEmail = {};
  const tokensToUser = {};
  let seq = 1;

  return {
    ...actual,
    apiRegister: vi.fn(async ({ name, email }) => {
      const user = { id: `u-${email}`, name, email };
      usersByEmail[email] = user;
      const token = `token-${seq++}`;
      tokensToUser[token] = user;
      return { user, token };
    }),
    apiLogin: vi.fn(async ({ email }) => {
      const user = usersByEmail[email];
      if (!user) throw new actual.ApiError("Credenciales inválidas.", { status: 422 });
      const token = `token-${seq++}`;
      tokensToUser[token] = user;
      return { user, token };
    }),
    apiLogout: vi.fn(async (token) => {
      delete tokensToUser[token];
      return { message: "ok" };
    }),
    apiMe: vi.fn(async (token) => {
      const user = tokensToUser[token];
      if (!user) throw new actual.ApiError("No autenticado.", { status: 401 });
      return { user };
    }),
    // Solo para pruebas: simula que el servidor revocó el token (p.ej.
    // expiró o fue invalidado desde otro dispositivo) sin pasar por logout.
    __revokeToken: (token) => {
      delete tokensToUser[token];
    },
  };
});

let harness;

afterEach(() => {
  harness?.unmount();
  harness = null;
  localStorage.clear();
});

describe("AppContext — escenarios de identidad", () => {
  it("A → logout → B: B no ve absolutamente ningún dato de A", async () => {
    harness = mountApp();

    await actAsync(() => harness.app.actions.registerRemote({ name: "Alice", email: "alice.s1@test.com", password: "x" }));
    await actAsync(() => harness.app.actions.updateUser({ gymId: "gym-a", branchId: "branch-a" }));
    await actAsync(() => harness.app.actions.completeOnboarding());
    await actAsync(() => harness.app.actions.checkIn({ gymId: "gym-a" }));
    await actAsync(() => harness.app.actions.addPoints(500, "test"));
    await actAsync(() => harness.app.actions.markPostRead("post-a"));

    expect(harness.app.state.identity.user.name).toBe("Alice");
    expect(harness.app.state.identity.checkins.length).toBe(1);
    expect(harness.app.state.identity.lastCheckIn).not.toBeNull();
    expect(harness.app.state.identity.onboarded).toBe(true);
    expect(harness.app.state.identity.user.points).toBeGreaterThan(0);

    await actAsync(() => harness.app.actions.signOut());
    expect(harness.app.state.auth.signedIn).toBe(false);
    expect(harness.app.state.auth.token).toBeNull();
    expect(harness.app.state.identity.user.id).toBe(ANONYMOUS_ID);
    expect(harness.app.state.identity.onboarded).toBe(false);
    expect(harness.app.state.identity.checkins).toEqual([]);
    expect(harness.app.state.identity.lastCheckIn).toBeNull();

    await actAsync(() => harness.app.actions.registerRemote({ name: "Bob", email: "bob.s1@test.com", password: "x" }));

    const b = harness.app.state;
    expect(b.identity.user.name).toBe("Bob");
    expect(b.identity.user.id).not.toBe("u-alice.s1@test.com");
    expect(b.identity.onboarded).toBe(false);
    expect(b.identity.checkins).toEqual([]);
    expect(b.identity.lastCheckIn).toBeNull();
    expect(b.identity.readPosts).toEqual([]);
    expect(b.identity.user.points).toBe(0);
    expect(b.identity.user.gymId).toBeNull();
    expect(b.identity.user.branchId).toBeNull();
  });

  it("A → logout → B → logout → A: A recupera EXACTAMENTE su propio snapshot, no el de B ni en blanco", async () => {
    harness = mountApp();

    await actAsync(() => harness.app.actions.registerRemote({ name: "Alice2", email: "alice.s2@test.com", password: "x" }));
    await actAsync(() => harness.app.actions.updateUser({ gymId: "gym-x", branchId: "branch-x" }));
    await actAsync(() => harness.app.actions.checkIn({ gymId: "gym-x" }));
    await actAsync(() => harness.app.actions.addPoints(300, "x"));
    const alicePoints = harness.app.state.identity.user.points;
    const aliceId = harness.app.state.identity.user.id;

    await actAsync(() => harness.app.actions.signOut());

    await actAsync(() => harness.app.actions.registerRemote({ name: "Bob2", email: "bob.s2@test.com", password: "x" }));
    await actAsync(() => harness.app.actions.updateUser({ gymId: "gym-y", branchId: "branch-y" }));
    await actAsync(() => harness.app.actions.checkIn({ gymId: "gym-y" }));
    await actAsync(() => harness.app.actions.addPoints(999, "y"));
    expect(harness.app.state.identity.user.gymId).toBe("gym-y");
    expect(harness.app.state.identity.user.id).not.toBe(aliceId);

    await actAsync(() => harness.app.actions.signOut());
    await actAsync(() => harness.app.actions.loginRemote({ email: "alice.s2@test.com", password: "x" }));

    const restored = harness.app.state;
    expect(restored.identity.user.id).toBe(aliceId);
    expect(restored.identity.user.name).toBe("Alice2");
    expect(restored.identity.user.gymId).toBe("gym-x");
    expect(restored.identity.user.branchId).toBe("branch-x");
    expect(restored.identity.user.points).toBe(alicePoints);
    expect(restored.identity.checkins.length).toBe(1);
  });

  it("A → 401 → B: una sesión invalidada por el servidor no deja datos de A visibles antes de que entre B", async () => {
    harness = mountApp();
    const apiModule = await import("../utils/api.js");

    await actAsync(() => harness.app.actions.registerRemote({ name: "Alice3", email: "alice.s3@test.com", password: "x" }));
    await actAsync(() => harness.app.actions.checkIn({ gymId: "gym-z" }));
    await actAsync(() => harness.app.actions.addPoints(777, "z"));
    expect(harness.app.state.auth.signedIn).toBe(true);
    const revokedToken = harness.app.state.auth.token;

    // Simula que el backend revocó el token (equivalente a un 401 real de
    // /auth/me, /profile, etc. en cualquiera de los 3 puntos de AppContext).
    apiModule.__revokeToken(revokedToken);
    let threw = false;
    await actAsync(async () => {
      try {
        await harness.app.actions.refreshSession();
      } catch {
        threw = true; // esperado: 401 → refreshSession relanza tras limpiar la sesión local
      }
    });
    expect(threw).toBe(true);

    expect(harness.app.state.auth.signedIn).toBe(false);
    expect(harness.app.state.auth.token).toBeNull();
    expect(harness.app.state.identity.user.id).toBe(ANONYMOUS_ID);
    expect(harness.app.state.identity.checkins).toEqual([]);
    expect(harness.app.state.identity.user.points).toBe(0);

    await actAsync(() => harness.app.actions.registerRemote({ name: "Bob3", email: "bob.s3@test.com", password: "x" }));
    const b = harness.app.state;
    expect(b.identity.user.name).toBe("Bob3");
    expect(b.identity.checkins).toEqual([]);
    expect(b.identity.lastCheckIn).toBeNull();
    expect(b.identity.user.points).toBe(0);
  });
});
