/**
 * ONBOARDING — HIDRATACIÓN DE focusId DESDE EL BACKEND (regresión QA
 * HIGH). Onboarding inicializaba `focusId` en el default local
 * ("hypertrophy") y nunca llamaba `fetchProfile()`, así que un
 * focus_id real ya guardado en el backend (re-onboarding) quedaba
 * pisado por el default en el PATCH final. Este test verifica:
 *
 * 1. Con sesión y un focus_id real ya confirmado por el backend, el
 *    paso "focus" preselecciona ESE valor (nunca el default).
 * 2. Si el usuario avanza sin tocar ninguna tarjeta, el PATCH final NO
 *    incluye focus_id (mismo patrón de diff que EditProfile.jsx).
 * 3. Si el usuario selecciona una tarjeta distinta, el PATCH SÍ incluye
 *    focus_id con el nuevo valor, en un único PATCH.
 *
 * No usa @testing-library/react (mismo criterio que el resto de tests
 * de AppContext): monta <AppProvider><Onboarding/></AppProvider> con
 * react-dom/client + `act`, y navega el flujo con clicks reales sobre
 * los <button> que ya renderizan <Card>/<Button> (ver components/UI.jsx).
 */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppProvider, useApp } from "../state/AppContext.jsx";
import { actAsync } from "../state/testHarness.jsx";
import Onboarding from "./Onboarding.jsx";

vi.mock("../utils/api.js", async () => {
  const actual = await vi.importActual("../utils/api.js");
  const usersByEmail = {};
  const tokensToUser = {};
  const profilesByUserId = {};
  let seq = 1;

  return {
    ...actual,
    apiRegister: vi.fn(async ({ name, email }) => {
      const user = { id: `u-${email}`, name, email };
      usersByEmail[email] = user;
      const token = `token-${seq++}`;
      tokensToUser[token] = user;
      return { user, token };
    }),
    apiLogin: vi.fn(async ({ email }) => {
      const user = usersByEmail[email];
      if (!user) throw new actual.ApiError("Credenciales inválidas.", { status: 422 });
      const token = `token-${seq++}`;
      tokensToUser[token] = user;
      return { user, token };
    }),
    apiLogout: vi.fn(async (token) => {
      delete tokensToUser[token];
      return { message: "ok" };
    }),
    apiMe: vi.fn(async (token) => {
      const user = tokensToUser[token];
      if (!user) throw new actual.ApiError("No autenticado.", { status: 401 });
      return { user };
    }),
    apiGetProfile: vi.fn(async (token) => {
      const user = tokensToUser[token];
      return { profile: (user && profilesByUserId[user.id]) || null };
    }),
    apiUpdateProfile: vi.fn(async (token, payload) => {
      const user = tokensToUser[token];
      const merged = { ...(profilesByUserId[user.id] || {}), ...payload };
      profilesByUserId[user.id] = merged;
      return { profile: merged };
    }),
    // Solo para pruebas: precarga el Profile "ya existente en el backend"
    // de un usuario antes de montar Onboarding (simula re-onboarding).
    __setProfile: (userId, profile) => {
      profilesByUserId[userId] = profile;
    },
  };
});

function Harness({ onReady }) {
  const app = useApp();
  onReady(app);
  // Onboarding solo se muestra tras login/registro en la app real — se
  // monta aquí una vez hay sesión, para que sus useState iniciales
  // (form.name, focusId…) se capturen ya con la identidad real.
  return app.state.auth.token ? <Onboarding /> : null;
}

function mountOnboarding() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  let app = null;

  act(() => {
    root.render(
      <AppProvider>
        <Harness
          onReady={(next) => {
            app = next;
          }}
        />
      </AppProvider>
    );
  });

  return {
    container,
    get app() {
      return app;
    },
    unmount() {
      act(() => root.unmount());
      container.remove();
    },
  };
}

function findButtonByText(container, text) {
  const el = Array.from(container.querySelectorAll("button")).find((b) => b.textContent.trim() === text);
  if (!el) throw new Error(`No se encontró un <button> con texto "${text}"`);
  return el;
}

