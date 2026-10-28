import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";

// @capacitor/app hace un import nativo; se stubea para jsdom.
vi.mock("@capacitor/app", () => ({
  App: { addListener: vi.fn().mockResolvedValue({ remove: vi.fn() }), exitApp: vi.fn() },
}));

const { default: App } = await import("./App.jsx");

// Smoke test técnico: la app monta en jsdom sin lanzar y, sin token
// persistido, muestra la pantalla de acceso. No prueba lógica de negocio.
describe("App (Gym) — smoke", () => {
  let container;

  beforeEach(() => {
    localStorage.clear();
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
    vi.clearAllMocks();
  });

  it("monta y renderiza el acceso cuando no hay sesión", async () => {
    await act(async () => {
      createRoot(container).render(<App />);
    });
    expect(container.textContent).toContain("BIAFYT Gym");
    expect(container.querySelector(".auth-form")).not.toBeNull();
  });
});
