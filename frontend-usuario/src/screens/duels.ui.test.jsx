/**
 * DUELOS REALES (roadmap 3b) — la pantalla consume `GET /me/duels` y
 * `GET /me/duels/opponents` (User reales), sin `data/users.js`.
 *
 * Integración real: <AppProvider> + <Duels>, con `global.fetch` stubeado.
 */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppProvider, useApp } from "../state/AppContext.jsx";
import Duels from "./Duels.jsx";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
vi.mock("../components/Coach.jsx", () => ({ default: () => null }));

let duelsBody = { duels: [] };
let opponentsBody = { opponents: [{ id: 7, name: "Rival Real", duels_won: 2, duels_lost: 1 }] };

function stubBackend() {
  const users = {};
  let seq = 1;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url, opts) => {
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
      if (path === "/me/duels") return { ok: true, status: 200, json: async () => duelsBody };
      if (path === "/me/duels/opponents") return { ok: true, status: 200, json: async () => opponentsBody };
      return { ok: false, status: 404, json: async () => ({ message: "nf" }) };
    })
  );
}

const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

function Grab({ onReady }) {
  onReady(useApp());
  return null;
}

function mount() {
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
            <Grab onReady={(n) => { app = n; }} />
            <Duels onStartDuelWorkout={() => {}} focusDuelId={null} onClearFocus={() => {}} />
          </AppProvider>
        );
      });
      await flush();
    },
    async register() {
      await act(async () => {
        await app.actions.registerRemote({ name: "Ana", email: `d${Math.random()}@t.com`, password: "x" });
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
  duelsBody = { duels: [] };
  opponentsBody = { opponents: [{ id: 7, name: "Rival Real", duels_won: 2, duels_lost: 1 }] };
  stubBackend();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("pantalla de duelos — datos reales del backend", () => {
  it("lista vacía: muestra el estado vacío y el botón de retar", async () => {
    const h = mount();
    await h.render();
    await h.register();
    expect(h.container.textContent).toContain("Todavía no tienes duelos terminados");
    expect(h.container.textContent).toContain("RETAR A ALGUIEN");
    h.unmount();
  });

  it("un duelo terminado ganado aparece en el historial con el signo de puntos", async () => {
    duelsBody = {
      duels: [
        {
          id: 5,
          status: "finished",
          viewer_role: "challenger",
          modality: "routine",
          stake: 150,
          challenger: { id: 1, name: "Ana" },
          opponent: { id: 7, name: "Rival Real" },
          winner_user_id: 1,
          outcome: "challenger",
          result: null,
          you_submitted: true,
          opponent_submitted: true,
        },
      ],
    };
    const h = mount();
    await h.render();
    await h.register();
    expect(h.container.textContent).toContain("vs Rival Real");
    expect(h.container.textContent).toContain("+150");
    h.unmount();
  });

  it("«RETAR A ALGUIEN» carga rivales reales desde /me/duels/opponents", async () => {
    const h = mount();
    await h.render();
    await h.register();

    const retar = [...h.container.querySelectorAll("button")].find((b) => b.textContent.includes("RETAR A ALGUIEN"));
    await act(async () => retar.click());
    await flush();

    expect(h.container.textContent).toContain("Rival Real");
    expect(h.container.textContent).toContain("2V / 1D");
    h.unmount();
  });
});
