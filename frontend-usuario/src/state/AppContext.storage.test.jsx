/**
 * MULTI-PESTAÑA (regresión QA HIGH) — dos instancias de <AppProvider>
 * compartiendo el mismo LocalStorage (mismo patrón que
 * AppContext.identity.test.jsx: apiRegister/apiLogin/apiLogout/apiMe
 * mockeados). Verifica que el listener del evento nativo `storage`
 * (ver AppContext.jsx) hace converger el `state` en memoria de una
 * instancia al último valor escrito en STORAGE_KEY por otra, sin
 * mezclar estados y sin corromper `identitySnapshots`.
 *
 * El evento `storage` nativo nunca dispara en la MISMA pestaña que hizo
 * el `setItem` — solo en las demás. Aquí se dispara manualmente sobre
 * `window` (equivalente al que el navegador real entrega a la otra
 * pestaña) para simular "la otra instancia ya escribió, ahora le toca
 * reaccionar a esta".
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { STORAGE_KEY } from "../config/appConfig.js";
import { mountApp, actAsync } from "./testHarness.jsx";

vi.mock("../utils/api.js", async () => {
  const actual = await vi.importActual("../utils/api.js");
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
  };
});

/** Simula que OTRA pestaña escribió en STORAGE_KEY (equivalente al evento nativo que el navegador entrega a las demás pestañas). */
function fireStorageEvent(newValue) {
  window.dispatchEvent(new StorageEvent("storage", { key: STORAGE_KEY, newValue, storageArea: localStorage }));
}

let harnessA;
let harnessB;

afterEach(() => {
  harnessA?.unmount();
  harnessB?.unmount();
  harnessA = null;
  harnessB = null;
  localStorage.clear();
});

describe("AppContext — sincronización multi-pestaña vía evento `storage`", () => {
  it("A converge exactamente al state Y escrito por otra pestaña (logout+login), y no resucita su state X viejo", async () => {
    harnessA = mountApp();
    await actAsync(() => harnessA.app.actions.registerRemote({ name: "Xavier", email: "xavier.mt1@test.com", password: "x" }));
    await actAsync(() => harnessA.app.actions.updateUser({ gymId: "gym-x" }));
    await actAsync(() => harnessA.app.actions.addPoints(111, "x"));

    // "Otra pestaña" B: mismo LocalStorage de jsdom, así que al montar ya
    // hereda la sesión de Xavier (como una segunda pestaña real abierta
    // sobre la misma sesión) — ahí mismo, en B, se hace logout e inicia
    // sesión como Yara (escenario E de la verificación real).
    harnessB = mountApp();
    expect(harnessB.app.state.identity.user.name).toBe("Xavier");
    await actAsync(() => harnessB.app.actions.signOut());
    await actAsync(() => harnessB.app.actions.registerRemote({ name: "Yara", email: "yara.mt1@test.com", password: "y" }));
    await actAsync(() => harnessB.app.actions.addPoints(222, "y"));
    const yState = JSON.parse(localStorage.getItem(STORAGE_KEY));
    expect(yState.identity.user.name).toBe("Yara");

    // A todavía no sabe nada de esto hasta que llega el evento `storage`.
    expect(harnessA.app.state.identity.user.name).toBe("Xavier");

    await actAsync(() => fireStorageEvent(JSON.stringify(yState)));

    // A convergió EXACTAMENTE al state de Y — no una mezcla, no el viejo.
    expect(harnessA.app.state.identity.user.name).toBe("Yara");
    expect(harnessA.app.state.identity.user.points).toBe(222);
    expect(harnessA.app.state.auth.token).toBe(harnessB.app.state.auth.token);

    // El "eco" de persistencia tras el reemplazo escribe el mismo valor
    // que ya estaba (Y) — nunca resucita el X (Xavier) viejo de A.
    const afterEcho = JSON.parse(localStorage.getItem(STORAGE_KEY));
    expect(afterEcho.identity.user.name).toBe("Yara");
    expect(afterEcho.identity.user.name).not.toBe("Xavier");
  });

  it("ciclo A→B→A vía `storage`: cada pestaña converge a la identidad de la otra sin perder identitySnapshots", async () => {
    // Ambas instancias se montan ANTES de cualquier login, para arrancar
    // de verdad anónimas (no heredar nada por LocalStorage compartido).
    harnessA = mountApp();
    harnessB = mountApp();
    expect(harnessB.app.state.identity.user.id).toBe("anon");

    await actAsync(() => harnessA.app.actions.registerRemote({ name: "Ana", email: "ana.mt2@test.com", password: "x" }));
    await actAsync(() => harnessA.app.actions.addPoints(50, "ana"));
    const anaSnapshotId = harnessA.app.state.identity.user.id;

    // B sigue anónimo hasta que recibe el evento `storage` con el state de A.
    expect(harnessB.app.state.identity.user.id).toBe("anon");
    const aState = JSON.parse(localStorage.getItem(STORAGE_KEY));
    await actAsync(() => fireStorageEvent(JSON.stringify(aState)));
    expect(harnessB.app.state.identity.user.id).toBe(anaSnapshotId);
    expect(harnessB.app.state.identity.user.points).toBe(50);

    // B (con la identidad de Ana recién recibida) cierra sesión — guarda
    // el snapshot de Ana — e inicia como Bruno.
    await actAsync(() => harnessB.app.actions.signOut());
    await actAsync(() => harnessB.app.actions.registerRemote({ name: "Bruno", email: "bruno.mt2@test.com", password: "y" }));
    const brunoState = JSON.parse(localStorage.getItem(STORAGE_KEY));

    // A (que seguía como Ana) recibe el cambio de B → converge a Bruno.
    await actAsync(() => fireStorageEvent(JSON.stringify(brunoState)));
    expect(harnessA.app.state.identity.user.name).toBe("Bruno");

    // El snapshot de Ana, guardado por el propio switchIdentity de B al
    // pasar de Ana → Bruno, sigue íntegro tras la reconciliación de A.
    expect(harnessA.app.state.identitySnapshots[anaSnapshotId]).toBeDefined();
    expect(harnessA.app.state.identitySnapshots[anaSnapshotId].user.name).toBe("Ana");
    expect(harnessA.app.state.identitySnapshots[anaSnapshotId].user.points).toBe(50);

    // Ana vuelve a iniciar sesión (en B) — su propio snapshot restaura su
    // estado completo — y se propaga de vuelta a A vía `storage`.
    await actAsync(() => harnessB.app.actions.signOut());
    await actAsync(() => harnessB.app.actions.loginRemote({ email: "ana.mt2@test.com", password: "x" }));
    const anaAgainState = JSON.parse(localStorage.getItem(STORAGE_KEY));
    await actAsync(() => fireStorageEvent(JSON.stringify(anaAgainState)));

    expect(harnessA.app.state.identity.user.name).toBe("Ana");
    expect(harnessA.app.state.identity.user.points).toBe(50);
    expect(harnessA.app.state.identitySnapshots[anaSnapshotId]).toBeDefined();
  });

  it("un evento `storage` de otra clave (key !== STORAGE_KEY) se ignora", async () => {
    harnessA = mountApp();
    await actAsync(() => harnessA.app.actions.registerRemote({ name: "Nora", email: "nora.mt3@test.com", password: "x" }));
    const before = harnessA.app.state;

    await actAsync(() =>
      window.dispatchEvent(new StorageEvent("storage", { key: "otra-clave-no-relacionada", newValue: "{}" }))
    );

    expect(harnessA.app.state).toBe(before); // ninguna actualización de estado ocurrió
  });
});
