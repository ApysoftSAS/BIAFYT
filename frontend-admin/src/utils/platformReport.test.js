import { describe, expect, it } from "vitest";
import { platformToCsv } from "./platformReport.js";

describe("platformToCsv", () => {
  it("arma las secciones y neutraliza nombres que parecen fórmulas", () => {
    const csv = platformToCsv({
      period: { days: 7, from: "2026-11-09", to: "2026-11-15", timezone: "America/Bogota" },
      totals: { users: 10, new_users: 2, gyms: 1, new_gyms: 0, members: 5, coaches: 1, staff: 1, active_users_period: 4, check_ins: 9, workouts: 3, duels_finished: 1, vouchers_issued: 1, vouchers_redeemed: 0, promotions_active: 2 },
      active_users: { today: 1, last_7_days: 3, last_30_days: 4 },
      new_users_by_day: [{ date: "2026-11-15", count: 2 }],
      check_ins_by_day: [{ date: "2026-11-15", count: 9 }],
      check_ins_by_hour: Array(24).fill(0),
      top_gyms: [{ id: 1, name: "=KAIROS", members: 5, coaches: 1, check_ins: 9, active_members: 4 }],
      queues: { gym_registrations: { pending: 1, approved: 2, rejected: 0 }, equipment_requests: { pending: 0 } },
    });
    expect(csv).toContain("Usuarios nuevos (periodo);2");
    expect(csv).toContain("2026-11-15;2;9");
    expect(csv).toContain("'=KAIROS;5;1;9;4");
    expect(csv).toContain("Registro de gimnasio;pending;1");
    expect(csv.split("\r\n").filter((l) => /^\d\d:00;/.test(l))).toHaveLength(24);
  });
});
