/**
 * MI COACH (slice D-CLIENT-COACH) — flujo aceptar / rechazar de punta a
 * punta a nivel de pantalla: monta <CoachRelationship/> con react-dom/client
 * + `act` (mismo criterio que el resto de tests, sin @testing-library),
 * stubea `../utils/api.js` y `useApp`, y hace clicks reales sobre los
 * <button> que renderiza <Button>. Verifica que:
 *  - una solicitud entrante se pinta con ACEPTAR/RECHAZAR;
 *  - ACEPTAR llama a POST .../accept y, tras recargar, el coach aparece
 *    como activo y la solicitud desaparece;
 *  - RECHAZAR llama a DELETE y, tras recargar, no queda nada.
 */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CoachRelationship from "./CoachRelationship.jsx";
import * as api from "../utils/api.js";

vi.mock("../state/AppContext.jsx", () => ({
  useApp: () => ({ state: { auth: { token: "t" }, identity: { user: { id: 20 } } } }),
}));

vi.mock("../utils/api.js", async (importActual) => {
  const actual = await importActual();
  return {
    ...actual,
    apiGetCoachRelationships: vi.fn(),
    apiAcceptCoachRelationship: vi.fn(async () => ({})),
    apiRevokeCoachRelationship: vi.fn(async () => null),
  };
});

const PENDING = {
  id: 55,
  status: "pending",
  viewer_role: "athlete",
  coach: { id: 10, name: "Marta Coach" },
  athlete: { id: 20, name: "Yo" },
  requested_at: "2026-09-07T10:00:00.000Z",
};

const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
const btn = (container, label) =>
  [...container.querySelectorAll("button.btn")].find((b) => b.textContent.trim().toUpperCase() === label);

describe("CoachRelationship — aceptar / rechazar", () => {
  let container;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    vi.clearAllMocks();
  });
  afterEach(() => {
    container.remove();
  });

  it("ACEPTAR → POST accept y el coach queda activo", async () => {
    api.apiGetCoachRelationships
      .mockResolvedValueOnce({ coach_relationships: [PENDING] })
      .mockResolvedValueOnce({ coach_relationships: [{ ...PENDING, status: "active" }] });

    await act(async () => { createRoot(container).render(<CoachRelationship onBack={() => {}} />); });
    await flush();

    expect(container.textContent).toContain("SOLICITUDES PENDIENTES");
    expect(container.textContent).toContain("Marta Coach");

    await act(async () => { btn(container, "ACEPTAR").click(); });
    await flush();

    expect(api.apiAcceptCoachRelationship).toHaveBeenCalledWith("t", 55);
    expect(api.apiRevokeCoachRelationship).not.toHaveBeenCalled();
    expect(container.textContent).toContain("TU COACH");
    expect(container.textContent).not.toContain("SOLICITUDES PENDIENTES");
  });

  it("RECHAZAR → DELETE y no queda relación", async () => {
    api.apiGetCoachRelationships
      .mockResolvedValueOnce({ coach_relationships: [PENDING] })
      .mockResolvedValueOnce({ coach_relationships: [{ ...PENDING, status: "revoked" }] });

    await act(async () => { createRoot(container).render(<CoachRelationship onBack={() => {}} />); });
    await flush();

    await act(async () => { btn(container, "RECHAZAR").click(); });
    await flush();

    expect(api.apiRevokeCoachRelationship).toHaveBeenCalledWith("t", 55);
    expect(api.apiAcceptCoachRelationship).not.toHaveBeenCalled();
    expect(container.textContent).toContain("No tienes coach asignado");
  });

  it("muestra la sección 'CONÉCTATE CON UN COACH' con QR + ID + copiar", async () => {
    api.apiGetCoachRelationships.mockResolvedValue({ coach_relationships: [] });

    await act(async () => { createRoot(container).render(<CoachRelationship onBack={() => {}} />); });
    await flush();

    expect(container.textContent).toContain("CONÉCTATE CON UN COACH");
    expect(container.textContent).toContain("TU ID DE ATLETA");
    // el ID del atleta (mock: 20) se muestra
    expect(container.textContent).toContain("20");
    // el QR se renderiza como <svg>
    expect(container.querySelector("svg")).not.toBeNull();
    // botón COPIAR ID presente
    expect(btn(container, "COPIAR ID")).toBeTruthy();
  });
});
