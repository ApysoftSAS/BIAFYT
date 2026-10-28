import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import { STORAGE_KEY } from "./config/appConfig.js";

// Deja que act(...) vacíe efectos/estado de forma determinista (necesario
// cuando un test navega con clicks, no solo el render inicial).
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

describe("App (Admin)", () => {
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

  it("sin sesión → muestra el acceso", async () => {
    await act(async () => {
      createRoot(container).render(<App />);
    });
    expect(container.textContent).toContain("BIAFYT Admin");
    expect(container.querySelector(".auth-form")).not.toBeNull();
  });

  it("con sesión pero sin is_platform_admin → 'Sin acceso'", async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ auth: { token: "t", signedIn: true, user: { id: 1, name: "A" } } }));
    vi.stubGlobal("fetch", mockApi({
      "/auth/me": { user: { id: 1, name: "A", email: "a@x.test", is_platform_admin: false } },
    }));

    await act(async () => {
      createRoot(container).render(<App />);
    });
    await flush();

    expect(container.textContent).toContain("Sin acceso");
    expect(container.querySelector(".gym-shell")).toBeNull();
  });

  it("con is_platform_admin → entra al shell (Solicitudes)", async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ auth: { token: "t", signedIn: true, user: { id: 1, name: "A" } } }));
    vi.stubGlobal("fetch", mockApi({
      "/auth/me": { user: { id: 1, name: "A", email: "a@x.test", is_platform_admin: true } },
      "/admin/gym-registration-requests": { gym_registration_requests: [] },
    }));

    await act(async () => {
      createRoot(container).render(<App />);
    });
    await flush();

    expect(container.querySelector(".gym-shell")).not.toBeNull();
    expect(container.textContent).toContain("Solicitudes de registro");
  });

  it("Catálogo → Equipamiento: lista y crea un equipamiento nuevo", async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ auth: { token: "t", signedIn: true, user: { id: 1, name: "A" } } }));
    let created = null;
    const fetchMock = vi.fn(async (url, opts) => {
      const path = String(url).replace(/^.*\/api\/v1/, "");
      if (opts?.method === "POST" && path === "/admin/equipment") {
        created = JSON.parse(opts.body);
        return { ok: true, status: 201, json: async () => ({ equipment: { id: 9, slug: "prensa-45", name: created.name, gym_count: 0, is_active: true, photo_urls: [] } }) };
      }
      const routes = {
        "/auth/me": { user: { id: 1, name: "A", email: "a@x.test", is_platform_admin: true } },
        "/admin/gym-registration-requests": { gym_registration_requests: [] },
        "/admin/equipment-requests": { equipment_requests: [] },
        "/admin/equipment": { equipment: [{ id: 8, slug: "m-prensa", name: "Prensa de piernas", brand: "Genérica", model: null, category: "Piernas", gym_count: 2, is_active: true, photo_urls: [] }] },
      };
      const match = Object.keys(routes).find((k) => path.startsWith(k));
      return { ok: Boolean(match), status: match ? 200 : 404, json: async () => (match ? routes[match] : { message: "nf" }) };
    });
    vi.stubGlobal("fetch", fetchMock);

    await act(async () => { createRoot(container).render(<App />); });
    await flush();
    const nav = [...container.querySelectorAll(".gym-nav-item")].find((b) => b.textContent.includes("Equipamiento"));
    await act(async () => { nav.click(); });
    await flush();

    expect(container.textContent).toContain("Catálogo de equipamiento");
    expect(container.textContent).toContain("Prensa de piernas");

    const newBtn = [...container.querySelectorAll("button")].find((b) => b.textContent.trim() === "Nuevo equipamiento");
    await act(async () => { newBtn.click(); });
    await flush();

    const setVal = (el, v) => {
      const proto = el.tagName === "TEXTAREA" ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, "value").set.call(el, v);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    };
    const fieldControl = (labelText) =>
      [...container.querySelectorAll("label.field")]
        .find((l) => l.textContent.includes(labelText))
        ?.querySelector("input, textarea");

    await act(async () => {
      setVal(fieldControl("Nombre"), "Prensa 45°");
      setVal(fieldControl("Músculo principal"), "Cuádriceps");
      setVal(fieldControl("Consejos"), "Pies centrados\nBaja controlado");
      setVal(fieldControl("Ilustración"), "legPress");
    });

    const createBtn = [...container.querySelectorAll("button")].find((b) => b.textContent.trim() === "CREAR");
    await act(async () => { createBtn.click(); });
    await flush();

    expect(created).toEqual(expect.objectContaining({
      name: "Prensa 45°",
      primary_muscle: "Cuádriceps",
      tips: ["Pies centrados", "Baja controlado"],
      art: "legPress",
    }));
  });

  it("Promociones: lista y crea una promoción con reglas por audiencia", async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ auth: { token: "t", signedIn: true, user: { id: 1, name: "A" } } }));
    let created = null;
    const fetchMock = vi.fn(async (url, opts) => {
      const path = String(url).replace(/^.*\/api\/v1/, "");
      if (opts?.method === "POST" && path === "/admin/promotions") {
        created = JSON.parse(opts.body);
        return {
          ok: true,
          status: 201,
          json: async () => ({
            promotion: { id: 9, code: "ANIVERSARIO2026", active: true, valid_from: null, valid_until: null, created_at: "2026-09-16T10:00:00Z", rules: created.rules },
          }),
        };
      }
      const routes = {
        "/auth/me": { user: { id: 1, name: "A", email: "a@x.test", is_platform_admin: true } },
        "/admin/gym-registration-requests": { gym_registration_requests: [] },
        "/admin/promotions": {
          promotions: [{
            id: 5, code: "WELCOME10", active: true, valid_from: null, valid_until: null, created_at: "2026-09-15T10:00:00Z",
            rules: [{ id: 1, audience: "athlete", duration_months: 12, benefit_type: "percent", benefit_value: 10 }],
          }],
        },
      };
      const match = Object.keys(routes).find((k) => path.startsWith(k));
      return { ok: Boolean(match), status: match ? 200 : 404, json: async () => (match ? routes[match] : { message: "nf" }) };
    });
    vi.stubGlobal("fetch", fetchMock);

    await act(async () => { createRoot(container).render(<App />); });
    await flush();
    const nav = [...container.querySelectorAll(".gym-nav-item")].find((b) => b.textContent.includes("Promociones"));
    await act(async () => { nav.click(); });
    await flush();

    expect(container.textContent).toContain("WELCOME10");
    expect(container.textContent).toContain("Athlete · 12m · 10%");

    const newBtn = [...container.querySelectorAll("button")].find((b) => b.textContent.trim() === "Nueva promoción");
    await act(async () => { newBtn.click(); });
    await flush();

    const setVal = (el, v) => {
      const proto = el.tagName === "SELECT" ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, "value").set.call(el, v);
      el.dispatchEvent(new Event(el.tagName === "SELECT" ? "change" : "input", { bubbles: true }));
    };
    const fieldControl = (labelText) =>
      [...container.querySelectorAll("label.field")]
        .find((l) => l.textContent.includes(labelText))
        ?.querySelector("input, textarea, select");
    const ruleRows = () => [...container.querySelectorAll(".promotion-rule-row")];

    await act(async () => {
      setVal(fieldControl("Código"), "aniversario2026");
    });

    const addRuleBtn = [...container.querySelectorAll("button")].find((b) => b.textContent.trim() === "Agregar regla");
    await act(async () => { addRuleBtn.click(); });
    await flush();

    expect(ruleRows()).toHaveLength(2);

    await act(async () => {
      const [row0, row1] = ruleRows();
      setVal(row0.querySelector('[aria-label="Audiencia"]'), "athlete");
      setVal(row0.querySelector('[aria-label="Duración"]'), "12");
      setVal(row0.querySelector('[aria-label="Valor del beneficio"]'), "15");
      setVal(row1.querySelector('[aria-label="Audiencia"]'), "coach");
      setVal(row1.querySelector('[aria-label="Duración"]'), "12");
      setVal(row1.querySelector('[aria-label="Valor del beneficio"]'), "25");
    });

    const createBtn = [...container.querySelectorAll("button")].find((b) => b.textContent.trim() === "CREAR");
    await act(async () => { createBtn.click(); });
    await flush();

    expect(created).toEqual({
      code: "aniversario2026",
      active: true,
      valid_from: null,
      valid_until: null,
      rules: [
        { audience: "athlete", duration_months: 12, benefit_type: "percent", benefit_value: 15 },
        { audience: "coach", duration_months: 12, benefit_type: "percent", benefit_value: 25 },
      ],
    });
    expect(container.querySelector(".modal-backdrop")).toBeNull();
  });

  it("Promociones: un 422 del backend (código duplicado) se muestra y no cierra el formulario", async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ auth: { token: "t", signedIn: true, user: { id: 1, name: "A" } } }));
    const fetchMock = vi.fn(async (url, opts) => {
      const path = String(url).replace(/^.*\/api\/v1/, "");
      if (opts?.method === "POST" && path === "/admin/promotions") {
        return { ok: false, status: 422, json: async () => ({ message: "The code has already been taken.", errors: { code: ["This promotion code is already in use."] } }) };
      }
      const routes = {
        "/auth/me": { user: { id: 1, name: "A", email: "a@x.test", is_platform_admin: true } },
        "/admin/gym-registration-requests": { gym_registration_requests: [] },
        "/admin/promotions": { promotions: [] },
      };
      const match = Object.keys(routes).find((k) => path.startsWith(k));
      return { ok: Boolean(match), status: match ? 200 : 404, json: async () => (match ? routes[match] : { message: "nf" }) };
    });
    vi.stubGlobal("fetch", fetchMock);

    await act(async () => { createRoot(container).render(<App />); });
    await flush();
    const nav = [...container.querySelectorAll(".gym-nav-item")].find((b) => b.textContent.includes("Promociones"));
    await act(async () => { nav.click(); });
    await flush();

    const newBtn = [...container.querySelectorAll("button")].find((b) => b.textContent.trim() === "Nueva promoción");
    await act(async () => { newBtn.click(); });
    await flush();

    const setVal = (el, v) => {
      const proto = window.HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, "value").set.call(el, v);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    };
    const fieldControl = (labelText) =>
      [...container.querySelectorAll("label.field")]
        .find((l) => l.textContent.includes(labelText))
        ?.querySelector("input, textarea, select");

    await act(async () => {
      setVal(fieldControl("Código"), "WELCOME10");
      setVal(container.querySelector('[aria-label="Valor del beneficio"]'), "10");
    });

    const createBtn = [...container.querySelectorAll("button")].find((b) => b.textContent.trim() === "CREAR");
    await act(async () => { createBtn.click(); });
    await flush();

    expect(container.textContent).toContain("This promotion code is already in use.");
    expect(container.querySelector(".modal-backdrop")).not.toBeNull();
  });

  it("Catálogo → Solicitudes de equipo: pone una solicitud en revisión", async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ auth: { token: "t", signedIn: true, user: { id: 1, name: "A" } } }));
    let started = false;
    const pending = {
      id: 5, status: "pending", name: "Prensa Hammer", brand: "Hammer", model: null, category: null, description: null,
      photo_urls: [], review_note: null, resulting_equipment: null,
      gym: { id: 3, name: "KAIROS" }, requester: { id: 2, name: "Gino", email: "g@x.test" },
      events: [{ action: "submitted", note: null, actor: { id: 2, name: "Gino" }, at: "2026-09-10T10:00:00Z" }],
      created_at: "2026-09-10T10:00:00Z",
    };
    const fetchMock = vi.fn(async (url, opts) => {
      const path = String(url).replace(/^.*\/api\/v1/, "");
      if (opts?.method === "POST" && path === "/admin/equipment-requests/5/start-review") {
        started = true;
        return { ok: true, status: 200, json: async () => ({ equipment_request: { ...pending, status: "in_review", events: [...pending.events, { action: "review_started", actor: { id: 1, name: "A" }, at: "x" }] } }) };
      }
      const routes = {
        "/auth/me": { user: { id: 1, name: "A", email: "a@x.test", is_platform_admin: true } },
        "/admin/gym-registration-requests": { gym_registration_requests: [] },
        "/admin/equipment-requests/5": { equipment_request: pending },
        "/admin/equipment-requests": { equipment_requests: [pending] },
        "/admin/equipment": { equipment: [] },
      };
      const match = Object.keys(routes).find((k) => path.startsWith(k));
      return { ok: Boolean(match), status: match ? 200 : 404, json: async () => (match ? routes[match] : { message: "nf" }) };
    });
    vi.stubGlobal("fetch", fetchMock);

    await act(async () => { createRoot(container).render(<App />); });
    await flush();
    const nav = [...container.querySelectorAll(".gym-nav-item")].find((b) => b.textContent.includes("Solicitudes de equipo"));
    await act(async () => { nav.click(); });
    await flush();

    expect(container.textContent).toContain("Solicitudes de equipamiento");
    const open = [...container.querySelectorAll("button.link-button")].find((b) => b.textContent.includes("Prensa Hammer"));
    await act(async () => { open.click(); });
    await flush();

    const reviewBtn = [...container.querySelectorAll("button")].find((b) => b.textContent.trim() === "Poner en revisión");
    await act(async () => { reviewBtn.click(); });
    await flush();

    expect(started).toBe(true);
    expect(container.textContent).toContain("En revisión");
  });
});
