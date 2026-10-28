/**
 * MIS RUTINAS — PICKER CONTRA exerciseCatalog + PRESCRIPCIÓN POR type
 * (fase Custom Routines → Exercise Catalog).
 *
 * Antes de esta fase, el picker "+ DE LA BIBLIOTECA" leía `data/machines.js`
 * (solo 8 de 22 ejercicios) y guardaba únicamente `name` como texto libre.
 * Ahora lee `exerciseCatalog` (22 entradas reales) y congela `exerciseId`/
 * `name`/`type` en el momento de seleccionar, sin re-resolverlos nunca
 * después. Además, la fila nueva respeta el mismo contrato de campos por
 * `type` que ya usa `training.js#buildRoutine` (fuerza: sets/reps; isométrico:
 * sets/seconds; cardio: duration, sin sets/reps/seconds) — verificado por
 * `Domain Review` que `exercisePrescription.js`/`Workout.jsx` NO necesitan
 * ningún caso especial: ya interpretan cualquier fila con esa forma
 * correctamente, sea de la rutina automática o de una rutina propia.
 *
 * No usa @testing-library/react (mismo criterio que el resto de tests de
 * esta app): monta <AppProvider><MyRoutines/></AppProvider> con
 * react-dom/client + `act`, y navega con clicks/inputs reales sobre lo que
 * ya renderiza components/UI.jsx.
 */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppProvider, useApp } from "../state/AppContext.jsx";
import { mountApp, actAsync } from "../state/testHarness.jsx";
import { exercises as localExercises } from "../data/exercises.js";
import { setsFor, unitFor } from "../utils/exercisePrescription.js";
import MyRoutines from "./MyRoutines.jsx";
import { apiImportProgram } from "../utils/api.js";

const tick = () => actAsync(async () => { await new Promise((r) => setTimeout(r, 0)); });

// Rutinas del coach que devuelve el backend en cada test (por defecto ninguna
// → el atleta independiente no ve la sección "DE MI COACH").
let coachProgramsResponse = { programs: [] };
// Gym de backend del atleta e inventario (por defecto: sin gym → sin
// priorización, catálogo global exactamente como hoy).
let gymAssignmentsResponse = { gym_assignments: [] };
let gymEquipmentResponse = { equipment: [] };

vi.mock("../utils/api.js", async () => {
  const actual = await vi.importActual("../utils/api.js");
  const usersByEmail = {};
  const tokensToUser = {};
  let seq = 1;
  return {
    ...actual,
    // Copia defensiva en cada llamada (como una respuesta HTTP real): el
    // componente no debe poder mutar el "backend" por referencia.
    apiGetPrograms: vi.fn(async () => ({ programs: (coachProgramsResponse.programs ?? []).map((p) => ({ ...p })) })),
    // Marca `imported_at` en el "backend" — persistente, por atleta + programa.
    apiImportProgram: vi.fn(async (_token, id) => {
      const p = (coachProgramsResponse.programs ?? []).find((x) => x.id === id);
      if (!p) throw new actual.ApiError("No encontrado.", { status: 404 });
      if (!p.created_by) throw new actual.ApiError("No es del coach.", { status: 422 });
      p.imported_at ??= "2026-09-13T10:00:00.000000Z";
      return { program: { ...p } };
    }),
    apiGetGymAssignments: vi.fn(async () => gymAssignmentsResponse),
    apiGetGymEquipment: vi.fn(async () => gymEquipmentResponse),
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
  };
});

function Harness({ onReady }) {
  const app = useApp();
  onReady(app);
  return <MyRoutines onBack={() => {}} onTrain={() => {}} />;
}

