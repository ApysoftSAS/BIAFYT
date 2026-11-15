import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";

// @capacitor/app hace un import nativo; se stubea para jsdom.
vi.mock("@capacitor/app", () => ({
  App: { addListener: vi.fn().mockResolvedValue({ remove: vi.fn() }), exitApp: vi.fn() },
}));

const { default: App } = await import("./App.jsx");
const { STORAGE_KEY } = await import("./config/appConfig.js");

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

// Smoke test técnico: la app monta en jsdom sin lanzar y, sin token
// persistido, muestra la pantalla de acceso. No prueba lógica de negocio.
describe("App (Gym) — smoke", () => {
  let container;

  beforeEach(() => {
    localStorage.clear();
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("monta y renderiza el acceso cuando no hay sesión", async () => {
    await act(async () => {
      createRoot(container).render(<App />);
    });
    expect(container.textContent).toContain("BIAFYT Gym");
    expect(container.querySelector(".auth-form")).not.toBeNull();
  });

  it("con rol gym_admin entra a la gestión; sin él ve Sin acceso de Gym", async () => {
    const routes = (assignments) => ({
      "/auth/me": { user: { id: 1, name: "A", email: "a@x.test" } },
      "/me/gym-assignments": { gym_assignments: assignments },
      "/me/gym/3/members": { members: [] },
      "/me/gym/3/coaches": { coaches: [] },
      "/me/gym/3/branches": { branches: [{ id: 1, name: "Norte", members_count: 0 }] },
      "/gyms": { gyms: [{ id: 3, name: "KAIROS", branches: [{ id: 1, name: "Norte" }] }] },
    });
    const stub = (r) =>
      vi.stubGlobal("fetch", vi.fn(async (url) => {
        const path = String(url).split("/api/v1").pop();
        const match = Object.keys(r).find((k) => path.startsWith(k));
        return { ok: Boolean(match), status: match ? 200 : 404, json: async () => (match ? r[match] : {}) };
      }));
    const session = JSON.stringify({ auth: { token: "t", signedIn: true, user: { id: 1, name: "A" } } });

    localStorage.setItem(STORAGE_KEY, session);
    stub(routes([{ id: 5, role: "member", gym: { id: 3, name: "KAIROS" }, branch: null }]));
    const root = createRoot(container);
    await act(async () => root.render(<App />));
    await flush();
    expect(container.textContent).toContain("Sin acceso de Gym");
    await act(async () => root.unmount());

    localStorage.setItem(STORAGE_KEY, session);
    stub(routes([{ id: 7, role: "gym_admin", gym: { id: 3, name: "KAIROS" }, branch: null }]));
    await act(async () => createRoot(container).render(<App />));
    await flush();
    expect(container.textContent).toContain("KAIROS");
    const tab = [...container.querySelectorAll(".nav-item")].find((b) => b.textContent.includes("Sedes"));
    await act(async () => tab.click());
    await flush();
    expect(container.textContent).toContain("Sedes (1)");
  });
});
