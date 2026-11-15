/**
 * REPORTES (Couch). Monta <Reports/> con un `useCoach` simulado y verifica
 * que pinta las cifras del backend, marca a quien requiere atención, abre el
 * detalle del atleta, y muestra el vacío cuando no hay atletas activos.
 */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Reports from "./Reports.jsx";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const byHour = Array(24).fill(0);
byHour[18] = 4;
byHour[7] = 2;

const base = {
  period: { days: 30, from: "2026-10-17", to: "2026-11-15", timezone: "America/Bogota", inactive_days: 14 },
  totals: { athletes: 2, pending_requests: 1, athletes_trained: 1, needs_attention: 1, workouts: 6, workouts_per_active_athlete: 6, avg_workout_minutes: 55 },
  by_day: [{ date: "2026-11-14", workouts: 2 }, { date: "2026-11-15", workouts: 4 }],
  by_hour: byHour,
  athletes: [
    { user: { id: 7, name: "Ana Atleta" }, workouts: 6, last_activity_date: "2026-11-15", days_since: 0, current_streak: 3, athlete_since: "2026-10-01", needs_attention: false },
    { user: { id: 8, name: "Beto Ausente" }, workouts: 0, last_activity_date: null, days_since: null, current_streak: 0, athlete_since: "2026-09-01", needs_attention: true },
  ],
  coach: { routines: 2, routines_period: 1, notes: 5, notes_period: 2, videos: 3, vouchers_issued: 1, vouchers_redeemed: 0, vouchers_open: 1 },
};

let report = base;
const getReport = vi.fn(async () => ({ report }));

vi.mock("../state/CoachContext.jsx", () => ({
  useCoach: () => ({ actions: { getReport } }),
}));

const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

describe("Reportes del coach", () => {
  let container;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    vi.clearAllMocks();
    report = base;
  });
  afterEach(() => container.remove());

  it("pinta cifras, marca a quien requiere atención y abre su detalle", async () => {
    const onOpenAthlete = vi.fn();
    await act(async () => { createRoot(container).render(<Reports onOpenAthlete={onOpenAthlete} />); });
    await flush();
    await flush();

    expect(getReport).toHaveBeenCalledWith(30);
    expect(container.textContent).toContain("Atletas activos");
    expect(container.textContent).toContain("1 · 50%"); // entrenaron 1 de 2
    expect(container.textContent).toContain("55 min");
    expect(container.textContent).toContain("Atender");
    expect(container.textContent).toContain("calidad sombra");

    const row = [...container.querySelectorAll(".athlete-row")].find((b) => b.textContent.includes("Beto"));
    await act(async () => row.click());
    expect(onOpenAthlete).toHaveBeenCalledWith({ id: 8, name: "Beto Ausente" });
  });

  it("cambiar el periodo vuelve a pedir el reporte", async () => {
    await act(async () => { createRoot(container).render(<Reports onOpenAthlete={() => {}} />); });
    await flush();
    const tab = [...container.querySelectorAll("button")].find((b) => b.textContent.trim() === "7 días");
    await act(async () => tab.click());
    await flush();
    expect(getReport).toHaveBeenLastCalledWith(7);
  });

  it("sin atletas activos muestra el vacío con las solicitudes pendientes", async () => {
    report = { ...base, totals: { ...base.totals, athletes: 0, pending_requests: 2 }, athletes: [] };
    await act(async () => { createRoot(container).render(<Reports onOpenAthlete={() => {}} />); });
    await flush();
    await flush();
    expect(container.textContent).toContain("Aún no tienes atletas activos");
    expect(container.textContent).toContain("2 solicitud");
  });
});
