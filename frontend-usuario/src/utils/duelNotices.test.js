import { describe, expect, it } from "vitest";
import { duelNotice } from "./duelNotices.js";

const NOW = Date.parse("2026-11-14T12:00:00Z");
const base = {
  id: 7,
  stake: 100,
  challenger: { id: 1, name: "Ana" },
  opponent: { id: 2, name: "Beto" },
  winner_user_id: null,
  accepted_at: "2026-11-14T10:00:00Z",
  finished_at: "2026-11-14T11:00:00Z",
};
const duel = (over) => ({ ...base, ...over });

describe("duelNotice", () => {
  it("el rival retado recibe el aviso del reto; el retador no", () => {
    const n = duelNotice(duel({ status: "pending", viewer_role: "opponent" }), NOW);
    expect(n.title).toContain("Ana");
    expect(n.ref).toBe("duel:7:pending");
    expect(duelNotice(duel({ status: "pending", viewer_role: "challenger" }), NOW)).toBeNull();
  });

  it("el retador se entera de aceptación/rechazo; el rival de la cancelación", () => {
    expect(duelNotice(duel({ status: "accepted", viewer_role: "challenger" }), NOW).title).toContain("aceptó");
    expect(duelNotice(duel({ status: "accepted", viewer_role: "opponent" }), NOW)).toBeNull();
    expect(duelNotice(duel({ status: "rejected", viewer_role: "challenger" }), NOW).title).toContain("rechazó");
    expect(duelNotice(duel({ status: "cancelled", viewer_role: "opponent" }), NOW).title).toContain("canceló");
    expect(duelNotice(duel({ status: "cancelled", viewer_role: "challenger" }), NOW)).toBeNull();
  });

  it("el resultado avisa a quien no ejecutó último: ganador, perdedor y empate", () => {
    const won = duelNotice(duel({ status: "finished", viewer_role: "challenger", winner_user_id: 1 }), NOW);
    expect(won.title).toContain("Ganaste");
    expect(won.tone).toBe("success");
    const lost = duelNotice(duel({ status: "finished", viewer_role: "challenger", winner_user_id: 2 }), NOW);
    expect(lost.body).toContain("−");
    expect(duelNotice(duel({ status: "finished", viewer_role: "opponent", winner_user_id: null }), NOW).title).toContain("empate");
  });

  it("una apuesta de 0 no muestra puntos", () => {
    const n = duelNotice(duel({ status: "finished", viewer_role: "challenger", winner_user_id: 2, stake: 0 }), NOW);
    expect(n.body).toBe("Sin puntos en juego.");
  });

  it("vencido y no validado avisan a ambos", () => {
    for (const role of ["challenger", "opponent"]) {
      expect(duelNotice(duel({ status: "expired", viewer_role: role }), NOW).title).toContain("venció");
      expect(duelNotice(duel({ status: "unvalidated", viewer_role: role }), NOW).title).toContain("NO VALIDADO");
    }
  });

  it("el historial viejo no genera avisos, pero un reto pendiente sí", () => {
    const old = "2026-11-01T00:00:00Z";
    expect(duelNotice(duel({ status: "finished", viewer_role: "opponent", winner_user_id: 1, finished_at: old }), NOW)).toBeNull();
    expect(duelNotice(duel({ status: "expired", viewer_role: "opponent", finished_at: old }), NOW)).toBeNull();
    expect(duelNotice(duel({ status: "pending", viewer_role: "opponent" }), NOW)).not.toBeNull();
    expect(duelNotice(duel({ status: "in_progress", viewer_role: "opponent" }), NOW)).toBeNull();
  });
});
