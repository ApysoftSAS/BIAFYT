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

  it("Sedes y Vouchers: listan datos reales del gym y el menú muestra todas las secciones de gestión", async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ auth: { token: "t", signedIn: true, user: { id: 1, name: "A" } } }));
    vi.stubGlobal("fetch", mockApi({
      "/auth/me": { user: { id: 1, name: "A", email: "a@x.test" } },
      "/me/gym-assignments": { gym_assignments: [{ id: 7, role: "gym_admin", gym: { id: 3, name: "KAIROS" }, branch: null }] },
      "/me/gym/3/members": { members: [{ id: 4, user: { id: 9, name: "Ana Atleta" }, role: "member", branch: { id: 1, name: "Norte" }, since: null }] },
      "/me/gym/3/coaches": { coaches: [] },
      "/me/gym/3/branches": { branches: [{ id: 1, name: "Norte", members_count: 1 }] },
      "/me/gym/3/voucher-campaigns": { campaigns: [] },
      "/me/gym/3/vouchers": { vouchers: [{ id: 2, code: "VCH-ABC", athlete: { id: 9, name: "Ana Atleta" }, title: "Clase gratis", benefit_type: "percent", benefit_value: 20, benefit_description: "x", status: "issued", expires_at: null }], next_cursor: null, has_more: false },
      "/gyms": { gyms: [{ id: 3, name: "KAIROS", branches: [{ id: 1, name: "Norte" }] }] },
    }));

    await act(async () => {
      createRoot(container).render(<App />);
    });
    await flush();

    const nav = (label) => [...container.querySelectorAll(".gym-nav-item")].find((b) => b.textContent.includes(label));
    expect(nav("Sedes").disabled).toBe(false);
    expect(nav("Staff")).toBeUndefined(); // ya no es "próximamente": se gestiona dentro de Espacio

    await act(async () => nav("Sedes").click());
    await flush();
    expect(container.textContent).toContain("Sedes (1)");
    // La única sede no se puede eliminar.
    expect([...container.querySelectorAll("button")].find((b) => b.textContent === "Eliminar").disabled).toBe(true);

    await act(async () => nav("Vouchers").click());
    await flush();
    expect(container.textContent).toContain("VCH-ABC");
    expect(container.textContent).toContain("20% de descuento");
    expect(container.textContent).toContain("Marcar usado");
  });

  it("Reportes: muestra cifras, horas pico y miembros sin asistir; vacío si no hay miembros", async () => {
    const heat = Array.from({ length: 7 }, () => Array(24).fill(0));
    heat[0][18] = 3;
    heat[2][7] = 1;
    const byHour = Array(24).fill(0);
    byHour[18] = 3;
    byHour[7] = 1;
    const report = (members) => ({
      period: { days: 30, from: "2026-10-17", to: "2026-11-15", timezone: "America/Bogota", stay_hours_estimate: 3, inactive_days: 14 },
      branch_id: null,
      totals: { members, coaches: 1, new_members: 0, active_members: members ? 2 : 0, inactive_members: members ? 1 : 0, check_ins: members ? 4 : 0, check_ins_today: 1, inside_now_estimate: 1, visits_per_active_member: 2, avg_stay_minutes: 75, stays_measured: 2, workouts: 3, avg_workout_minutes: 50 },
      by_day: [{ date: "2026-11-14", check_ins: 1 }, { date: "2026-11-15", check_ins: 3 }],
      by_hour: byHour,
      by_weekday_hour: heat,
      peak_hours: [{ hour: 18, check_ins: 3 }, { hour: 7, check_ins: 1 }],
      by_branch: [{ id: 1, name: "Norte", members: 2, check_ins: 4, active_members: 2 }],
      inactive_members: [{ user: { id: 9, name: "Pedro Ausente" }, branch: { id: 1, name: "Norte" }, last_check_in_date: null, days_since: null, member_since: "2026-08-22" }],
      vouchers: { issued: 1, redeemed: 0, open: 1 },
    });

    for (const members of [2, 0]) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ auth: { token: "t", signedIn: true, user: { id: 1, name: "A" } } }));
      vi.stubGlobal("fetch", mockApi({
        "/auth/me": { user: { id: 1, name: "A", email: "a@x.test" } },
        "/me/gym-assignments": { gym_assignments: [{ id: 7, role: "gym_admin", gym: { id: 3, name: "KAIROS" }, branch: null }] },
        "/me/gym/3/members": { members: [] },
        "/me/gym/3/coaches": { coaches: [] },
        "/me/gym/3/reports": { report: report(members) },
        "/gyms": { gyms: [{ id: 3, name: "KAIROS", branches: [{ id: 1, name: "Norte" }] }] },
      }));
      const root = createRoot(container);
      await act(async () => root.render(<App />));
      await flush();
      const nav = [...container.querySelectorAll(".gym-nav-item")].find((b) => b.textContent.includes("Reportes"));
      await act(async () => nav.click());
      await flush();
      await flush();

      if (members) {
        expect(container.textContent).toContain("Horas pico");
        expect(container.textContent).toContain("18:00 · 07:00");
        expect(container.textContent).toContain("Pedro Ausente");
        expect(container.textContent).toContain("Nunca");
        expect(container.textContent).toContain("No es un conteo de acceso físico");
        expect(container.querySelectorAll(".heat-cell").length).toBeGreaterThan(7 * 6);
      } else {
        expect(container.textContent).toContain("Aún no hay miembros");
      }
      await act(async () => root.unmount());
      localStorage.clear();
    }
  });

  it("Staff (recepción): solo ve Resumen, Espacio, Vouchers y Cuenta; no emite vouchers ni gestiona coaches", async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ auth: { token: "t", signedIn: true, user: { id: 1, name: "Recepción" } } }));
    vi.stubGlobal("fetch", mockApi({
      "/auth/me": { user: { id: 1, name: "Recepción", email: "r@x.test" } },
      "/me/gym-assignments": { gym_assignments: [{ id: 7, role: "staff", gym: { id: 3, name: "KAIROS" }, branch: null }] },
      "/me/gym/3/members": { members: [{ id: 4, user: { id: 9, name: "Ana Atleta" }, role: "member", branch: { id: 1, name: "Norte" }, since: null }] },
      "/me/gym/3/coaches": { coaches: [{ id: 5, user: { id: 8, name: "Carlos Coach" }, role: "coach", branch: null, since: null }] },
      "/me/gym/3/vouchers": { vouchers: [{ id: 2, code: "VCH-ABC", athlete: { id: 9, name: "Ana Atleta" }, title: "Clase gratis", benefit_type: "text", benefit_value: null, benefit_description: "Una clase", status: "issued", expires_at: null }], next_cursor: null, has_more: false },
      "/gyms": { gyms: [{ id: 3, name: "KAIROS", branches: [{ id: 1, name: "Norte" }] }] },
    }));

    await act(async () => {
      createRoot(container).render(<App />);
    });
    await flush();

    const labels = [...container.querySelectorAll(".gym-nav-item")].map((b) => b.textContent.trim());
    expect(labels.some((l) => l.includes("Resumen"))).toBe(true);
    expect(labels.some((l) => l.includes("Espacio"))).toBe(true);
    expect(labels.some((l) => l.includes("Vouchers"))).toBe(true);
    for (const hidden of ["Reportes", "Sedes", "Inventario"]) expect(labels.some((l) => l.includes(hidden))).toBe(false);

    const nav = (label) => [...container.querySelectorAll(".gym-nav-item")].find((b) => b.textContent.includes(label));
    await act(async () => nav("Espacio").click());
    await flush();
    expect(container.textContent).toContain("Ana Atleta");
    expect(container.textContent).toContain("Carlos Coach");
    expect(container.textContent).not.toContain("Staff (");
    // Revocar solo en la tabla de miembros: 1 botón (el del coach no existe).
    expect([...container.querySelectorAll("button")].filter((b) => b.textContent === "Revocar")).toHaveLength(1);

    await act(async () => nav("Vouchers").click());
    await flush();
    expect(container.textContent).toContain("VCH-ABC");
    expect(container.textContent).toContain("Marcar usado");
    expect(container.textContent).not.toContain("Emitir voucher");
    expect(container.textContent).not.toContain("Anular");
  });

  it("Vouchers: emisión masiva y código compartido con cupo", async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ auth: { token: "t", signedIn: true, user: { id: 1, name: "A" } } }));
    const calls = [];
    const bodies = {
      "/auth/me": { user: { id: 1, name: "A", email: "a@x.test" } },
      "/me/gym-assignments": { gym_assignments: [{ id: 7, role: "gym_admin", gym: { id: 3, name: "KAIROS" }, branch: null }] },
      "/me/gym/3/members": { members: [{ id: 4, user: { id: 9, name: "Ana Atleta" }, role: "member", branch: { id: 1, name: "Norte" }, since: null }] },
      "/me/gym/3/vouchers/bulk": { issued: 1 },
      "/me/gym/3/voucher-campaigns": { campaigns: [{ id: 5, code: "PRIMEROS", title: "Promo", benefit_type: "text", benefit_description: "Una clase", max_claims: 10, claimed: 3, expires_at: null, status: "active" }], campaign: { id: 6, code: "VERANO30" } },
      "/me/gym/3/vouchers": { vouchers: [], next_cursor: null, has_more: false },
      "/gyms": { gyms: [{ id: 3, name: "KAIROS", branches: [{ id: 1, name: "Norte" }] }] },
    };
    vi.stubGlobal("fetch", vi.fn(async (url, opts = {}) => {
      const path = String(url).split("/api/v1").pop();
      calls.push({ method: opts.method ?? "GET", path, body: opts.body ? JSON.parse(opts.body) : null });
      const key = Object.keys(bodies).filter((k) => path.startsWith(k)).sort((x, y) => y.length - x.length)[0];
      return { ok: Boolean(key), status: key ? 200 : 404, json: async () => (key ? bodies[key] : {}) };
    }));

    const setValue = (el, value) => {
      const proto = el.tagName === "SELECT" ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, "value").set.call(el, value);
      el.dispatchEvent(new Event(el.tagName === "SELECT" ? "change" : "input", { bubbles: true }));
    };
    const field = (label) => [...container.querySelectorAll("label.field")].find((l) => l.textContent.includes(label))?.querySelector("input,select");
    const button = (text) => [...container.querySelectorAll("button")].find((b) => b.textContent.trim().startsWith(text));

    await act(async () => { createRoot(container).render(<App />); });
    await flush();
    await act(async () => [...container.querySelectorAll(".gym-nav-item")].find((b) => b.textContent.includes("Vouchers")).click());
    await flush();
    await flush();

    // La tabla de códigos compartidos muestra canjes y cupo.
    expect(container.textContent).toContain("PRIMEROS");
    expect(container.textContent).toContain("3 / 10");

    // A varios miembros → todos
    await act(async () => button("A varios miembros").click());
    await act(async () => { setValue(field("Título"), "Clase gratis"); setValue(field("Descripción"), "Una clase de cortesía"); setValue(field("Vigencia"), "30"); });
    await act(async () => button("EMITIR A 1 MIEMBRO").click());
    await flush();
    const bulk = calls.find((c) => c.path.endsWith("/vouchers/bulk"));
    expect(bulk.method).toBe("POST");
    expect(bulk.body).toMatchObject({ scope: "all", title: "Clase gratis", valid_days: 30 });
    expect(container.textContent).toContain("Se emitieron 1 vouchers");

    // Código compartido con cupo
    await act(async () => button("Código compartido").click());
    await act(async () => { setValue(field("Título"), "Promo verano"); setValue(field("Descripción"), "Una clase"); setValue(field("Código"), "verano 30!"); setValue(field("Cupo"), "50"); });
    await act(async () => button("CREAR CÓDIGO").click());
    await flush();
    const campaign = calls.find((c) => c.method === "POST" && c.path.endsWith("/voucher-campaigns"));
    expect(campaign.body).toMatchObject({ code: "verano30", max_claims: 50, title: "Promo verano" });
    expect(campaign.body).not.toHaveProperty("expires_at");
    expect(container.textContent).toContain("Código creado: VERANO30");
  });
});
