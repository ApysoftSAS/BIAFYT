/**
 * BIBLIOTECA → "AGREGAR A UNA RUTINA": añade la fila a una rutina propia con el
 * contrato por `type`, sin cambiar la rutina activa del usuario.
 * Mismo estilo que MyRoutines.test.jsx (sin @testing-library).
 */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { AppProvider, useApp } from "../state/AppContext.jsx";
import { actAsync } from "../state/testHarness.jsx";
import ExerciseLibrary from "./ExerciseLibrary.jsx";

const tick = (ms = 0) => actAsync(async () => { await new Promise((r) => setTimeout(r, ms)); });

function Harness({ onReady }) {
  onReady(useApp());
  return <ExerciseLibrary onBack={() => {}} />;
}

function mount() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  let app = null;
  act(() => {
    root.render(
      <AppProvider>
        <Harness onReady={(next) => { app = next; }} />
      </AppProvider>
    );
  });
  return {
    container,
    get app() { return app; },
    unmount() { act(() => root.unmount()); container.remove(); },
  };
}

const click = (el) => act(() => { el.click(); });
const byText = (root, sel, text) => [...root.querySelectorAll(sel)].find((e) => e.textContent.includes(text));

let ctx;
afterEach(() => {
  ctx?.unmount();
  ctx = null;
  localStorage.clear();
});

async function openFirstExercise() {
  await tick(50); // carga diferida de la biblioteca
  const first = ctx.container.querySelector("button.card");
  expect(first).toBeTruthy();
  click(first);
}

describe("Biblioteca → agregar a una rutina", () => {
  it("la lista carga y se puede buscar en español", async () => {
    ctx = mount();
    await tick(50);
    expect(ctx.container.textContent).toMatch(/1324 EJERCICIOS/);
    const input = ctx.container.querySelector("input.input");
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    act(() => { set.call(input, "mancuernas pecho"); input.dispatchEvent(new Event("input", { bubbles: true })); });
    expect(ctx.container.textContent).not.toMatch(/1324 EJERCICIOS/);
    expect(ctx.container.querySelectorAll("button.card").length).toBeGreaterThan(0);
  });

  it("NUEVA RUTINA crea la rutina con la fila y NO la activa", async () => {
    ctx = mount();
    await openFirstExercise();
    click(byText(ctx.container, "button", "AGREGAR A UNA RUTINA"));
    click(byText(document, "button", "NUEVA RUTINA"));
    await tick();

    const { customRoutines, activeRoutineId } = ctx.app.state.identity;
    expect(customRoutines).toHaveLength(1);
    expect(customRoutines[0].exercises).toHaveLength(1);
    expect(customRoutines[0].exercises[0].exerciseId).toMatch(/^lib-/);
    expect(activeRoutineId).toBeNull(); // sigue la rutina automática
  });

  it("agregar a una rutina existente la amplía y deja intacta la rutina activa", async () => {
    ctx = mount();
    const existing = { id: "r-1", name: "Mi rutina", focusId: "strength", exercises: [{ id: "ex-a", name: "Previo", type: "fuerza", sets: 4, reps: 12, rest: 60 }] };
    const other = { id: "r-2", name: "Otra", focusId: "strength", exercises: [{ id: "ex-b", name: "Otro", type: "fuerza", sets: 4, reps: 12, rest: 60 }] };
    await actAsync(async () => {
      ctx.app.actions.saveRoutine(existing);
      ctx.app.actions.saveRoutine(other);
      ctx.app.actions.setActiveRoutine("r-2");
    });

    await openFirstExercise();
    click(byText(ctx.container, "button", "AGREGAR A UNA RUTINA"));
    click(byText(document, ".modal button.card", "Mi rutina"));
    await tick();

    const { customRoutines, activeRoutineId } = ctx.app.state.identity;
    expect(customRoutines.find((r) => r.id === "r-1").exercises).toHaveLength(2);
    expect(customRoutines.find((r) => r.id === "r-2").exercises).toHaveLength(1);
    expect(activeRoutineId).toBe("r-2");
  });
});
