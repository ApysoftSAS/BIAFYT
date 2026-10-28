/**
 * checkIn() Y pointsLog (regresión QA MEDIUM) — antes de este fix,
 * checkIn() concedía puntos mutando identity.user.points/streak
 * directamente, sin pasar por el mismo registro de pointsLog que usa
 * addPoints() (ver `grantPoints` en AppContext.jsx, compartida por
 * ambas). Verifica que el check-in queda en pointsLog, sin duplicar
 * entradas, sin cambiar el monto de POINT_RULES.checkin, y sin romper
 * la regla de "un solo check-in por día".
 */
import { afterEach, describe, expect, it } from "vitest";
import { mountApp, actAsync } from "./testHarness.jsx";
import { POINT_RULES } from "../utils/validation.js";

let harness;

afterEach(() => {
  harness?.unmount();
  harness = null;
  localStorage.clear();
});

describe("AppContext — checkIn() registra en pointsLog", () => {
  it("checkIn concede POINT_RULES.checkin y registra una entrada nueva en pointsLog", async () => {
    harness = mountApp();
    const pointsBefore = harness.app.state.identity.user.points;

    let result;
    await actAsync(() => {
      result = harness.app.actions.checkIn({ gymId: "g1" });
    });

    expect(result).toBe(true);
    expect(harness.app.state.identity.user.points).toBe(pointsBefore + POINT_RULES.checkin);
    expect(harness.app.state.identity.pointsLog.length).toBe(1);
    expect(harness.app.state.identity.pointsLog[0].amount).toBe(POINT_RULES.checkin);
  });

  it("un segundo checkIn el mismo día no concede puntos de nuevo ni duplica la entrada en pointsLog", async () => {
    harness = mountApp();
    await actAsync(() => harness.app.actions.checkIn({ gymId: "g1" }));
    const pointsAfterFirst = harness.app.state.identity.user.points;
    const logLengthAfterFirst = harness.app.state.identity.pointsLog.length;
    const lastCheckInAfterFirst = harness.app.state.identity.lastCheckIn;
    const checkinsAfterFirst = harness.app.state.identity.checkins.length;
    expect(logLengthAfterFirst).toBe(1);
    expect(lastCheckInAfterFirst).not.toBeNull();

    // Nota: no se afirma sobre el valor de RETORNO de este segundo
    // checkIn() (ver hallazgo en el reporte final: el patrón existente
    // `let x; setState(updater-que-asigna-x); return x` — igual que en
    // checkOut/claimChallenge/selectPlan/claimPrize, no introducido por
    // este cambio — no garantiza que el updater corra de forma síncrona
    // cuando se invoca fuera de un evento real del DOM, como aquí). Lo
    // que sí es la fuente de verdad es el `state` resultante: el propio
    // `if (already) return prev` dentro de checkIn ya impide conceder
    // puntos ni duplicar la entrada de pointsLog una segunda vez el
    // mismo día, y es exactamente eso lo que se verifica abajo.
    await actAsync(() => harness.app.actions.checkIn({ gymId: "g1" }));

    expect(harness.app.state.identity.user.points).toBe(pointsAfterFirst);
    expect(harness.app.state.identity.lastCheckIn).toBe(lastCheckInAfterFirst);
    expect(harness.app.state.identity.checkins.length).toBe(checkinsAfterFirst);
    expect(harness.app.state.identity.pointsLog.length).toBe(logLengthAfterFirst);
  });

  it("addPoints y checkIn comparten el mismo registro: ambas entradas conviven en pointsLog sin pisarse", async () => {
    harness = mountApp();
    await actAsync(() => harness.app.actions.addPoints(50, "test"));
    await actAsync(() => harness.app.actions.checkIn({ gymId: "g1" }));

    const { pointsLog } = harness.app.state.identity;
    expect(pointsLog.length).toBe(2);
    // Más reciente primero (checkIn), igual que el resto de pointsLog.
    expect(pointsLog[0].amount).toBe(POINT_RULES.checkin);
    expect(pointsLog[1].amount).toBe(50);
  });
});
