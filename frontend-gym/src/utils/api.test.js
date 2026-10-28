import { describe, expect, it } from "vitest";
import { ApiError, apiErrorMessage } from "./api.js";

// Comprobación técnica mínima del cliente API de la foundation: la forma
// de ApiError y el mapeo a mensaje legible. No prueba lógica de negocio.
describe("ApiError / apiErrorMessage", () => {
  it("ApiError conserva status y errors", () => {
    const e = new ApiError("x", { status: 422, errors: { email: ["ya existe"] } });
    expect(e.name).toBe("ApiError");
    expect(e.status).toBe(422);
    expect(e.errors.email[0]).toBe("ya existe");
  });

  it("status 0 → mensaje de red", () => {
    expect(apiErrorMessage(new ApiError("x", { status: 0 }))).toBe("No pudimos conectar con el servidor.");
  });

  it("status 401 → mensaje de sesión expirada", () => {
    expect(apiErrorMessage(new ApiError("x", { status: 401 }))).toBe("Tu sesión expiró. Vuelve a iniciar sesión.");
  });

  it("422 con errors → primer error del backend", () => {
    const e = new ApiError("x", { status: 422, errors: { email: ["Credenciales incorrectas."] } });
    expect(apiErrorMessage(e)).toBe("Credenciales incorrectas.");
  });

  it("no-ApiError → fallback", () => {
    expect(apiErrorMessage(new Error("boom"), "fallback")).toBe("fallback");
  });
});