function mountMyRoutines() {
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

async function click(container, text) {
  await actAsync(() => findButtonByText(container, text).click());
}

/**
 * Asignar `input.value = ...` directamente no dispara el `onChange` de React
 * (su `_valueTracker` interno cachea el último valor y descarta el evento
 * "input" si el DOM ya "coincide"). Se usa el setter nativo del prototipo
 * para evitar ese cacheo, mismo workaround que usa @testing-library/react.
 */
function typeInto(input, value) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  setter.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

/** Elimina la fila vacía inicial (name:"") para que `valid` permita guardar, y escribe el nombre de la rutina. */
async function clearEmptyRowAndNameRoutine(container, name) {
  const emptyRow = Array.from(container.querySelectorAll(".card")).find(
    (c) => c.querySelector('input[placeholder="Nombre del ejercicio"]')?.value === ""
  );
  if (emptyRow) await actAsync(() => emptyRow.querySelector("button.link-button.danger").click());
  const nameInput = container.querySelector('input[placeholder="Empuje — Lunes"]');
  await actAsync(() => typeInto(nameInput, name));
}

function fieldLabels(container) {
  return Array.from(container.querySelectorAll(".field-label")).map((el) => el.textContent);
}

let harness;

afterEach(() => {
  harness?.unmount();
  harness = null;
  localStorage.clear();
  vi.clearAllMocks();
  coachProgramsResponse = { programs: [] };
  gymAssignmentsResponse = { gym_assignments: [] };
  gymEquipmentResponse = { equipment: [] };
});

describe("MyRoutines — el picker usa exerciseCatalog, no machines.js", () => {
  it("A. ofrece las 22 entradas reales del catálogo, no las 8 de machines.js", async () => {
    harness = mountMyRoutines();
    const { container } = harness;
    await click(container, "+ CREAR RUTINA");
    await click(container, "+ DE LA BIBLIOTECA");

    const cards = container.querySelectorAll(".modal-body button.card");
    expect(cards.length).toBe(localExercises.length); // 22, no 8
  });

  it("B. permite seleccionar un ejercicio que NO tenía máquina asociada (no estaba en machines.js)", async () => {
    harness = mountMyRoutines();
    const { container } = harness;
    await click(container, "+ CREAR RUTINA");
    await click(container, "+ DE LA BIBLIOTECA");

    // "Sentadilla" (ex-sentadilla) no tiene machineId: el picker viejo
    // (machines.js) nunca la ofrecía.
    expect(() => findCardByText(container, "Sentadilla")).not.toThrow();
  });
});

describe("MyRoutines — prescripción por type al elegir del catálogo (1/2/3, 5/6)", () => {
  it("3. Fuerza — 'Sentadilla' mantiene sets/reps, exerciseId/name/type congelados", async () => {
    harness = mountMyRoutines();
    const { container } = harness;
    await click(container, "+ CREAR RUTINA");
    await click(container, "+ DE LA BIBLIOTECA");
    await actAsync(() => findCardByText(container, "Sentadilla").click());
    await clearEmptyRowAndNameRoutine(container, "Rutina fuerza");
    await click(container, "GUARDAR Y ACTIVAR");

    const saved = harness.app.state.identity.customRoutines.find((r) => r.name === "Rutina fuerza");
    const row = saved.exercises.find((e) => e.exerciseId === "ex-sentadilla");
    expect(row).toBeTruthy();
    expect(row.name).toBe("Sentadilla");
    expect(row.type).toBe("fuerza");
    expect(row.sets).toBe(4);
    expect(row.reps).toBe(12);
    expect(row).not.toHaveProperty("seconds");
    expect(row).not.toHaveProperty("duration");
  });

  it("1/5. Isométrico — 'Plancha' genera seconds (no reps); unitFor da value=20 y open=false", async () => {
    harness = mountMyRoutines();
    const { container } = harness;
    await click(container, "+ CREAR RUTINA");
    await click(container, "+ DE LA BIBLIOTECA");
    await actAsync(() => findCardByText(container, "Plancha").click());
    await clearEmptyRowAndNameRoutine(container, "Rutina isométrica");
    await click(container, "GUARDAR Y ACTIVAR");

    const saved = harness.app.state.identity.customRoutines.find((r) => r.name === "Rutina isométrica");
    const row = saved.exercises.find((e) => e.exerciseId === "ex-plancha");
    expect(row).toBeTruthy();
    expect(row.type).toBe("isométrico");
    expect(row.sets).toBe(4);
    expect(row.seconds).toBe(20);
    expect(row).not.toHaveProperty("reps");
    expect(row).not.toHaveProperty("duration");

    const unit = unitFor(row);
    expect(unit.value).toBe(20);
    expect(unit.open).toBe(false);
  });

  it("2/6. Cardio — 'Cinta de correr' genera duration:null sin sets/reps/seconds; setsFor=1, unitFor.open=true", async () => {
    harness = mountMyRoutines();
    const { container } = harness;
    await click(container, "+ CREAR RUTINA");
    await click(container, "+ DE LA BIBLIOTECA");
    await actAsync(() => findCardByText(container, "Cinta de correr").click());
    await clearEmptyRowAndNameRoutine(container, "Rutina cardio");
    await click(container, "GUARDAR Y ACTIVAR");

    const saved = harness.app.state.identity.customRoutines.find((r) => r.name === "Rutina cardio");
    const row = saved.exercises.find((e) => e.exerciseId === "ex-cinta-correr");
    expect(row).toBeTruthy();
    expect(row.type).toBe("cardio");
    expect(row.duration).toBeNull();
    expect(row).not.toHaveProperty("sets");
    expect(row).not.toHaveProperty("reps");
    expect(row).not.toHaveProperty("seconds");

    expect(setsFor(row)).toBe(1);
    expect(unitFor(row).open).toBe(true);
  });
});

describe("MyRoutines — el formulario de edición muestra los campos correctos por type (7/8)", () => {
  it("7. Editar una fila isométrica muestra 'Segundos', no 'Reps'", async () => {
    harness = mountMyRoutines();
    const { container } = harness;
    await click(container, "+ CREAR RUTINA");
    await click(container, "+ DE LA BIBLIOTECA");
    await actAsync(() => findCardByText(container, "Plancha").click());
    await clearEmptyRowAndNameRoutine(container, "Rutina isométrica edit");
    await click(container, "GUARDAR Y ACTIVAR");

    await click(container, "EDITAR");
    const labels = fieldLabels(container);
    expect(labels).toContain("Segundos");
    expect(labels).not.toContain("Reps");
    expect(labels).toContain("Series");
    expect(labels).toContain("Descanso (s)");
  });

  it("8. Editar una fila cardio muestra únicamente Descanso (sin Series/Reps/Segundos)", async () => {
    harness = mountMyRoutines();
    const { container } = harness;
    await click(container, "+ CREAR RUTINA");
    await click(container, "+ DE LA BIBLIOTECA");
    await actAsync(() => findCardByText(container, "Cinta de correr").click());
    await clearEmptyRowAndNameRoutine(container, "Rutina cardio edit");
    await click(container, "GUARDAR Y ACTIVAR");

    await click(container, "EDITAR");
    const labels = fieldLabels(container);
    expect(labels).not.toContain("Series");
    expect(labels).not.toContain("Reps");
    expect(labels).not.toContain("Segundos");
    expect(labels).toContain("Descanso (s)");
  });
});

describe("MyRoutines — compatibilidad con rutinas legacy (4, 9)", () => {
  it("F. una rutina legacy (solo name, sin exerciseId/type) se sigue mostrando, activando y editando sin lanzar", async () => {
    harness = mountMyRoutines();
    const { container } = harness;

    await actAsync(() => {
      harness.app.setState((prev) => ({
        ...prev,
        identity: {
          ...prev.identity,
          customRoutines: [
            {
              id: "r-legacy",
              name: "Rutina legacy",
              focusId: "hypertrophy",
              exercises: [{ id: "ex-legacy1", name: "Ejercicio de texto libre viejo", sets: 3, reps: 10, rest: 60 }],
              updatedAt: "2020-01-01T00:00:00.000Z",
            },
          ],
          activeRoutineId: "r-legacy",
        },
      }));
    });

    // La tarjeta de la rutina legacy renderiza (findCardByText no lanza,
    // implícito en que "EDITAR" existe y es clicable a continuación).
    await click(container, "EDITAR");
    const exerciseInput = container.querySelector('input[placeholder="Nombre del ejercicio"]');
    expect(exerciseInput).not.toBeNull();
    expect(exerciseInput.value).toBe("Ejercicio de texto libre viejo");
    // Sin type → formulario legacy (Series/Reps/Descanso), igual que siempre.
    const labels = fieldLabels(container);
    expect(labels).toContain("Reps");
  });

  it("9. G. abrir y guardar una rutina legacy sin tocar nada no inventa un exerciseId por matching de name", async () => {
    harness = mountMyRoutines();
    const { container } = harness;

    await actAsync(() => {
      harness.app.setState((prev) => ({
        ...prev,
        identity: {
          ...prev.identity,
          customRoutines: [
            {
              id: "r-legacy",
              name: "Rutina legacy",
              focusId: "hypertrophy",
              // Nombre que coincide EXACTO con un ejercicio real del catálogo:
              // si existiera una heurística de matching por texto, aquí es
              // donde se dispararía. No debe hacerlo.
              exercises: [{ id: "ex-legacy1", name: "Sentadilla", sets: 3, reps: 10, rest: 60 }],
              updatedAt: "2020-01-01T00:00:00.000Z",
            },
          ],
          activeRoutineId: "r-legacy",
        },
      }));
    });

    await click(container, "EDITAR");
    await click(container, "GUARDAR Y ACTIVAR");

    const saved = harness.app.state.identity.customRoutines.find((r) => r.id === "r-legacy");
    const row = saved.exercises.find((e) => e.id === "ex-legacy1");
    expect(row.name).toBe("Sentadilla");
    expect(row.exerciseId).toBeUndefined(); // nunca se infiere, ni siquiera con match exacto de texto
    expect(row.type).toBeUndefined();
  });
});

describe("MyRoutines — CRUD sigue funcionando, '+ AÑADIR EJERCICIO' manual conserva shape legacy (4)", () => {
  it("crear (con ejercicio manual), editar y borrar una rutina custom", async () => {
    harness = mountMyRoutines();
    const { container } = harness;

    await click(container, "+ CREAR RUTINA");
    const nameInput = container.querySelector('input[placeholder="Empuje — Lunes"]');
    await actAsync(() => typeInto(nameInput, "Mi rutina"));
    const exNameInput = container.querySelector('input[placeholder="Nombre del ejercicio"]');
    await actAsync(() => typeInto(exNameInput, "Ejercicio manual"));
    await click(container, "GUARDAR Y ACTIVAR");

    let saved = harness.app.state.identity.customRoutines.find((r) => r.name === "Mi rutina");
    expect(saved).toBeTruthy();
    expect(harness.app.state.identity.activeRoutineId).toBe(saved.id);
    // "+ AÑADIR EJERCICIO" manual: shape legacy exacto, sin exerciseId/type.
    const manualRow = saved.exercises[0];
    expect(manualRow.name).toBe("Ejercicio manual");
    expect(manualRow.sets).toBe(4);
    expect(manualRow.reps).toBe(12);
    expect(manualRow.rest).toBe(60);
    expect(manualRow.exerciseId).toBeUndefined();
    expect(manualRow.type).toBeUndefined();

    // Editar: cambia el nombre.
    await click(container, "EDITAR");
    const editNameInput = container.querySelector('input[placeholder="Empuje — Lunes"]');
    await actAsync(() => typeInto(editNameInput, "Mi rutina editada"));
    await click(container, "GUARDAR Y ACTIVAR");
    saved = harness.app.state.identity.customRoutines.find((r) => r.id === saved.id);
    expect(saved.name).toBe("Mi rutina editada");

    // Borrar.
    await click(container, "BORRAR");
    expect(harness.app.state.identity.customRoutines.find((r) => r.name === "Mi rutina editada")).toBeUndefined();
    expect(harness.app.state.identity.activeRoutineId).toBeNull();
  });

  const COACH_PROGRAMS = () => ({
    programs: [
      // rutina propia del atleta (created_by null) — NO debe salir en "DE MI COACH"
      { id: 1, name: "Mía", reference_gym: null, created_by: null, imported_at: null, days: [] },
      // rutina del coach
      {
        id: 2,
        name: "Plan del coach",
        reference_gym: { id: 3, name: "KAIROS" },
        created_by: { id: 9, name: "Marta" },
        imported_at: null,
        days: [
          {
            id: 20,
            name: "Día 1",
            position: 1,
            exercises: [
              { id: 200, position: 1, exercise: { id: 10, slug: "ex-sentadilla", name: "Sentadilla", type: "fuerza", machine_id: null } },
              { id: 201, position: 2, exercise: { id: 12, slug: "ex-cinta-correr", name: "Cinta de correr", type: "cardio", machine_id: "m-cinta" } },
            ],
          },
        ],
      },
    ],
  });

  it("DE MI COACH: muestra las rutinas del coach y 'COPIAR A MIS RUTINAS' las vuelve locales y editables", async () => {
    coachProgramsResponse = COACH_PROGRAMS();

    harness = mountMyRoutines();
    const { container } = harness;
    await actAsync(() => harness.app.actions.registerRemote({ name: "Ath", email: "ath.coach@test.com", password: "x" }));
    await tick();

    expect(container.textContent).toContain("DE MI COACH");
    expect(container.textContent).toContain("Plan del coach");
    expect(container.textContent).toContain("Marta");
    expect(container.textContent).toContain("KAIROS");

    await click(container, "COPIAR A MIS RUTINAS");
    await tick();

    // 1. La copia existe como rutina local, activa y editable.
    const copied = harness.app.state.identity.customRoutines.find((r) => r.name === "Plan del coach");
    expect(copied).toBeTruthy();
    expect(copied.exercises).toHaveLength(2);
    expect(copied.exercises[0].exerciseId).toBe(10);
    expect(copied.exercises[1].type).toBe("cardio");
    expect(harness.app.state.identity.activeRoutineId).toBe(copied.id);

    // 2. La importación se registró en el backend (persistente, no por nombre).
    expect(apiImportProgram).toHaveBeenCalledWith(harness.app.state.auth.token, 2);

    // 3. Desaparece de "DE MI COACH" y NO queda un botón de copiar para ella.
    expect(container.textContent).not.toContain("DE MI COACH");
    expect(Array.from(container.querySelectorAll("button")).some((b) => b.textContent.includes("COPIAR A MIS RUTINAS"))).toBe(false);

    // Ahora es una rutina local normal: se puede editar.
    await click(container, "EDITAR");
    expect(container.querySelector('input[placeholder="Empuje — Lunes"]').value).toBe("Plan del coach");
  });

  it("IMPORTACIÓN PERSISTENTE: una rutina ya importada NO reaparece al recargar la pantalla", async () => {
    coachProgramsResponse = COACH_PROGRAMS();

    harness = mountMyRoutines();
    await actAsync(() => harness.app.actions.registerRemote({ name: "Ath", email: "ath.persist@test.com", password: "x" }));
    await tick();
    await click(harness.container, "COPIAR A MIS RUTINAS");
    await tick();
    harness.unmount();

    // Remonta: el backend ya devuelve `imported_at` puesto para el programa 2.
    harness = mountMyRoutines();
    await actAsync(() => harness.app.actions.loginRemote({ email: "ath.persist@test.com", password: "x" }));
    await tick();

    // La sección "DE MI COACH" no vuelve, ni su botón de copiar (la copia
    // local SÍ sigue existiendo, con el mismo nombre, en "mis rutinas").
    expect(harness.container.textContent).not.toContain("DE MI COACH");
    expect(Array.from(harness.container.querySelectorAll("button")).some((b) => b.textContent.includes("COPIAR A MIS RUTINAS"))).toBe(false);
    expect(harness.app.state.identity.customRoutines.some((r) => r.name === "Plan del coach")).toBe(true);
  });

  it("IMPORTACIÓN PERSISTENTE: un programa del coach que YA viene con imported_at no se ofrece", async () => {
    coachProgramsResponse = COACH_PROGRAMS();
    coachProgramsResponse.programs[1].imported_at = "2026-09-01T00:00:00.000000Z";

    harness = mountMyRoutines();
    await actAsync(() => harness.app.actions.registerRemote({ name: "Ath", email: "ath.pre@test.com", password: "x" }));
    await tick();

    expect(harness.container.textContent).not.toContain("DE MI COACH");
    expect(apiImportProgram).not.toHaveBeenCalled();
  });

  it("PRIORIZACIÓN GYM: con gym backend + inventario, marca y ordena primero lo disponible sin ocultar nada", async () => {
    gymAssignmentsResponse = {
      gym_assignments: [{ id: 1, role: "member", gym: { id: 3, name: "KAIROS" }, branch: { id: 1, name: "Norte" } }],
    };
    gymEquipmentResponse = {
      equipment: [
        { id: 8, slug: "m-prensa", name: "PRENSA DE PIERNAS", available: true },
        { id: 9, slug: "m-cinta", name: "CINTA DE CORRER", available: false }, // fuera de servicio → NO prioriza
      ],
    };

    harness = mountMyRoutines();
    const { container } = harness;
    await actAsync(() => harness.app.actions.registerRemote({ name: "Ath", email: "ath.gym@test.com", password: "x" }));
    await actAsync(async () => { await new Promise((r) => setTimeout(r, 0)); });

    await click(container, "+ CREAR RUTINA");
    await click(container, "+ DE LA BIBLIOTECA");

    const cards = Array.from(container.querySelectorAll("button.card"));
    // Todo el catálogo sigue visible.
    expect(cards.length).toBe(localExercises.length);
    // El primero es el que usa m-prensa (disponible en KAIROS).
    expect(cards[0].textContent).toContain("Prensa de piernas");
    expect(cards[0].textContent).toContain("Disponible en tu gym");
    // "Cinta de correr" (m-cinta, no disponible) NO lleva el badge.
    const cinta = cards.find((c) => c.textContent.includes("Cinta de correr"));
    expect(cinta.textContent).not.toContain("Disponible en tu gym");
    // Nota de contexto con el nombre del gym.
    expect(container.textContent).toContain("disponibles en KAIROS aparecen primero");
  });

  it("PRIORIZACIÓN GYM: sin gym backend, el picker es exactamente el catálogo global (sin badges ni nota)", async () => {
    // gymAssignmentsResponse queda vacío (default del beforeEach implícito)
    harness = mountMyRoutines();
    const { container } = harness;
    await actAsync(() => harness.app.actions.registerRemote({ name: "Solo", email: "solo.gym@test.com", password: "x" }));
    await actAsync(async () => { await new Promise((r) => setTimeout(r, 0)); });

    await click(container, "+ CREAR RUTINA");
    await click(container, "+ DE LA BIBLIOTECA");

    expect(container.querySelectorAll("button.card").length).toBe(localExercises.length);
    expect(container.textContent).not.toContain("Disponible en tu gym");
    expect(container.textContent).not.toContain("aparecen primero");
  });
});

describe("MyRoutines — Identity isolation (10): A → B → A", () => {
  it("customRoutines y activeRoutineId de A no se ven en B, y reaparecen intactos al volver a A", async () => {
    const h = mountApp();
    try {
      await actAsync(() => h.app.actions.registerRemote({ name: "Alice", email: "alice.routines@test.com", password: "x" }));
      let id;
      await actAsync(() => {
        id = h.app.actions.saveRoutine({
          name: "Rutina de Alice",
          focusId: "hypertrophy",
          exercises: [{ id: "ex-1", exerciseId: "ex-sentadilla", name: "Sentadilla", type: "fuerza", sets: 4, reps: 10, rest: 60 }],
        });
      });
      await actAsync(() => h.app.actions.setActiveRoutine(id));

      expect(h.app.state.identity.customRoutines.length).toBe(1);
      expect(h.app.state.identity.activeRoutineId).toBe(id);

      await actAsync(() => h.app.actions.signOut());
      await actAsync(() => h.app.actions.registerRemote({ name: "Bob", email: "bob.routines@test.com", password: "x" }));

      expect(h.app.state.identity.customRoutines).toEqual([]);
      expect(h.app.state.identity.activeRoutineId).toBeNull();

      await actAsync(() => h.app.actions.signOut());
      await actAsync(() => h.app.actions.loginRemote({ email: "alice.routines@test.com", password: "x" }));

      expect(h.app.state.identity.customRoutines.length).toBe(1);
      expect(h.app.state.identity.customRoutines[0].name).toBe("Rutina de Alice");
      expect(h.app.state.identity.activeRoutineId).toBe(id);
    } finally {
      h.unmount();
    }
  });
});
