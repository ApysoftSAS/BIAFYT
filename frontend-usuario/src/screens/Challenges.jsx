import { useMemo } from "react";
import { useApp } from "../state/AppContext.jsx";
import { Badge, Button, Card, Screen, Stat } from "../components/UI.jsx";
import Coach from "../components/Coach.jsx";
import { dailyChallengesFor } from "../data/community.js";
import { formatPoints } from "../utils/format.js";
import { progressForDay } from "../data/schedule.js";

/** Fecha fija al cargar el módulo, para no llamar funciones impuras en render. */
const TODAY_KEY = new Date().toISOString().slice(0, 10);

/**
 * RETOS DIARIOS
 * Se calculan de forma determinista a partir de la fecha, así que no
 * cambian al recargar. El progreso se alimenta de la actividad real
 * del día (check-in, series, minutos, sesiones validadas).
 */

export default function Challenges({ onBack }) {
  const { state, actions, streak } = useApp();
  const currentStreak = streak.status === "ok" ? streak.current : "—";
  const challenges = useMemo(() => dailyChallengesFor(TODAY_KEY, 3), []);
  const progress = useMemo(() => progressForDay(state.identity, TODAY_KEY), [state.identity]);

  const completed = challenges.filter((c) => progress[c.metric] >= c.target).length;
  const totalReward = challenges.reduce((t, c) => t + c.reward, 0);

  return (
    <Screen title="RETOS DIARIOS" subtitle="Se renuevan cada día a medianoche." onBack={onBack}>
      <div className="stack">
        <Card accent>
          <div className="row-around">
            <Stat label="Completados" value={`${completed}/${challenges.length}`} />
            <Stat label="En juego" value={formatPoints(totalReward)} />
            <Stat label="Racha" value={`🔥 ${currentStreak}`} />
          </div>
        </Card>

        <div className="stack-sm">
          {challenges.map((c) => {
            const current = Math.min(progress[c.metric] ?? 0, c.target);
            const done = current >= c.target;
            const claimed = progress.claimed.includes(c.id);

            return (
              <Card key={c.id} className={claimed ? "locked" : ""}>
                <div className="row-between">
                  <div className="row-left">
                    <span className="challenge-icon">{c.icon}</span>
                    <div>
                      <strong>{c.title}</strong>
                      <p className="muted">{c.detail}</p>
                    </div>
                  </div>
                  <Badge tone={claimed ? "success" : done ? "accent" : "default"}>
                    {claimed ? "Cobrado" : `+${c.reward}`}
                  </Badge>
                </div>

                <div className="progress-line">
                  <div className="progress-fill" style={{ width: `${(current / c.target) * 100}%` }} />
                </div>
                <p className="micro">
                  {current} / {c.target}
                </p>

                {done && !claimed && (
                  <Button
                    full
                    onClick={() => {
                      const granted = actions.claimChallenge(TODAY_KEY, c.id, c.reward);
                      if (granted) {
                        actions.notify({
                          channel: "challenges",
                          title: "Reto completado",
                          body: `${c.title} · +${c.reward} puntos`,
                          tone: "success",
                        });
                      }
                    }}
                  >
                    COBRAR {formatPoints(c.reward)} PUNTOS
                  </Button>
                )}
              </Card>
            );
          })}
        </div>

        <Card className="soft">
          <p className="micro">
            El progreso se calcula con tu actividad real del día. Los retos que exigen validación necesitan GPS activo en tu sede.
          </p>
        </Card>
      </div>

      <Coach
        state={completed === challenges.length ? "celebracion" : "challenge"}
        message={completed === challenges.length ? "¡Completaste los retos de hoy!" : "Te faltan retos por cerrar hoy."}
      />
    </Screen>
  );
}
