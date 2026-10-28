import { useMemo, useState } from "react";
import { useApp } from "../state/AppContext.jsx";
import { Button, Card, Badge, Avatar, Modal } from "../components/UI.jsx";
import Coach from "../components/Coach.jsx";
import { formatPoints, formatTime } from "../utils/format.js";
import { setsFor, unitFor } from "../utils/exercisePrescription.js";
import { Wordmark } from "../components/Brand.jsx";
import { postsFor } from "../data/community.js";

export default function Home({ onNavigate, gpsState }) {
  const { state, gym, branch, routine, ranking, actions, streak, duels, points } = useApp();
  // Racha canónica: solo del backend (`GET /me/streak`). "—" si aún no cargó.
  const currentStreak = streak.status === "ok" ? streak.current : "—";
  // Saldo autoritativo: solo del backend (`GET /me/points`). "—" si aún no cargó.
  const balance = points.status === "ok" && points.balance != null ? formatPoints(points.balance) : "—";
  const [notifOpen, setNotifOpen] = useState(false);

  const gymRanking = useMemo(() => ranking("gym").slice(0, 3), [ranking]);
  const myPosition = useMemo(() => ranking("gym").find((u) => u.isMe)?.position ?? "—", [ranking]);
  // Retos que requieren mi atención: recibidos sin responder, o aceptados/en
  // curso en los que aún no ejecuté la rutina.
  const pendingDuels = duels.list.filter(
    (d) =>
      (d.status === "pending" && d.viewer_role === "opponent") ||
      (["accepted", "in_progress"].includes(d.status) && !d.you_submitted)
  );
  const unread = state.identity.notifications.filter((n) => !n.read).length;

  const firstExercise = routine.exercises[0];
  const firstUnit = unitFor(firstExercise);
  const firstUnitText = firstUnit.open
    ? "cardio libre"
    : `${firstUnit.isTime ? formatTime(firstUnit.value) : firstUnit.value} ${firstUnit.label.toLowerCase()}`;

  const posts = postsFor(state.identity.user.gymId);
  const headline = posts[0];
  const unreadPosts = posts.filter((p) => !state.identity.readPosts.includes(p.id)).length;

  const checkedToday = state.identity.lastCheckIn && new Date(state.identity.lastCheckIn).toDateString() === new Date().toDateString();
  const insideGym = checkedToday && (!state.identity.lastCheckOut || new Date(state.identity.lastCheckOut) < new Date(state.identity.lastCheckIn));

  const challenge = {
    title: "5 ENTRENAMIENTOS ESTA SEMANA",
    progress: Math.min(5, state.identity.activities.length),
    target: 5,
    reward: 120,
  };

  return (
    <div className="screen home">
      <header className="home-head">
        <div>
          <Wordmark />
          <h1>Hola, {state.identity.user.name.split(" ")[0]}</h1>
          <p className="muted">
            {gym ? `${gym.name} · ${branch?.name ?? "Sede"}` : "Sin gimnasio asociado"}
          </p>
        </div>
        <button className="icon-btn bell" onClick={() => { setNotifOpen(true); actions.markNotificationsRead(); }} aria-label="Notificaciones">
          🔔{unread > 0 && <span className="dot" />}
        </button>
      </header>

      <div className="screen-body">
        {/* PUNTOS Y RACHA */}
        <Card accent>
          <div className="row-between">
            <div>
              <p className="micro dark">SOMA POINTS</p>
              <h2 className="big-number dark">{balance}</h2>
              {state.identity.user.lockedPoints > 0 && <p className="micro dark">{formatPoints(state.identity.user.lockedPoints)} bloqueados en duelos</p>}
            </div>
            <div className="streak-badge">🔥 {currentStreak} días</div>
          </div>
        </Card>

        {/* CHECK-IN / CHECK-OUT */}
        <Card>
          <div className="row-between">
            <div>
              <strong>Check-in de hoy</strong>
              <p className="muted">
                {insideGym ? "Estás dentro del gimnasio." : checkedToday ? "Ya registraste tu salida." : "Registra tu llegada al gimnasio."}
              </p>
            </div>
            <Button
              variant={checkedToday && !insideGym ? "ghost" : "primary"}
              disabled={checkedToday && !insideGym}
              onClick={() => {
                if (insideGym) {
                  const ok = actions.checkOut();
                  if (ok) actions.notify({ channel: "training", title: "Check-out registrado", body: "Nos vemos pronto.", tone: "success" });
                  return;
                }
                const ok = actions.checkIn({ gymId: gym?.id, branchId: branch?.id });
                if (ok) actions.notify({ channel: "training", title: "Check-in registrado", body: "+20 puntos de actividad.", tone: "success" });
              }}
            >
              {insideGym ? "CHECK-OUT" : checkedToday ? "HECHO" : "CHECK-IN"}
            </Button>
          </div>
        </Card>

        {/* ENTRENAMIENTO */}
        <Card>
          <p className="micro">RUTINA DE HOY</p>
          <h3>{routine.name}</h3>
          <p className="muted">
            {routine.exercises.length} ejercicios · {setsFor(firstExercise)} series · {firstUnitText}
          </p>
          {routine.custom && <p className="micro">Rutina creada por ti</p>}
          <div className="row-gap">
            <Button full onClick={() => onNavigate("workout")}>
              ▶ ENTRENAR
            </Button>
            <Button variant="ghost" full onClick={() => onNavigate("routines")}>
              MIS RUTINAS
            </Button>
          </div>
          {gpsState && (
            <p className="micro">
              Estado GPS: <span className={gpsState === "GRANTED" ? "text-success" : "text-warning"}>{gpsLabel(gpsState)}</span>
            </p>
          )}
        </Card>

        {/* DUELOS PENDIENTES (tarjeta contextual, punto 94) */}
        {pendingDuels.length > 0 && (
          <Card className="duel-card" onClick={() => onNavigate("duels")}>
            <div className="row-between">
              <div>
                <strong>🔥 TIENES UN DUELO PENDIENTE</strong>
                <p className="muted">
                  {pendingDuels[0].viewer_role === "challenger"
                    ? pendingDuels[0].opponent.name
                    : pendingDuels[0].challenger.name}{" "}
                  · {formatPoints(pendingDuels[0].stake)} puntos
                </p>
              </div>
              <span className="chevron">›</span>
            </div>
          </Card>
        )}

        {/* RETOS DIARIOS */}
        <Card onClick={() => onNavigate("challenges")}>
          <div className="row-between">
            <div>
              <p className="micro">RETOS DE HOY</p>
              <strong>3 retos disponibles</strong>
              <p className="muted">Cómpletalos y suma puntos extra.</p>
            </div>
            <span className="chevron">›</span>
          </div>
        </Card>

        {/* RETO SEMANAL */}
        <Card>
          <div className="row-between">
            <div>
              <p className="micro">RETO SEMANAL</p>
              <strong>{challenge.title}</strong>
            </div>
            <Badge tone="accent">+{challenge.reward}</Badge>
          </div>
          <div className="progress-line">
            <div className="progress-fill" style={{ width: `${(challenge.progress / challenge.target) * 100}%` }} />
          </div>
          <p className="micro">
            {challenge.progress} / {challenge.target}
          </p>
        </Card>

        {/* NOVEDADES DEL GIMNASIO */}
        {headline && (
          <Card onClick={() => onNavigate("news")}>
            <div className="row-between">
              <div>
                <p className="micro">DE TU GIMNASIO{unreadPosts > 0 ? ` · ${unreadPosts} sin leer` : ""}</p>
                <strong>{headline.title}</strong>
                <p className="muted">{headline.summary}</p>
              </div>
              <span className="chevron">›</span>
            </div>
          </Card>
        )}

        {/* RANKING DEL GIMNASIO */}
        <Card onClick={() => onNavigate("ranking")}>
          <div className="row-between">
            <div>
              <p className="micro">RANKING DE TU GIMNASIO</p>
              <strong>Tu posición: #{myPosition}</strong>
            </div>
            <span className="chevron">›</span>
          </div>
          <div className="stack-xs">
            {gymRanking.map((u) => (
              <div className="rank-row-sm" key={u.id}>
                <span className="rank-pos">{u.position}</span>
                <Avatar initials={u.initials} name={u.name} size={28} highlight={u.isMe} />
                <span className="rank-name">{u.isMe ? "Tú" : u.name}</span>
                <span className="rank-points">{formatPoints(u.points)}</span>
              </div>
            ))}
            {gymRanking.length === 0 && <p className="muted">Activa tu participación en clasificaciones para ver el ranking.</p>}
          </div>
        </Card>

        {/* ACCESOS */}
        <div className="grid-2">
          <Card onClick={() => onNavigate("machines")}>
            <strong>MÁQUINAS</strong>
            <p className="muted">Biblioteca guiada</p>
          </Card>
          <Card onClick={() => onNavigate("prizes")}>
            <strong>PREMIOS</strong>
            <p className="muted">Beneficios y descuentos</p>
          </Card>
          <Card onClick={() => onNavigate("calendar")}>
            <strong>CALENDARIO</strong>
            <p className="muted">Tu historial y agenda</p>
          </Card>
          <Card onClick={() => onNavigate("news")}>
            <strong>NOVEDADES</strong>
            <p className="muted">Noticias y promociones</p>
          </Card>
          <Card onClick={() => onNavigate("videos")}>
            <strong>VIDEOS</strong>
            <p className="muted">Coaches en TikTok</p>
          </Card>
          <Card onClick={() => onNavigate("plans")}>
            <strong>PLANES</strong>
            <p className="muted">Tu membresía</p>
          </Card>
          <Card onClick={() => onNavigate("analytics")}>
            <strong>ANALYTICS</strong>
            <p className="muted">Tu progreso real</p>
          </Card>
        </div>
      </div>

      <Coach state={pendingDuels.length ? "competitivo" : "normal"} message={pendingDuels.length ? "Tienes un duelo esperando." : "Aquí estoy cuando lo necesites."} onClick={() => onNavigate(pendingDuels.length ? "duels" : "workout")} />

      <Modal open={notifOpen} title="NOTIFICACIONES" onClose={() => setNotifOpen(false)}>
        {state.identity.notifications.length === 0 ? (
          <p className="muted">Todavía no tienes notificaciones.</p>
        ) : (
          <div className="stack-sm">
            {state.identity.notifications.map((n) => (
              <div key={n.id} className="notif">
                <strong>{n.title}</strong>
                {n.body && <p className="muted">{n.body}</p>}
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
}

function gpsLabel(s) {
  return { GRANTED: "Activo", DENIED: "Denegado", UNAVAILABLE: "No disponible", REQUESTING: "Solicitando…", IDLE: "Inactivo" }[s] ?? s;
}
