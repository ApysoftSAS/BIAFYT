import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import { STORAGE_KEY } from "./config/appConfig.js";

// Let React's act(...) flush effects/state deterministically (needed once a
// test drives navigation clicks, not just the initial render).
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

function mockApi(routes) {
  return vi.fn(async (url) => {
    const path = String(url).replace(/^.*\/api\/v1/, "");
    const match = Object.keys(routes).find((k) => path.startsWith(k));
    const body = match ? routes[match] : { message: "not found" };
    return {
      ok: Boolean(match),
      status: match ? 200 : 404,
      json: async () => body,
    };
  });
}

describe("App (Gym Web)", () => {
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
    expect(container.textContent).toContain("BIAFYT Gym Web");
    expect(container.querySelector(".auth-form")).not.toBeNull();
  });

  it("con sesión pero sin rol gym_admin → 'Sin acceso de Gym'", async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ auth: { token: "t", signedIn: true, user: { id: 1, name: "A" } } }));
    vi.stubGlobal("fetch", mockApi({
      "/auth/me": { user: { id: 1, name: "A", email: "a@x.test" } },
      "/me/gym-assignments": { gym_assignments: [{ id: 5, role: "member", gym: { id: 2, name: "X" }, branch: null }] },
    }));

    await act(async () => {
      createRoot(container).render(<App />);
    });
    await flush();

    expect(container.textContent).toContain("Sin acceso de Gym");
    expect(container.querySelector(".gym-shell")).toBeNull();
  });

  it("con rol gym_admin activo → entra al shell (Resumen)", async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ auth: { token: "t", signedIn: true, user: { id: 1, name: "A" } } }));
    vi.stubGlobal("fetch", mockApi({
      "/auth/me": { user: { id: 1, name: "A", email: "a@x.test" } },
      "/me/gym-assignments": { gym_assignments: [{ id: 7, role: "gym_admin", gym: { id: 3, name: "KAIROS" }, branch: null }] },
      "/me/gym/3/members": { members: [] },
      "/me/gym/3/coaches": { coaches: [] },
      "/gyms": { gyms: [{ id: 3, name: "KAIROS", branches: [{ id: 1, name: "Norte" }] }] },
    }));

    await act(async () => {
      createRoot(container).render(<App />);
    });
    await flush();

    expect(container.querySelector(".gym-shell")).not.toBeNull();
    expect(container.textContent).toContain("KAIROS");
  });

  it("Inventario: lista el catálogo global anotado y permite añadir un item", async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ auth: { token: "t", signedIn: true, user: { id: 1, name: "A" } } }));
    const putCalls = [];
    const fetchMock = vi.fn(async (url, opts) => {
      const path = String(url).replace(/^.*\/api\/v1/, "");
      if (opts?.method === "PUT" && path.startsWith("/me/gym/3/equipment/")) {
        putCalls.push(path);
        return { ok: true, status: 200, json: async () => ({ equipment: { id: 9, slug: "m-prensa", name: "PRENSA DE PIERNAS", in_inventory: true, available: true } }) };
      }
      const routes = {
        "/auth/me": { user: { id: 1, name: "A", email: "a@x.test" } },
        "/me/gym-assignments": { gym_assignments: [{ id: 7, role: "gym_admin", gym: { id: 3, name: "KAIROS" }, branch: null }] },
        "/me/gym/3/members": { members: [] },
        "/me/gym/3/coaches": { coaches: [] },
        "/me/gym/3/equipment-requests": { equipment_requests: [] },
        "/me/gym/3/equipment": {
          equipment: [
            { id: 8, slug: "m-press-pecho", name: "PRESS DE PECHO", in_inventory: true, available: true },
            { id: 9, slug: "m-prensa", name: "PRENSA DE PIERNAS", in_inventory: false, available: false },
          ],
        },
        "/gyms": { gyms: [{ id: 3, name: "KAIROS", branches: [] }] },
      };
      const match = Object.keys(routes).find((k) => path.startsWith(k));
      return { ok: Boolean(match), status: match ? 200 : 404, json: async () => (match ? routes[match] : { message: "nf" }) };
    });
    vi.stubGlobal("fetch", fetchMock);

    await act(async () => { createRoot(container).render(<App />); });
    await flush();

    const invNav = [...container.querySelectorAll(".gym-nav-item")].find((b) => b.textContent.includes("Inventario"));
    await act(async () => { invNav.click(); });
    await flush();

    expect(container.textContent).toContain("Inventario de KAIROS");
    expect(container.textContent).toContain("PRESS DE PECHO");
    expect(container.textContent).toContain("No está en el gimnasio");

    const addBtn = [...container.querySelectorAll("button")].find((b) => b.textContent.trim() === "Añadir");
    await act(async () => { addBtn.click(); });
    await flush();

    expect(putCalls.some((p) => p === "/me/gym/3/equipment/9")).toBe(true);
  });

  it("Inventario: solicita equipamiento nuevo al catálogo global", async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ auth: { token: "t", signedIn: true, user: { id: 1, name: "A" } } }));
    let created = null;
    let listResponse = { equipment_requests: [] };
    const fetchMock = vi.fn(async (url, opts) => {
      const path = String(url).replace(/^.*\/api\/v1/, "");
      if (opts?.method === "POST" && path === "/me/gym/3/equipment-requests") {
        created = JSON.parse(opts.body);
        listResponse = {
          equipment_requests: [
            { id: 1, status: "pending", name: created.name, brand: created.brand, model: created.model, review_note: null, resulting_equipment: null, events: [{ action: "submitted" }] },
          ],
        };
        return { ok: true, status: 201, json: async () => ({ equipment_request: listResponse.equipment_requests[0] }) };
      }
      if (path.startsWith("/me/gym/3/equipment-requests")) {
        return { ok: true, status: 200, json: async () => listResponse };
      }
      const routes = {
        "/auth/me": { user: { id: 1, name: "A", email: "a@x.test" } },
        "/me/gym-assignments": { gym_assignments: [{ id: 7, role: "gym_admin", gym: { id: 3, name: "KAIROS" }, branch: null }] },
        "/me/gym/3/members": { members: [] },
        "/me/gym/3/coaches": { coaches: [] },
        "/me/gym/3/equipment": { equipment: [] },
        "/gyms": { gyms: [{ id: 3, name: "KAIROS", branches: [] }] },
      };
      const match = Object.keys(routes).find((k) => path.startsWith(k));
      return { ok: Boolean(match), status: match ? 200 : 404, json: async () => (match ? routes[match] : { message: "nf" }) };
    });
    vi.stubGlobal("fetch", fetchMock);

    await act(async () => { createRoot(container).render(<App />); });
    await flush();
    const invNav = [...container.querySelectorAll(".gym-nav-item")].find((b) => b.textContent.includes("Inventario"));
    await act(async () => { invNav.click(); });
    await flush();

    // abrir el formulario
    const openBtn = [...container.querySelectorAll("button")].find((b) => b.textContent.trim() === "Solicitar nuevo equipamiento");
    await act(async () => { openBtn.click(); });
    await flush();

    const setVal = (el, v) => {
      const proto = el.tagName === "TEXTAREA" ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, "value").set.call(el, v);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    };
    const inputs = container.querySelectorAll("input.input");
    await act(async () => {
      setVal(inputs[0], "Prensa Hammer Strength"); // nombre
      setVal(inputs[1], "Hammer Strength"); // marca
    });

    const sendBtn = [...container.querySelectorAll("button")].find((b) => b.textContent.trim() === "ENVIAR SOLICITUD");
    await act(async () => { sendBtn.click(); });
    await flush();

    expect(created).toEqual(expect.objectContaining({ name: "Prensa Hammer Strength", brand: "Hammer Strength" }));
    expect(container.textContent).toContain("Prensa Hammer Strength");
    expect(container.textContent).toContain("Pendiente");
  });
});
