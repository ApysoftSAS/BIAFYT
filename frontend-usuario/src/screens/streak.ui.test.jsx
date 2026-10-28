/**
 * RACHA CANÓNICA (D2 / roadmap 3a) — la UI muestra `current_streak` y
 * `longest_streak` del backend (`GET /me/streak`), NO `identity.user.streak`.
 *
 * Integración real: <AppProvider> + pantalla, con `global.fetch` stubeado
 * (como haría el backend). Se registra un usuario y se comprueba que la
 * racha visible viene de la respuesta de /me/streak.
 */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppProvider, useApp } from "../state/AppContext.jsx";
import Home from "./Home.jsx";
import Profile from "./Profile.jsx";
import Challenges from "./Challenges.jsx";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
vi.mock("../components/Coach.jsx", () => ({ default: () => null }));

// Respuesta que "sirve" el backend para GET /me/streak.
let streakBody = { current_streak: 7, longest_streak: 21 };

function stubBackend() {
  const users = {};
  let seq = 1;
  vi.stubGlobal("fetch", vi.fn(async (url, opts) => {
    const path = String(url).replace(/^.*\/api\/v1/, "");
    const body = opts?.body ? JSON.parse(opts.body) : {};
    if (path === "/auth/register") {
      const t = `t${seq++}`;
      users[t] = { id: 1, name: body.name, email: body.email };
      return { ok: true, status: 201, json: async () => ({ user: users[t], token: t }) };
    }
    if (path === "/auth/me") {
      const t = String(opts?.headers?.Authorization || "").replace("Bearer ", "");
      return { ok: true, status: 200, json: async () => ({ user: users[t] ?? { id: 1, name: "U", email: "u@x" } }) };
    }
    if (path === "/me/streak") {
      return { ok: true, status: 200, json: async () => streakBody };
    }
    if (path === "/me/check-ins" && opts?.method === "POST") {
      return { ok: true, status: 201, json: async () => ({ check_in: { id: 1, check_in_date: "2026-08-28" } }) };
    }
    // /exercises, /equipment, /profile, etc. → fallback local, sin romper
    return { ok: false, status: 404, json: async () => ({ message: "nf" }) };
  }));
}

const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

function Grab({ onReady }) {
  onReady(useApp());
  return null;
}

function mountWith(Screen) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  // `app` es local a esta función (no de módulo): reasignarlo desde el
  // callback de <Grab> es válido — mismo patrón que state/testHarness.jsx.
  let app = null;

  const api = {
    container,
    get app() {
      return app;
    },
    async render() {
      await act(async () => {
        root.render(
          <AppProvider>
            <Grab onReady={(next) => { app = next; }} />
            <Screen onBack={() => {}} onNavigate={() => {}} onTrain={() => {}} />
          </AppProvider>
        );
      });
      await flush();
    },
    async register() {
      await act(async () => {
        await app.actions.registerRemote({ name: "Ana Pérez", email: `s${Math.random()}@t.com`, password: "x" });
      });
      await flush();
      await flush();
    },
    unmount() {
      act(() => root.unmount());
      container.remove();
    },
  };
  return api;
}

beforeEach(() => {
  localStorage.clear();
  streakBody = { current_streak: 7, longest_streak: 21 };
  stubBackend();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("UI de racha — Home / Profile / Challenges usan /me/streak", () => {
  it("Home muestra 🔥 <current_streak> días del backend", async () => {
    const h = mountWith(Home);
    await h.render();
    await h.register();
    expect(h.app.streak).toEqual({ current: 7, longest: 21, status: "ok" });
    expect(h.container.textContent).toContain("🔥 7 días");
    h.unmount();
  });

  it("Profile muestra current + récord (longest) del backend", async () => {
    const h = mountWith(Profile);
    await h.render();
    await h.register();
    expect(h.container.textContent).toContain("🔥 7");
    expect(h.container.textContent).toContain("récord 21");
    h.unmount();
  });

  it("Challenges muestra 🔥 <current_streak> del backend", async () => {
    const h = mountWith(Challenges);
    await h.render();
    await h.register();
    expect(h.container.textContent).toContain("🔥 7");
    h.unmount();
  });

  it("sin sesión la racha es '—' (no hay valor local que mezclar)", async () => {
    const h = mountWith(Home);
    await h.render();
    // sin registrar → status idle
    expect(h.app.streak.status).toBe("idle");
    expect(h.container.textContent).toContain("🔥 — días");
    h.unmount();
  });

  it("tras un check-in la racha de Home se refresca desde el backend", async () => {
    const h = mountWith(Home);
    await h.render();
    await h.register();
    expect(h.container.textContent).toContain("🔥 7 días");

    streakBody = { current_streak: 8, longest_streak: 21 };
    await act(async () => { h.app.actions.checkIn({ gymId: "g1" }); });
    await flush();
    await flush();

    expect(h.app.streak.current).toBe(8);
    expect(h.container.textContent).toContain("🔥 8 días");
    h.unmount();
  });
});
