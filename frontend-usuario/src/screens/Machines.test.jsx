/**
 * MÁQUINAS — la biblioteca consume `machineCatalog` (del backend, `GET
 * /equipment`), NO `data/machines.js`. Monta <Machines/> con
 * react-dom/client + `act`, stubea `useApp` con un catálogo "remoto".
 */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Machines from "./Machines.jsx";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// El widget flotante Coach usa su propio slice del contexto; no es parte de
// esta pantalla, se stubea.
vi.mock("../components/Coach.jsx", () => ({ default: () => null }));

const bumpChallenge = vi.fn();

// Catálogo "del backend": incluye una máquina que NO está en data/machines.js
// y renombra otra, para probar que la pantalla refleja el backend.
const REMOTE_CATALOG = [
  {
    id: "m-prensa",
    name: "PRENSA RENOMBRADA POR BIAFYT",
    purpose: "Texto de propósito remoto.",
    primary: "Cuádriceps",
    secondary: ["Glúteo mayor"],
    movement: "Empuje de tren inferior",
    level: "Principiante",
    tips: ["Consejo remoto 1"],
    mistakes: ["Error remoto 1"],
    related: ["Sentadilla"],
    art: "legPress",
  },
  {
    id: "m-nueva-BIAFYT",
    name: "MÁQUINA NUEVA CREADA POR BIAFYT",
    purpose: "No existe en machines.js.",
    primary: "Espalda",
    secondary: [],
    movement: "Tracción",
    level: "Intermedio",
    tips: [],
    mistakes: [],
    related: [],
    art: "seatedRow",
  },
];

vi.mock("../state/AppContext.jsx", () => ({
  useApp: () => ({ actions: { bumpChallenge }, machineCatalog: REMOTE_CATALOG }),
}));

const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

describe("Machines — consume el catálogo del backend", () => {
  let container;
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    vi.clearAllMocks();
  });
  afterEach(() => container.remove());

  it("lista las máquinas del catálogo remoto (nombre renombrado + máquina nueva)", async () => {
    await act(async () => { createRoot(container).render(<Machines />); });
    await flush();

    expect(container.textContent).toContain("PRENSA RENOMBRADA POR BIAFYT");
    expect(container.textContent).toContain("MÁQUINA NUEVA CREADA POR BIAFYT");
    // El nombre original de machines.js ya no aparece.
    expect(container.textContent).not.toContain("PRENSA DE PIERNAS");

    const cards = container.querySelectorAll(".machine-card");
    expect(cards.length).toBe(2);
  });

  it("la ficha muestra el contenido educativo remoto y cuenta el reto", async () => {
    await act(async () => { createRoot(container).render(<Machines />); });
    await flush();

    const card = [...container.querySelectorAll(".machine-card")].find((c) =>
      c.textContent.includes("PRENSA RENOMBRADA")
    );
    await act(async () => { card.click(); });
    await flush();

    expect(container.textContent).toContain("Texto de propósito remoto.");
    expect(container.textContent).toContain("Consejo remoto 1");
    expect(container.textContent).toContain("Error remoto 1");
    expect(bumpChallenge).toHaveBeenCalledWith(expect.any(String), "machinesViewed", 1);
  });

  it("busca por músculo sobre los datos remotos", async () => {
    await act(async () => { createRoot(container).render(<Machines />); });
    await flush();

    const input = container.querySelector("input.input");
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
      setter.call(input, "espalda");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await flush();

    expect(container.querySelectorAll(".machine-card").length).toBe(1);
    expect(container.textContent).toContain("MÁQUINA NUEVA CREADA POR BIAFYT");
  });
});
