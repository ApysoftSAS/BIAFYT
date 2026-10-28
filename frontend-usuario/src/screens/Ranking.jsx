import { useMemo, useState } from "react";
import { useApp } from "../state/AppContext.jsx";
import { Avatar, Card, Tabs, Button } from "../components/UI.jsx";
import Coach from "../components/Coach.jsx";
import { formatPoints } from "../utils/format.js";

const scopes = [
  { id: "group", label: "Mi grupo" },
  { id: "branch", label: "Mi sede" },
  { id: "gym", label: "Mi gimnasio" },
  { id: "city", label: "Ciudad" },
  { id: "country", label: "País" },
  { id: "global", label: "Global" },
];

export default function Ranking({ onNavigate }) {
  const { state, ranking, gym, branch } = useApp();
  const [scope, setScope] = useState("gym");
  const rows = useMemo(() => ranking(scope), [ranking, scope]);
  const optedOut = !state.identity.settings.rankingOptIn;

  return (
    <div className="screen">
      <header className="screen-head">
        <div className="screen-title">
          <h1>RANKING</h1>
          <p>{gym ? `${gym.name} · ${branch?.name ?? ""}` : "Sin gimnasio"}</p>
        </div>
      </header>

      <div className="screen-body">
        <Tabs items={scopes} value={scope} onChange={setScope} />

        {optedOut && (
          <Card className="soft">
            <strong>No participas en clasificaciones</strong>
            <p className="muted">Sigues acumulando estadísticas privadas, pero no apareces en los rankings.</p>
            <Button variant="ghost" onClick={() => onNavigate("settings")}>
              CAMBIAR EN PRIVACIDAD
            </Button>
          </Card>
        )}

        <div className="stack-xs">
          {rows.map((u) => (
            <div key={u.id} className={`rank-row ${u.isMe ? "rank-me" : ""}`}>
              <span className={`rank-pos ${u.position <= 3 ? "rank-top" : ""}`}>{u.position}</span>
              <Avatar initials={u.initials} name={u.name} size={38} highlight={u.isMe} />
              <div className="rank-info">
                <strong>{u.isMe ? "Tú" : u.name}</strong>
                <span className="micro">
                  🔥 {u.streak} días{u.daysOnTop > 0 ? ` · ${u.daysOnTop} días destacado` : ""}
                </span>
              </div>
              <div className="rank-right">
                <strong>{formatPoints(u.points)}</strong>
                <span className={`micro ${u.variation > 0 ? "text-success" : u.variation < 0 ? "text-error" : "text-muted"}`}>
                  {u.variation > 0 ? `▲ ${u.variation}` : u.variation < 0 ? `▼ ${Math.abs(u.variation)}` : "—"}
                </span>
              </div>
            </div>
          ))}
          {rows.length === 0 && <p className="muted center">Aún no hay usuarios visibles en este ámbito.</p>}
        </div>

        <Card className="soft">
          <p className="micro">
            Solo aparecen usuarios que permiten su participación en clasificaciones. Los puntos mostrados corresponden a actividad validada.
          </p>
        </Card>
      </div>

      <Coach state="ranking" message="Cada entrenamiento validado te mueve aquí." />
    </div>
  );
}
