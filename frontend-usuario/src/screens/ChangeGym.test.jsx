/**
 * CAMBIAR GIMNASIO: con sesión lista el catálogo REAL y une al atleta por la API;
 * sin sesión usa el catálogo de ejemplo sin tocar la red.
 */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ChangeGym from "./ChangeGym.jsx";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let app;
const joinGym = vi.fn();
const selectGym = vi.fn();
vi.mock("../state/AppContext.jsx", () => ({ useApp: () => app }));

const getGyms = vi.fn();
vi.mock("../utils/api.js", async () => {
  const actual = await vi.importActual("../utils/api.js");
  return { ...actual, apiGetGyms: (...a) => getGyms(...a) };
});

const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
const click = (el) => act(async () => el.dispatchEvent(new MouseEvent("click", { bubbles: true })));
const byText = (root, text) => [...root.querySelectorAll("*")].filter((e) => e.children.length === 0 || e.tagName === "STRONG").find((e) => e.textContent.includes(text));

describe("ChangeGym", () => {
  let container;
  const base = (signedIn) => ({
    state: { auth: { signedIn, token: signedIn ? "tok" : null }, device: { gyms: [] }, identity: { user: { gymId: null } } },
    actions: { joinGym, selectGym },
    gym: null,
    branch: null,
  });
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    vi.clearAllMocks();
    getGyms.mockResolvedValue({ gyms: [{ id: 3, name: "KAIROS", branches: [{ id: 9, name: "Norte" }] }] });
  });
  afterEach(() => container.remove());

  it("con sesión: lista los gimnasios reales y une al atleta a la sede elegida", async () => {
    app = base(true);
    const onBack = vi.fn();
    joinGym.mockResolvedValue();
    await act(async () => { createRoot(container).render(<ChangeGym onBack={onBack} />); });
    await flush();

    expect(container.textContent).toContain("KAIROS");
    await click(byText(container, "KAIROS").closest("[class]"));
    await click(byText(container, "KAIROS — Norte").closest("[class]"));
    await flush();

    expect(joinGym).toHaveBeenCalledWith(expect.objectContaining({ id: 3, name: "KAIROS" }), { id: 9, name: "Norte" });
    expect(onBack).toHaveBeenCalled();
  });

  it("si la API rechaza, muestra el error y no cierra la pantalla", async () => {
    app = base(true);
    const onBack = vi.fn();
    joinGym.mockRejectedValue({ status: 0, message: "x" });
    await act(async () => { createRoot(container).render(<ChangeGym onBack={onBack} />); });
    await flush();
    await click(byText(container, "KAIROS").closest("[class]"));
    await click(byText(container, "KAIROS — Norte").closest("[class]"));
    await flush();

    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    expect(onBack).not.toHaveBeenCalled();
  });

  it("sin sesión: no llama a la API", async () => {
    app = base(false);
    await act(async () => { createRoot(container).render(<ChangeGym onBack={() => {}} />); });
    await flush();
    expect(getGyms).not.toHaveBeenCalled();
  });
});
