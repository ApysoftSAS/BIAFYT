import { useMemo, useState } from "react";
import { useApp } from "../state/AppContext.jsx";
import { prizeCatalog } from "../data/prizes.js";
import { gyms, findGym } from "../data/gyms.js";
import { Badge, Button, Card, Modal, Screen, Tabs } from "../components/UI.jsx";
import Coach from "../components/Coach.jsx";
import { formatPoints } from "../utils/format.js";

export default function Prizes({ onBack }) {
  const { state, community, ranking, actions, points } = useApp();
  const [tab, setTab] = useState("catalog");
  const [giftFor, setGiftFor] = useState(null);

  const myGymPosition = useMemo(() => ranking("gym").find((u) => u.isMe)?.position ?? 99, [ranking]);
  const myBranchPosition = useMemo(() => ranking("branch").find((u) => u.isMe)?.position ?? 99, [ranking]);

  // B1: el desbloqueo por puntos usa el saldo AUTORITATIVO del backend.
  const balance = points.status === "ok" && points.balance != null ? points.balance : null;

  const unlocked = (p) => {
    switch (p.unlock.type) {
      case "points":
        return balance != null && balance >= p.unlock.amount;
      case "rank":
        return (p.unlock.scope === "gym" ? myGymPosition : myBranchPosition) <= p.unlock.position;
      case "duels":
        return state.identity.user.duels.wins >= p.unlock.wins;
      default:
        return false;
    }
  };

  const friends = community.filter((u) => u.gymId === state.identity.user.gymId);

  // Los premios pueden venir de BIAFYT o de un Gym concreto (prize.source/gymId).
  const sourceLabel = (p) => (p.source === "gym" ? findGym(gyms, p.gymId)?.name ?? "Gym" : "BIAFYT");

  return (
    <Screen title="PREMIOS" subtitle="Beneficios digitales, sin premios físicos." onBack={onBack}>
      <Tabs
        items={[
          { id: "catalog", label: "Disponibles" },
          { id: "mine", label: `Míos (${state.identity.rewards.length})` },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === "catalog" && (
        <div className="stack-sm">
          {prizeCatalog.map((p) => {
            const ok = unlocked(p);
            return (
              <Card key={p.id} className={ok ? "" : "locked"}>
                <div className="row-between">
                  <div>
                    <p className="micro">{p.condition}</p>
                    <h3>{p.title}</h3>
                    <p className="muted">{p.detail}</p>
                  </div>
                  <div className="right stack-xs">
                    <Badge tone={p.source === "gym" ? "default" : "accent"}>{sourceLabel(p)}</Badge>
                    <Badge tone={p.transferable ? "accent" : "default"}>{p.transferable ? "Transferible" : "Personal"}</Badge>
                  </div>
                </div>
                <Button
                  full
                  variant={ok ? "primary" : "ghost"}
                  disabled={!ok}
                  onClick={() => {
                    const done = actions.claimPrize(p);
                    if (done) {
                      actions.notify({ channel: "promos", title: "Premio obtenido", body: p.title, tone: "success" });
                      setTab("mine");
                    }
                  }}
                >
                  {ok ? (p.cost ? `CANJEAR POR ${formatPoints(p.cost)} PTS` : "RECLAMAR") : "BLOQUEADO"}
                </Button>
              </Card>
            );
          })}
        </div>
      )}

      {tab === "mine" && (
        <div className="stack-sm">
          {state.identity.rewards.length === 0 && <p className="muted center">Todavía no tienes premios.</p>}
          {state.identity.rewards.map((r) => (
            <Card key={r.uid}>
              <div className="row-between">
                <div>
                  <h3>{r.title}</h3>
                  <p className="muted">
                    {r.kind} · {r.status}
                  </p>
                  {r.redemptionCode && <p className="micro">CÓDIGO: {r.redemptionCode}</p>}
                </div>
                {r.status === "Disponible" && <Badge tone="success">Activo</Badge>}
              </div>
              {r.status === "Disponible" && (
                <div className="row-gap">
                  <Button
                    full
                    onClick={() => {
                      actions.useReward(r.uid);
                      actions.notify({ channel: "promos", title: "Premio canjeado", body: "Preséntalo en tu gimnasio.", tone: "success" });
                    }}
                  >
                    USAR PREMIO
                  </Button>
                  {r.transferable && (
                    <Button variant="ghost" full onClick={() => setGiftFor(r)}>
                      REGALAR A UN AMIGO
                    </Button>
                  )}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* Punto 64 */}
      <Modal open={Boolean(giftFor)} title="REGALAR BENEFICIO" onClose={() => setGiftFor(null)}>
        <p className="muted">Elige a quién quieres regalar «{giftFor?.title}».</p>
        <div className="stack-sm">
          {friends.map((f) => (
            <Card
              key={f.id}
              onClick={() => {
                actions.giftReward(giftFor.uid, f.name);
                actions.notify({ channel: "promos", title: "Beneficio regalado", body: `${f.name} recibió tu premio.`, tone: "success" });
                setGiftFor(null);
              }}
            >
              <strong>{f.name}</strong>
              <p className="muted">{f.profile.level}</p>
            </Card>
          ))}
        </div>
      </Modal>

      <Coach state="celebracion" message="Los premios se ganan entrenando de verdad." />
    </Screen>
  );
}
