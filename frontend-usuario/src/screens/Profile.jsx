import { useEffect, useMemo } from "react";
import { useApp } from "../state/AppContext.jsx";
import { Avatar, Badge, Button, Card, Stat } from "../components/UI.jsx";
import Coach from "../components/Coach.jsx";
import { formatPoints, formatDate, formatTime } from "../utils/format.js";
import { findFocus } from "../data/training.js";
import appConfig from "../config/appConfig.js";

// B2: etiqueta legible de cada `reason` del ledger backend (`point_transactions`).
const REASON_LABEL = {
  workout_completed: "Entrenamiento",
  checkin: "Check-in",
  challenge_claimed: "Reto diario",
  reward_claimed: "Canje de premio",
  duel_won: "Duelo ganado",
  duel_lost: "Duelo perdido",
};

export default function Profile({ onNavigate }) {
  const { state, gym, branch, ranking, actions, profileLoading, profileError, streak, points } = useApp();
  // Racha canónica del backend (`GET /me/streak`): `current` rompe con un
  // día perdido; `longest` es el récord. "—" mientras no haya respuesta.
  const currentStreak = streak.status === "ok" ? streak.current : "—";
  const longestStreak = streak.status === "ok" ? streak.longest : "—";
  // Saldo e historial autoritativos del backend (`GET /me/points`).
  const balance = points.status === "ok" && points.balance != null ? formatPoints(points.balance) : "—";
  const position = useMemo(() => ranking("gym").find((u) => u.isMe)?.position ?? "—", [ranking]);
  const { wins, losses } = state.identity.user.duels;
  const rate = wins + losses > 0 ? ((wins / (wins + losses)) * 100).toFixed(1) : "0.0";
  const profile = state.identity.user.profile;

  // GET diferido: se dispara al entrar a esta pantalla, no en el arranque general de la app.
  useEffect(() => {
    actions.fetchProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="screen">
      <header className="screen-head">
        <div className="screen-title">
          <h1>PERFIL</h1>
        </div>
        <button className="icon-btn" onClick={() => onNavigate("settings")} aria-label="Configuración">
          ⚙
        </button>
      </header>

      <div className="screen-body">
        <Card>
          <div className="row-left">
            <Avatar initials={state.identity.user.initials} name={state.identity.user.name} size={64} highlight />
            <div>
              <h2>{state.identity.user.name}</h2>
              <p className="muted">{findFocus(state.identity.user.focusId).label}</p>
              {profile?.level && <Badge tone="accent">{profile.level}</Badge>}
            </div>
          </div>
        </Card>

        {/* Perfil físico (Fase 2 — sincronizado con backend) */}
        <Card onClick={() => onNavigate("editProfile")}>
          <div className="row-between">
            <div>
              <p className="micro">PERFIL FÍSICO</p>
              {profile ? (
                <div className="grid-3">
                  <Stat label="Edad" value={profile.age ?? "—"} />
                  <Stat label="Peso" value={profile.weight != null ? `${profile.weight} kg` : "—"} />
                  <Stat label="Altura" value={profile.height != null ? `${profile.height} cm` : "—"} />
                </div>
              ) : (
                <p className="muted">Aún no completas tu perfil físico.</p>
              )}
              {profileLoading && <p className="micro">Actualizando…</p>}
              {profileError && <p className="micro text-warning">{profileError}</p>}
            </div>
            <span className="chevron">›</span>
          </div>
        </Card>

        {/* Gimnasio (punto 95) */}
        <Card>
          <p className="micro">GIMNASIO</p>
          <h3>{gym?.name ?? "Sin asociar"}</h3>
          <div className="grid-3">
            <Stat label="Sede" value={branch?.name ?? "—"} />
            <Stat label="Ciudad" value={state.identity.user.city ?? "—"} />
            <Stat label="País" value={state.identity.user.country ?? "—"} />
          </div>
          <Button variant="ghost" full onClick={() => onNavigate("ranking")}>
            MI POSICIÓN: #{position}
          </Button>
        </Card>

        {/* MI COACH (slice D-CLIENT-COACH): conectar (QR/ID) + solicitudes + coach activo */}
        <Card onClick={() => onNavigate("coachRelationship")}>
          <div className="row-between">
            <div>
              <p className="micro">MI COACH</p>
              <strong>Conectar con mi coach, solicitudes y coach asignado</strong>
            </div>
            <span className="chevron">›</span>
          </div>
        </Card>

        <div className="grid-2">
          <Card>
            <p className="micro">PUNTOS</p>
            <h2>{balance}</h2>
            {state.identity.user.lockedPoints > 0 && <p className="micro text-warning">{formatPoints(state.identity.user.lockedPoints)} bloqueados en duelos</p>}
          </Card>
          <Card>
            <p className="micro">RACHA</p>
            <h2>🔥 {currentStreak}</h2>
            <p className="micro">días consecutivos · récord {longestStreak}</p>
          </Card>
        </div>

        {/* MOVIMIENTOS DE PUNTOS (B2): historial autoritativo del ledger
            backend (`GET /me/points`), paginado por cursor (A2). No se
            reconstruye a partir de actividades/retos/duelos. */}
        <Card>
          <p className="micro">MOVIMIENTOS DE PUNTOS</p>
          {points.status === "loading" && <p className="muted">Cargando…</p>}
          {points.status === "error" && <p className="muted text-warning">No se pudo cargar el historial.</p>}
          {points.status === "ok" && points.transactions.length === 0 && (
            <p className="muted">Aún no tienes movimientos de puntos.</p>
          )}
          {points.transactions.length > 0 && (
            <div className="stack-xs">
              {points.transactions.map((t) => (
                <div className="row-between activity-row" key={t.id}>
                  <div>
                    <strong>{REASON_LABEL[t.reason] ?? t.reason}</strong>
                    <p className="micro">{formatDate(t.created_at)}</p>
                  </div>
                  <Badge tone={t.amount >= 0 ? "success" : "error"}>
                    {t.amount >= 0 ? "+" : "−"}
                    {formatPoints(Math.abs(t.amount))}
                  </Badge>
                </div>
              ))}
              {points.hasMore && (
                <Button variant="ghost" full disabled={points.status === "loadingMore"} onClick={() => actions.loadMorePoints()}>
                  {points.status === "loadingMore" ? "CARGANDO…" : "CARGAR MÁS"}
                </Button>
              )}
            </div>
          )}
        </Card>

        {/* MIS DUELOS (punto 86) */}
        <Card onClick={() => onNavigate("duels")}>
          <div className="row-between">
            <p className="micro">MIS DUELOS</p>
            <span className="chevron">›</span>
          </div>
          <div className="row-around">
            <Stat label="Duelos" value={wins + losses} />
            <Stat label="Victorias" value={wins} tone="success" />
            <Stat label="Derrotas" value={losses} tone="error" />
            <Stat label="Win rate" value={`${rate}%`} />
          </div>
        </Card>

        <Card onClick={() => onNavigate("prizes")}>
          <div className="row-between">
            <div>
              <p className="micro">RECOMPENSAS</p>
              <strong>{state.identity.rewards.length} beneficios</strong>
            </div>
            <span className="chevron">›</span>
          </div>
        </Card>

        {/* HISTORIAL DE ACTIVIDAD */}
        <Card>
          <p className="micro">ACTIVIDAD RECIENTE</p>
          {state.identity.activities.length === 0 ? (
            <p className="muted">Aún no registras entrenamientos.</p>
          ) : (
            <div className="stack-xs">
              {state.identity.activities.slice(0, 6).map((a) => (
                <div className="row-between activity-row" key={a.id}>
                  <div>
                    <strong>{a.routine}</strong>
                    <p className="micro">
                      {formatDate(a.date)} · {formatTime(a.durationSeconds)} · {a.sets} series
                    </p>
                  </div>
                  <Badge tone={a.validation === "VALID" ? "success" : a.validation === "SUSPICIOUS" ? "warning" : "error"}>
                    +{formatPoints(a.activityPoints)}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </Card>

        <div className="grid-2">
          <Card onClick={() => onNavigate("routines")}>
            <strong>MIS RUTINAS</strong>
            <p className="muted">{state.identity.customRoutines.length} propias</p>
          </Card>
          <Card onClick={() => onNavigate("calendar")}>
            <strong>CALENDARIO</strong>
            <p className="muted">Historial y agenda</p>
          </Card>
        </div>

        <Card onClick={() => onNavigate("settings")}>
          <div className="row-between">
            <div>
              <strong>Privacidad y configuración</strong>
              <p className="muted">Rankings, notificaciones, GPS, sesión</p>
            </div>
            <span className="chevron">›</span>
          </div>
        </Card>

        <p className="micro center">
          {appConfig.name} · v{appConfig.version} · {appConfig.id}
        </p>
      </div>

      <Coach state="normal" message="Tu progreso queda registrado aquí." />
    </div>
  );
}