function findCardByText(container, text) {
  const el = Array.from(container.querySelectorAll("button.card")).find((b) => b.textContent.includes(text));
  if (!el) throw new Error(`No se encontró una tarjeta con texto "${text}"`);
  return el;
}

/** Click + deja drenar cualquier promesa encadenada (p.ej. updateProfile) antes de que `act` cierre el batch. */
async function clickAndSettle(container, text) {
  await actAsync(async () => {
    findButtonByText(container, text).click();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

let harness;

afterEach(() => {
  harness?.unmount();
  harness = null;
  localStorage.clear();
  vi.clearAllMocks();
});

describe("Onboarding — hidratación de focusId desde el backend", () => {
  it("con un focus_id real ya existente, avanzar sin tocar ninguna tarjeta NO envía focus_id en el PATCH", async () => {
    const apiModule = await import("../utils/api.js");
    const email = "alice.onb1@test.com";
    apiModule.__setProfile(`u-${email}`, {
      age: null,
      weight: null,
      height: null,
      months_training: null,
      level: null,
      focus_id: "strength",
    });

    harness = mountOnboarding();
    await actAsync(() => harness.app.actions.registerRemote({ name: "Alice Onboard", email, password: "x" }));
    // Hidratación diferida: el propio useEffect de montaje de Onboarding ya
    // llama fetchProfile() (no bloqueante); se re-invoca aquí para no
    // depender del timing exacto de ese efecto dentro del test.
    await actAsync(() => harness.app.actions.fetchProfile());
    expect(harness.app.state.identity.user.focusId).toBe("strength");

    const { container } = harness;
    await clickAndSettle(container, "COMENZAR"); // welcome → profile
    await clickAndSettle(container, "CONTINUAR"); // profile → gym (nombre ya viene precargado)

    findCardByText(container, "PULSO CENTER").click(); // sede única → avanza directo a "focus"
    await new Promise((resolve) => setTimeout(resolve, 0));

    // La tarjeta real ("Fuerza" / strength) llega preseleccionada — nunca
    // "Hipertrofia" (default local).
    const strengthCard = findCardByText(container, "Fuerza");
    expect(strengthCard.className).toContain("card-selected");
    const hypertrophyCard = findCardByText(container, "Hipertrofia");
    expect(hypertrophyCard.className).not.toContain("card-selected");

    await clickAndSettle(container, "CONTINUAR"); // sin tocar ninguna tarjeta

    const focusCalls = apiModule.apiUpdateProfile.mock.calls.filter(([, payload]) => "focus_id" in payload);
    expect(focusCalls.length).toBe(0);
    expect(apiModule.apiUpdateProfile.mock.calls.length).toBeLessThanOrEqual(1); // ningún PATCH adicional
    expect(harness.app.state.identity.user.focusId).toBe("strength"); // el valor real nunca se pisó
  });

  it("seleccionar una tarjeta distinta SÍ incluye focus_id con el nuevo valor, en un único PATCH", async () => {
    const apiModule = await import("../utils/api.js");
    const email = "alice.onb2@test.com";
    apiModule.__setProfile(`u-${email}`, {
      age: null,
      weight: null,
      height: null,
      months_training: null,
      level: null,
      focus_id: "strength",
    });

    harness = mountOnboarding();
    await actAsync(() => harness.app.actions.registerRemote({ name: "Alice Onboard 2", email, password: "x" }));
    await actAsync(() => harness.app.actions.fetchProfile());

    const { container } = harness;
    await clickAndSettle(container, "COMENZAR");
    await clickAndSettle(container, "CONTINUAR");

    findCardByText(container, "PULSO CENTER").click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    // Toca una tarjeta distinta a la real ("strength") antes de continuar.
    findCardByText(container, "Resistencia").click(); // focusId "endurance"
    await new Promise((resolve) => setTimeout(resolve, 0));

    await clickAndSettle(container, "CONTINUAR");

    expect(apiModule.apiUpdateProfile.mock.calls.length).toBe(1); // un único PATCH
    const [, payload] = apiModule.apiUpdateProfile.mock.calls[0];
    expect(payload.focus_id).toBe("endurance");
    expect(harness.app.state.identity.user.focusId).toBe("endurance");
  });
});
