import { formatPoints } from "./format.js";

/**
 * Aviso (notificación in-app) que merece un duelo según su estado actual,
 * o null si no hay nada que avisar. PURA: el backend es la fuente de verdad
 * y `AppContext#loadDuels` la aplica a cada recarga; el `ref` hace el aviso
 * idempotente (`notify` ignora un `ref` ya registrado), así que recargar,
 * hacer polling o reiniciar la app no repite avisos.
 *
 * Solo se avisa de lo que hizo la OTRA persona (te retó, aceptó, rechazó,
 * canceló) o de lo que cierra el duelo (resultado, vencimiento). Las
 * acciones propias ya muestran su propio aviso en `Duels.jsx`/`App.jsx`.
 * Los duelos terminados hace más de `RECENT_DAYS` no avisan (historial).
 */
export const RECENT_DAYS = 3;

const recent = (iso, now) => {
  const t = Date.parse(iso ?? "");
  return Number.isFinite(t) && now - t < RECENT_DAYS * 86400000;
};

export function duelNotice(duel, now = Date.now()) {
  const iAmChallenger = duel.viewer_role === "challenger";
  const meId = iAmChallenger ? duel.challenger.id : duel.opponent.id;
  const rival = (iAmChallenger ? duel.opponent : duel.challenger).name;
  const ref = (s) => `duel:${duel.id}:${s}`;

  switch (duel.status) {
    case "pending":
      return iAmChallenger
        ? null
        : {
            ref: ref("pending"),
            title: `⚔ ${rival} te retó a un duelo.`,
            body: `${formatPoints(duel.stake)} puntos en juego. Respóndele en Duelos.`,
            tone: "duel",
          };
    case "accepted":
      return iAmChallenger && recent(duel.accepted_at, now)
        ? { ref: ref("accepted"), title: `${rival} aceptó tu reto.`, body: "Ya pueden realizar la misma rutina.", tone: "duel" }
        : null;
    case "rejected":
      return iAmChallenger && recent(duel.finished_at, now)
        ? { ref: ref("rejected"), title: `${rival} rechazó tu reto.`, body: "Te devolvimos los puntos bloqueados.", tone: "alert" }
        : null;
    case "cancelled":
      return !iAmChallenger && recent(duel.finished_at, now)
        ? { ref: ref("cancelled"), title: `${rival} canceló el duelo.`, body: "Te devolvimos los puntos bloqueados.", tone: "alert" }
        : null;
    case "expired":
      return recent(duel.finished_at, now)
        ? { ref: ref("expired"), title: `Tu duelo contra ${rival} venció.`, body: "Nadie lo completó a tiempo. Te devolvimos los puntos bloqueados.", tone: "alert" }
        : null;
    case "unvalidated":
      return recent(duel.finished_at, now)
        ? { ref: ref("unvalidated"), title: "DUELO NO VALIDADO", body: "Se devolvieron los puntos apostados.", tone: "alert" }
        : null;
    case "finished": {
      if (!recent(duel.finished_at, now)) return null;
      const draw = duel.winner_user_id == null;
      const won = duel.winner_user_id === meId;
      return {
        ref: ref("finished"),
        title: draw ? "Duelo en empate." : won ? "🏆 Ganaste tu duelo." : "El duelo terminó.",
        body: draw
          ? "Se devolvió tu apuesta."
          : duel.stake > 0
            ? `${won ? "+" : "−"}${formatPoints(duel.stake)} SOMA POINTS`
            : "Sin puntos en juego.",
        tone: won ? "success" : "alert",
      };
    }
    default:
      return null;
  }
}
