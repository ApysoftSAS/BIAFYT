/**
 * ATLETAS (Couch) — "Agregar atleta": QR + ID manual.
 * Monta <Athletes/> con react-dom/client + `act` (sin @testing-library),
 * stubea `useCoach` y `qr-scanner`. Verifica que:
 *  - el flujo por ID manual sigue funcionando y llama a requestAthlete(id);
 *  - "ESCANEAR QR" abre el modal del escáner;
 *  - ninguno de los dos caminos salta el consentimiento: el único efecto es
 *    `actions.requestAthlete`, que crea la solicitud `pending`.
 */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Athletes from "./Athletes.jsx";

const requestAthlete = vi.fn(async () => ({ athlete: { name: "Ana Atleta" } }));

vi.mock("../state/CoachContext.jsx", () => ({
  useCoach: () => ({
    relationships: [],
    relationshipsLoading: false,
    actions: { requestAthlete, acceptRelationship: vi.fn(), revokeRelationship: vi.fn() },
  }),
}));

vi.mock("qr-scanner", () => ({
  default: { hasCamera: vi.fn(async () => false), scanImage: vi.fn() },
}));

const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
const btn = (container, label) =>
  [...container.querySelectorAll("button.btn")].find((b) => b.textContent.trim().toUpperCase() === label);

describe("Athletes — agregar atleta", () => {
  let container;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    vi.clearAllMocks();
  });
  afterEach(() => container.remove());

  it("flujo por ID manual: envía la solicitud y muestra el nombre devuelto", async () => {
    await act(async () => { createRoot(container).render(<Athletes onOpenAthlete={() => {}} />); });
    await flush();

    const input = container.querySelector("input.input");
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
      setter.call(input, "42");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });

    await act(async () => { btn(container, "ENVIAR SOLICITUD POR ID").click(); });
    await flush();

    expect(requestAthlete).toHaveBeenCalledWith(42);
    expect(container.textContent).toContain("Solicitud enviada a Ana Atleta.");
  });

  it("ID inválido no llama al backend", async () => {
    await act(async () => { createRoot(container).render(<Athletes onOpenAthlete={() => {}} />); });
    await flush();

    await act(async () => { btn(container, "ENVIAR SOLICITUD POR ID").click(); });
    await flush();

    expect(requestAthlete).not.toHaveBeenCalled();
    expect(container.textContent).toContain("ID de atleta válido");
  });

  it("'ESCANEAR QR' abre el modal del escáner", async () => {
    await act(async () => { createRoot(container).render(<Athletes onOpenAthlete={() => {}} />); });
    await flush();

    await act(async () => { btn(container, "ESCANEAR QR").click(); });
    await flush();

    expect(container.textContent).toContain("Escanear QR del atleta");
    expect(container.textContent).toContain("ESCANEAR DESDE IMAGEN");
    expect(requestAthlete).not.toHaveBeenCalled();
  });
});
