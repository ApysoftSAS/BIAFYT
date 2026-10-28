/**
 * EDITOR DE RUTINA DEL COACH (slice D-COACH-PROGRAMS).
 * Monta <RoutineBuilder/> con react-dom/client + `act`, stubea `useCoach`.
 * Verifica:
 *  - carga el catálogo global y los gyms del coach;
 *  - crear una rutina llama a createAthleteProgram con el payload correcto
 *    (name + days + exercises, sin gym de referencia → reference_gym_id null);
 *  - con gym de referencia, un ejercicio cuyo equipo NO está disponible
 *    bloquea el guardado (aviso local, antes de llamar al backend).
 */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import RoutineBuilder from "./RoutineBuilder.jsx";

const createAthleteProgram = vi.fn(async () => ({ program: { id: 1 } }));
const updateAthleteProgram = vi.fn(async () => ({ program: { id: 1 } }));

const CATALOG = {
  exercises: [
    { id: 10, slug: "ex-sentadilla", name: "Sentadilla", type: "fuerza", machine_id: null },
    { id: 11, slug: "ex-prensa", name: "Prensa", type: "fuerza", machine_id: "m-prensa" },
  ],
};

const state = {
  gyms: { gym_assignments: [{ id: 1, role: "coach", gym: { id: 3, name: "KAIROS" }, branch: null }] },
  equipment: { equipment: [] }, // KAIROS tiene inventario vacío
};

// `actions` DEBE ser estable entre renders (el editor lo usa en deps de
// useEffect); un objeto nuevo por render provocaría un bucle infinito.
const ACTIONS = {
  getExerciseCatalog: vi.fn(async () => CATALOG),
  getCoachGyms: vi.fn(async () => state.gyms),
  getGymEquipment: vi.fn(async () => state.equipment),
  createAthleteProgram,
  updateAthleteProgram,
};

vi.mock("../state/CoachContext.jsx", () => ({
  useCoach: () => ({ actions: ACTIONS }),
}));

const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
const athlete = { id: 42, name: "Ana" };

describe("RoutineBuilder", () => {
  let container;
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    vi.clearAllMocks();
  });
  afterEach(() => container.remove());

  const type = (el, value) => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    setter.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  };

  it("crea una rutina sin gym de referencia con el payload correcto", async () => {
    await act(async () => {
      createRoot(container).render(
        <RoutineBuilder athlete={athlete} program={null} onBack={() => {}} onSaved={() => {}} />
      );
    });
    await flush();

    // nombre
    await act(async () => type(container.querySelector("input.input"), "Fuerza base"));

    // añadir un ejercicio desde el catálogo
    await act(async () => {
      [...container.querySelectorAll("button.btn")].find((b) => b.textContent.includes("AÑADIR EJERCICIO")).click();
    });
    await flush();
    await act(async () => {
      [...container.querySelectorAll(".card")].find((c) => c.textContent.includes("Sentadilla")).click();
    });
    await flush();

    await act(async () => {
      [...container.querySelectorAll("button.btn")].find((b) => b.textContent.trim() === "CREAR RUTINA").click();
    });
    await flush();

    expect(createAthleteProgram).toHaveBeenCalledTimes(1);
    const [athleteId, payload] = createAthleteProgram.mock.calls[0];
    expect(athleteId).toBe(42);
    expect(payload.name).toBe("Fuerza base");
    expect(payload.reference_gym_id).toBeNull();
    expect(payload.days[0].exercises[0].exercise_id).toBe(10);
  });

  it("bloquea el guardado si un ejercicio usa equipo no disponible en el gym de referencia", async () => {
    await act(async () => {
      createRoot(container).render(
        <RoutineBuilder athlete={athlete} program={null} onBack={() => {}} onSaved={() => {}} />
      );
    });
    await flush();

    await act(async () => type(container.querySelector("input.input"), "Con gym"));

    // elegir gym de referencia (KAIROS)
    await act(async () => {
      const sel = container.querySelector("select.input");
      const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, "value").set;
      setter.call(sel, "3");
      sel.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await flush();

    // añadir "Prensa" (machine m-prensa, no en inventario de KAIROS)
    await act(async () => {
      [...container.querySelectorAll("button.btn")].find((b) => b.textContent.includes("AÑADIR EJERCICIO")).click();
    });
    await flush();
    await act(async () => {
      [...container.querySelectorAll(".card")].find((c) => c.textContent.includes("Prensa")).click();
    });
    await flush();

    expect(container.textContent).toContain("no disponible en el gimnasio de referencia");

    const saveBtn = [...container.querySelectorAll("button.btn")].find((b) => b.textContent.trim() === "CREAR RUTINA");
    expect(saveBtn.disabled).toBe(true);
    expect(createAthleteProgram).not.toHaveBeenCalled();
  });
});
