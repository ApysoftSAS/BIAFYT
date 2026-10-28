/**
 * MÁQUINAS — prueba de integración del wire COMPLETO sin tocar código:
 *   fetch(GET /equipment) → data/equipmentCatalog.js → AppContext.machineCatalog → Machines.jsx
 *
 * Stubea `global.fetch` (como haría el backend real), monta el AppProvider
 * REAL + <Machines/>, y comprueba que:
 *  - una máquina nueva "del backend" aparece en la pantalla;
 *  - un cambio de nombre/ficha "en el backend" se refleja al recargar;
 *  - una máquina desactivada (ausente de /equipment) desaparece.
 */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppProvider } from "../state/AppContext.jsx";
import Machines from "./Machines.jsx";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
vi.mock("../components/Coach.jsx", () => ({ default: () => null }));

// Payload que "sirve" el backend en cada montaje (mutable entre fases).
let equipmentPayload = { equipment: [] };

function stubFetch() {
  vi.stubGlobal("fetch", vi.fn(async (url) => {
    const path = String(url).replace(/^.*\/api\/v1/, "");
    if (path.startsWith("/equipment")) {
      return { ok: true, status: 200, json: async () => equipmentPayload };
    }
    // Cualquier otra llamada del arranque (p.ej. /exercises): que caiga al
    // fallback local sin romper.
    return { ok: false, status: 404, json: async () => ({ message: "nf" }) };
  }));
}

const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

function mount() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  return { container, root, unmount: () => { act(() => root.unmount()); container.remove(); } };
}

const backendItem = (over = {}) => ({
  id: 99,
  slug: "m-remo-e2e",
  name: "REMO EN MÁQUINA (creada por BIAFYT)",
  description: null,
  brand: "E2Egym",
  model: "RM-1",
  category: "Espalda",
  photo_urls: [],
  purpose: "Tracción horizontal guiada.",
  primary_muscle: "Dorsal ancho",
  secondary_muscles: ["Romboides", "Bíceps"],
  movement: "Tracción horizontal",
  level: "Principiante",
  tips: ["Espalda neutra", "Codos pegados"],
  mistakes: ["Encoger los hombros"],
  related: ["Remo con barra"],
  art: "seatedRow",
  ...over,
});

describe("Machines — integración fetch → catálogo → pantalla", () => {
  beforeEach(() => {
    localStorage.clear();
    equipmentPayload = { equipment: [] };
    stubFetch();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("1) una máquina nueva del backend aparece en la pantalla", async () => {
    equipmentPayload = { equipment: [backendItem()] };
    const h = mount();
    await act(async () => { h.root.render(<AppProvider><Machines /></AppProvider>); });
    await flush();
    await flush();

    expect(h.container.textContent).toContain("REMO EN MÁQUINA (creada por BIAFYT)");
    // La ficha
    const card = [...h.container.querySelectorAll(".machine-card")].find((c) => c.textContent.includes("REMO EN MÁQUINA"));
    await act(async () => { card.click(); });
    await flush();
    expect(h.container.textContent).toContain("Tracción horizontal guiada.");
    expect(h.container.textContent).toContain("Espalda neutra");
    h.unmount();
  });

  it("2) editar nombre + ficha en el backend se refleja al recargar", async () => {
    equipmentPayload = { equipment: [backendItem({ name: "REMO BAJO (renombrada)", primary_muscle: "Trapecio medio", tips: ["Consejo único tras editar"] })] };
    const h = mount();
    await act(async () => { h.root.render(<AppProvider><Machines /></AppProvider>); });
    await flush();
    await flush();

    expect(h.container.textContent).toContain("REMO BAJO (renombrada)");
    expect(h.container.textContent).toContain("Trapecio medio");
    h.unmount();
  });

  it("3) una máquina desactivada (ausente de /equipment) desaparece", async () => {
    // /equipment solo devuelve items activos → la desactivada no viene.
    equipmentPayload = {
      equipment: [
        { ...backendItem({ slug: "m-otra", name: "OTRA MÁQUINA ACTIVA" }) },
      ],
    };
    const h = mount();
    await act(async () => { h.root.render(<AppProvider><Machines /></AppProvider>); });
    await flush();
    await flush();

    expect(h.container.textContent).toContain("OTRA MÁQUINA ACTIVA");
    expect(h.container.textContent).not.toContain("REMO EN MÁQUINA");
    expect(h.container.querySelectorAll(".machine-card").length).toBe(1);
    h.unmount();
  });
});
