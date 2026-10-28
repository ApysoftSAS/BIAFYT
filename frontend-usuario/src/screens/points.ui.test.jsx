/**
 * SALDO E HISTORIAL AUTORITATIVOS (roadmap 3c / B1-B2) — la UI muestra el
 * saldo y los movimientos de `GET /me/points` (backend), NO
 * `identity.user.points` ni `pointsLog`.
 *
 * Integración real: <AppProvider> + pantalla, con `global.fetch` stubeado.
 */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppProvider, useApp } from "../state/AppContext.jsx";
import Home from "./Home.jsx";
import Profile from "./Profile.jsx";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
vi.mock("../components/Coach.jsx", () => ({ default: () => null }));

// Lo que "sirve" el backend para GET /me/points (página 1 y página 2 con cursor).
let pointsPage1 = {
  balance: 340,
  transactions: [
    { id: 3, amount: 20, reason: "checkin", source_type: "check_in", source_id: 3, created_at: "2026-09-03T10:00:00Z" },
    { id: 2, amount: -600, reason: "reward_claimed", source_type: "reward_claim", source_id: 2, created_at: "2026-09-02T10:00:00Z" },
  ],
  next_cursor: "c1",
  has_more: true,
};
let pointsPage2 = {
  balance: 340,
  transactions: [{ id: 1, amount: 200, reason: "workout_completed", source_type: "activity", source_id: 1, created_at: "2026-09-01T10:00:00Z" }],
  next_cursor: null,
  has_more: false,
};
let pointsStatus = 200;

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
    if (path === "/me/streak") return { ok: true, status: 200, json: async () => ({ current_streak: 0, longest_streak: 0 }) };
    if (path === "/me/duels") return { ok: true, status: 200, json: async () => ({ duels: [] }) };
    if (path.startsWith("/me/points")) {
      if (pointsStatus !== 200) return { ok: false, status: pointsStatus, json: async () => ({ message: "err" }) };
      const isPage2 = path.includes("cursor=c1");
      return { ok: true, status: 200, json: async () => (isPage2 ? pointsPage2 : pointsPage1) };
    }
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
  let app = null;
  return {
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
        await app.actions.registerRemote({ name: "Ana", email: `p${Math.random()}@t.com`, password: "x" });
      });
      await flush();
      await flush();
    },
    unmount() {
      act(() => root.unmount());
      container.remove();
    },
  };
}

beforeEach(() => {
  localStorage.clear();
  pointsStatus = 200;
  pointsPage1 = {
    balance: 340,
    transactions: [
      { id: 3, amount: 20, reason: "checkin", source_type: "check_in", source_id: 3, created_at: "2026-09-03T10:00:00Z" },
      { id: 2, amount: -600, reason: "reward_claimed", source_type: "reward_claim", source_id: 2, created_at: "2026-09-02T10:00:00Z" },
    ],
    next_cursor: "c1",
    has_more: true,
  };
  stubBackend();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("UI de puntos — Home / Profile usan GET /me/points", () => {
  it("Home muestra el saldo del backend, no el local", async () => {
    const h = mountWith(Home);
    await h.render();
    await h.register();
    expect(h.app.points.balance).toBe(340);
    expect(h.container.textContent).toContain("340");
  });

  it("sin sesión el saldo de Home es '—'", async () => {
    const h = mountWith(Home);
    await h.render();
    expect(h.app.points.status).toBe("idle");
    // La tarjeta SOMA POINTS muestra "—".
    expect(h.container.textContent).toContain("SOMA POINTS—");
    h.unmount();
  });

  it("Profile muestra el saldo y la lista de MOVIMIENTOS del backend", async () => {
    const h = mountWith(Profile);
    await h.render();
    await h.register();
    expect(h.container.textContent).toContain("MOVIMIENTOS DE PUNTOS");
    expect(h.container.textContent).toContain("Check-in");
    expect(h.container.textContent).toContain("Canje de premio");
    expect(h.container.textContent).toContain("+20");
    expect(h.container.textContent).toContain("−600");
    h.unmount();
  });

  it("Profile: 'CARGAR MÁS' pide la siguiente página con el cursor y la añade", async () => {
    const h = mountWith(Profile);
    await h.render();
    await h.register();
    expect(h.container.textContent).toContain("CARGAR MÁS");

    const btn = [...h.container.querySelectorAll("button")].find((b) => b.textContent.includes("CARGAR MÁS"));
    await act(async () => btn.click());
    await flush();
    await flush();

    expect(h.app.points.transactions.map((t) => t.id)).toEqual([3, 2, 1]);
    expect(h.container.textContent).toContain("Entrenamiento");
    expect(h.container.textContent).not.toContain("CARGAR MÁS"); // última página
    h.unmount();
  });

  it("Profile: estado vacío", async () => {
    pointsPage1 = { balance: 0, transactions: [], next_cursor: null, has_more: false };
    const h = mountWith(Profile);
    await h.render();
    await h.register();
    expect(h.container.textContent).toContain("Aún no tienes movimientos de puntos");
    h.unmount();
  });

  it("Profile: estado de error", async () => {
    pointsStatus = 500;
    const h = mountWith(Profile);
    await h.render();
    await h.register();
    expect(h.container.textContent).toContain("No se pudo cargar el historial");
    // y el saldo cae a "—", no a un valor local.
    expect(h.app.points.status).toBe("error");
    h.unmount();
  });
});
