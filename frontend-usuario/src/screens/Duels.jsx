import { useCallback, useEffect, useState } from "react";
import { useApp } from "../state/AppContext.jsx";
import { Avatar, Badge, Button, Card, Field, Input, Screen, Stat } from "../components/UI.jsx";
import Coach from "../components/Coach.jsx";
import { apiGetDuelOpponents, apiErrorMessage } from "../utils/api.js";
import { formatPoints, formatDate, formatTime, initialsOf } from "../utils/format.js";

/**
 * DUELOS REALES (roadmap 3b). Los rivales son User reales del mismo gym
 * (`GET /me/duels/opponents`) y el estado del duelo lo lleva el backend
 * (`GET /me/duels`). Copia visible de la apuesta: LocalStorage (ver
 * `AppContext#reconcileDuels`). Metadatos de modalidad = solo texto de UI;
 * los pesos y el cálculo del ganador viven en el backend (`DuelRules`).
 */
const MODALITIES = [
  { id: "routine", name: "COMPLETAR RUTINA", description: "Gana quien termina correctamente todos los ejercicios.", maxBet: 300 },
  { id: "speed", name: "VELOCIDAD", description: "Gana quien termina antes cumpliendo las condiciones.", maxBet: 300 },
  { id: "endurance", name: "RESISTENCIA", description: "Gana quien acumula más repeticiones válidas.", maxBet: 300 },
  { id: "strength", name: "FUERZA", description: "Prioriza el volumen de trabajo completado.", maxBet: 400 },
  { id: "consistency", name: "CONSTANCIA", description: "Prioriza el ritmo sostenido durante la sesión.", maxBet: 200 },
];

const findModality = (id) => MODALITIES.find((m) => m.id === id) || MODALITIES[0];

const STATUS_LABEL = {
  pending: "Pendiente",
  accepted: "Aceptado",
  in_progress: "En progreso",
  finished: "Terminado",
  rejected: "Rechazado",
  cancelled: "Cancelado",
  unvalidated: "No validado",
};

const TERMINAL = ["finished", "rejected", "cancelled", "unvalidated"];

export default function Duels({ onStartDuelWorkout, focusDuelId, onClearFocus }) {
  const { state, me, gym, branch, duels, points, actions } = useApp();
  const token = state.auth.token;

  const [view, setView] = useState(() => (focusDuelId ? "detail" : "list")); // list | pick | bet | detail
  const [activeDuelId, setActiveDuelId] = useState(focusDuelId ?? null);
  const [opponent, setOpponent] = useState(null); // rival elegido en "pick"
  const [modalityId, setModalityId] = useState("routine");
  const [bet, setBet] = useState(100);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const [opponents, setOpponents] = useState({ list: [], status: "idle" });

  useEffect(() => {
    if (focusDuelId) onClearFocus?.();
  }, [focusDuelId, onClearFocus]);

  // Refresca la lista de duelos al abrir la pantalla (el backend es la
  // fuente de verdad; el rival puede haber aceptado/ejecutado en otra
  // sesión). Solo al montar — cada acción propia ya recarga la lista.
  const refreshDuels = actions.refreshDuels;
  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(() => {
      if (!cancelled) refreshDuels();
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadOpponents = useCallback(() => {
    if (!token) return;
    setOpponents({ list: [], status: "loading" });
    apiGetDuelOpponents(token)
      .then((d) => setOpponents({ list: Array.isArray(d?.opponents) ? d.opponents : [], status: "ok" }))
      .catch(() => setOpponents({ list: [], status: "error" }));
  }, [token]);

  const duel = duels.list.find((d) => d.id === activeDuelId) || null;
  const modality = findModality(modalityId);
  // B1: la apuesta máxima se limita por el saldo AUTORITATIVO del backend
  // (mismo valor que valida `DuelController@store` en A4). 0 si aún no cargó.
  const localPoints = points.status === "ok" && points.balance != null ? points.balance : 0;
  const maxBet = Math.max(0, Math.min(modality.maxBet, localPoints));

  const wins = state.identity.user.duels.wins;
  const losses = state.identity.user.duels.losses;
  const rate = wins + losses > 0 ? ((wins / (wins + losses)) * 100).toFixed(0) : "0";

  const run = useAction(setBusy, setError);

  // =================================================================
  // LISTA / HISTORIAL
  // =================================================================
  if (view === "list") {
    const pending = duels.list.filter((d) => ["pending", "accepted", "in_progress"].includes(d.status));
    const finished = duels.list.filter((d) => TERMINAL.includes(d.status));

    return (
      <div className="screen">
        <header className="screen-head">
          <div className="screen-title">
            <h1>DUELOS</h1>
            <p>{gym ? `${gym.name} · ${branch?.name ?? ""}` : "Sin gimnasio"}</p>
          </div>
        </header>

        <div className="screen-body">
          <Card accent>
            <div className="row-around">
              <Stat label="Duelos" value={wins + losses} />
              <Stat label="Victorias" value={wins} />
              <Stat label="Derrotas" value={losses} />
              <Stat label="Win rate" value={`${rate}%`} />
            </div>
          </Card>

          <Button
            full
            onClick={() => {
              setError("");
              setOpponent(null);
              setQuery("");
              loadOpponents();
              setView("pick");
            }}
          >
            ⚔ RETAR A ALGUIEN
          </Button>

          {duels.status === "error" && <p className="muted center">No se pudieron cargar tus duelos.</p>}

          {pending.length > 0 && (
            <>
              <h3 className="section-title">EN CURSO</h3>
              <div className="stack-sm">
                {pending.map((d) => (
                  <DuelRow key={d.id} d={d} me={me} onOpen={() => { setActiveDuelId(d.id); setView("detail"); }} />
                ))}
              </div>
            </>
          )}

          <h3 className="section-title">HISTORIAL</h3>
          {finished.length === 0 ? (
            <p className="muted">Todavía no tienes duelos terminados.</p>
          ) : (
            <div className="stack-sm">
              {finished.map((d) => (
                <DuelRow key={d.id} d={d} me={me} onOpen={() => { setActiveDuelId(d.id); setView("detail"); }} />
              ))}
            </div>
          )}
        </div>

        <Coach state="competitivo" message="Un duelo bien elegido acelera tu progreso." />
      </div>
    );
  }

  // =================================================================
  // SELECCIONAR RIVAL (rivales reales del mismo gym)
  // =================================================================
  if (view === "pick") {
    const list = opponents.list.filter((u) =>
      query ? u.name.toLowerCase().includes(query.toLowerCase()) : true
    );
    return (
      <Screen title="¿CONTRA QUIÉN QUIERES COMPETIR?" subtitle="Usuarios de tu gimnasio." onBack={() => setView("list")}>
        <div className="stack">
          <Field label="Buscar">
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Nombre" />
          </Field>

          {opponents.status === "loading" && <p className="muted center">Cargando…</p>}
          {opponents.status === "error" && <p className="muted center">No se pudo cargar la lista de rivales.</p>}
          {opponents.status === "ok" && list.length === 0 && (
            <p className="muted center">No hay rivales disponibles en tu gimnasio.</p>
          )}

          <div className="stack-sm">
            {list.map((u) => (
              <Card
                key={u.id}
                onClick={() => {
                  setOpponent(u);
                  setModalityId("routine");
                  setBet(Math.min(100, Math.max(0, Math.min(findModality("routine").maxBet, localPoints))));
                  setError("");
                  setView("bet");
                }}
              >
                <div className="row-between">
                  <div className="row-left">
                    <Avatar name={u.name} initials={initialsOf(u.name)} size={42} />
                    <div>
                      <strong>{u.name}</strong>
                      <p className="micro">
                        {u.duels_won}V / {u.duels_lost}D
                      </p>
                    </div>
                  </div>
                  <span className="chevron">›</span>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </Screen>
    );
  }

  // =================================================================
  // MODALIDAD Y APUESTA
  // =================================================================
  if (view === "bet" && opponent) {
    const invalid = bet <= 0 || bet > maxBet || busy;
    return (
      <Screen title="CONDICIONES DEL DUELO" onBack={() => setView("pick")}>
        <div className="stack">
          <Card>
            <div className="versus">
              <div className="versus-side">
                <Avatar name={me.name} initials={me.initials} size={54} highlight />
                <strong>Tú</strong>
              </div>
              <span className="versus-vs">VS</span>
              <div className="versus-side">
                <Avatar name={opponent.name} initials={initialsOf(opponent.name)} size={54} />
                <strong>{opponent.name.split(" ")[0]}</strong>
              </div>
            </div>
          </Card>

          <Card>
            <p className="micro">MODALIDAD</p>
            <div className="stack-xs">
              {MODALITIES.map((m) => (
                <button
                  key={m.id}
                  className={`option ${modalityId === m.id ? "option-on" : ""}`}
                  onClick={() => {
                    setModalityId(m.id);
                    setBet((b) => Math.min(b, Math.min(m.maxBet, localPoints)));
                  }}
                >
                  <strong>{m.name}</strong>
                  <span className="muted">{m.description}</span>
                </button>
              ))}
            </div>
          </Card>

          <Card>
            <p className="micro">¿CUÁNTOS PUNTOS QUIERES APOSTAR?</p>
            <div className="row-between">
              <Stat label="Disponibles" value={formatPoints(localPoints)} />
              <Stat label="Máximo permitido" value={formatPoints(maxBet)} />
            </div>
            <input
              className="range"
              type="range"
              min="0"
              max={Math.max(0, maxBet)}
              step="10"
              value={Math.min(bet, maxBet)}
              onChange={(e) => setBet(Number(e.target.value))}
            />
            <h2 className="big-number">{formatPoints(Math.min(bet, maxBet))}</h2>
            <p className="micro">El límite depende de tus puntos disponibles y del máximo de la modalidad ({modality.maxBet}).</p>
            <p className="micro text-warning">Al enviar el reto, tus puntos quedarán BLOQUEADOS hasta que termine el duelo.</p>
          </Card>

          {error && <p className="micro text-warning">{error}</p>}

          <Button
            full
            disabled={invalid}
            onClick={() =>
              run(async () => {
                const created = await actions.createDuel({
                  opponentUserId: opponent.id,
                  modality: modalityId,
                  stake: Math.min(bet, maxBet),
                });
                actions.notify({
                  channel: "duels",
                  title: "Reto enviado.",
                  body: `Esperando que ${opponent.name} lo acepte.`,
                  tone: "duel",
                });
                setActiveDuelId(created.id);
                setView("detail");
              })
            }
          >
            {busy ? "ENVIANDO…" : `ENVIAR RETO Y BLOQUEAR ${formatPoints(Math.min(bet, maxBet))} PUNTOS`}
          </Button>
        </div>
      </Screen>
    );
  }

  // =================================================================
  // DETALLE / RESULTADO
  // =================================================================
  if (view === "detail" && duel) {
    const mod = findModality(duel.modality);
    const rivalName = duel.viewer_role === "challenger" ? duel.opponent.name : duel.challenger.name;
    const iAmChallenger = duel.viewer_role === "challenger";

    // --- RETO RECIBIDO SIN RESPONDER ---
    if (duel.status === "pending" && !iAmChallenger) {
      return (
        <Screen title="NUEVO RETO" onBack={() => setView("list")}>
          <div className="stack">
            <Card accent>
              <strong className="dark">🔥 {rivalName} te ha retado a un duelo.</strong>
              <p className="micro dark">
                {mod.name} · {formatPoints(duel.stake)} puntos en juego
              </p>
            </Card>
            <Card>
              <p className="muted">Si aceptas, se bloquearán {formatPoints(duel.stake)} de tus puntos hasta que termine el duelo.</p>
              <Stat label="Tus puntos disponibles" value={formatPoints(localPoints)} />
            </Card>
            {error && <p className="micro text-warning">{error}</p>}
            <Button
              full
              disabled={localPoints < duel.stake || busy}
              onClick={() =>
                run(async () => {
                  await actions.acceptDuel(duel.id, duel.stake);
                  actions.notify({ channel: "duels", title: "Duelo aceptado.", body: "Realiza la misma rutina para competir.", tone: "duel" });
                })
              }
            >
              {busy ? "…" : "ACEPTAR DUELO"}
            </Button>
            <Button
              variant="ghost"
              full
              disabled={busy}
              onClick={() =>
                run(async () => {
                  await actions.rejectDuel(duel.id);
                  actions.notify({ channel: "duels", title: "Duelo rechazado.", tone: "alert" });
                  setView("list");
                })
              }
            >
              RECHAZAR
            </Button>
          </div>
          <Coach state="competitivo" message={`${rivalName} quiere medirse contigo.`} />
        </Screen>
      );
    }

    // --- ESPERANDO RESPUESTA DEL RIVAL ---
    if (duel.status === "pending" && iAmChallenger) {
      return (
        <Screen title="RETO ENVIADO" onBack={() => setView("list")}>
          <div className="stack">
            <Card>
              <strong>Esperando a que {rivalName} acepte el reto.</strong>
              <p className="muted">
                {mod.name} · {formatPoints(duel.stake)} puntos bloqueados
              </p>
            </Card>
            {error && <p className="micro text-warning">{error}</p>}
            <Button
              variant="ghost"
              full
              disabled={busy}
              onClick={() =>
                run(async () => {
                  await actions.cancelDuel(duel.id);
                  actions.notify({ channel: "duels", title: "Reto cancelado.", body: "Te devolvimos los puntos bloqueados.", tone: "alert" });
                  setView("list");
                })
              }
            >
              CANCELAR RETO
            </Button>
          </div>
        </Screen>
      );
    }

    // --- ACEPTADO / EN PROGRESO ---
    if (duel.status === "accepted" || duel.status === "in_progress") {
      return (
        <Screen title="DUELO ACEPTADO" onBack={() => setView("list")}>
          <div className="stack">
            <Card>
              <div className="versus">
                <div className="versus-side">
                  <Avatar name={me.name} initials={me.initials} size={54} highlight />
                  <strong>Tú</strong>
                </div>
                <span className="versus-vs">VS</span>
                <div className="versus-side">
                  <Avatar name={rivalName} initials={initialsOf(rivalName)} size={54} />
                  <strong>{rivalName.split(" ")[0]}</strong>
                </div>
              </div>
              <div className="row-around">
                <Stat label="Modalidad" value={mod.name} />
                <Stat label="En juego" value={formatPoints(duel.stake)} />
                <Stat label="Puntos" value="Bloqueado" tone="warning" />
              </div>
            </Card>
            <Card className="soft">
              <strong>Ambos realizan la MISMA rutina.</strong>
              <p className="muted">El duelo requiere GPS activo en tu sede. Sin validación no se entregan puntos.</p>
            </Card>

            {duel.you_submitted ? (
              <Card>
                <Badge tone="accent">EJECUCIÓN ENVIADA</Badge>
                <p className="muted">
                  {duel.opponent_submitted ? "Resolviendo el duelo…" : `Esperando a que ${rivalName} complete la rutina.`}
                </p>
              </Card>
            ) : (
              <Button full disabled={busy} onClick={() => onStartDuelWorkout(duel.id)}>
                ▶ REALIZAR LA RUTINA
              </Button>
            )}
            {iAmChallenger && (
              <Button
                variant="ghost"
                full
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    await actions.cancelDuel(duel.id);
                    actions.notify({ channel: "duels", title: "Duelo cancelado.", body: "Te devolvimos los puntos bloqueados.", tone: "alert" });
                    setView("list");
                  })
                }
              >
                CANCELAR DUELO
              </Button>
            )}
          </div>
          <Coach state="competitivo" message="Mismas condiciones para los dos. Suerte." />
        </Screen>
      );
    }

    // --- TERMINADO ---
    const result = duel.result;
    const won = duel.status === "finished" && duel.winner_user_id === me.id;
    const draw = duel.status === "finished" && duel.winner_user_id == null;
    const mine = result ? result[duel.viewer_role] : null;
    const theirs = result ? result[iAmChallenger ? "opponent" : "challenger"] : null;

    return (
      <Screen title="DUELO TERMINADO" onBack={() => setView("list")}>
        <div className="stack">
          {duel.status === "unvalidated" ? (
            <Card>
              <Badge tone="error">DUELO NO VALIDADO</Badge>
              <p className="muted">No se cumplieron las condiciones de validación (GPS, ubicación o tiempos). Se devolvieron los puntos apostados.</p>
            </Card>
          ) : duel.status === "rejected" || duel.status === "cancelled" ? (
            <Card>
              <Badge tone="default">{STATUS_LABEL[duel.status].toUpperCase()}</Badge>
              <p className="muted">El duelo no llegó a disputarse. Los puntos bloqueados fueron devueltos.</p>
            </Card>
          ) : (
            <>
              <Card accent>
                <p className="micro dark">{draw ? "RESULTADO" : "GANADOR"}</p>
                <h2 className="dark">{draw ? "Empate 🤝" : `${won ? me.name : rivalName} 🏆`}</h2>
              </Card>
              <div className="grid-2">
                <Card>
                  <p className="micro">TÚ</p>
                  <h3>{mine?.total ?? "—"}</h3>
                  <p className="muted">{formatTime(duel.your_run?.duration_seconds ?? 0)}</p>
                </Card>
                <Card>
                  <p className="micro">{rivalName.toUpperCase()}</p>
                  <h3>{theirs?.total ?? "—"}</h3>
                  <p className="muted">{formatTime(duel.their_run?.duration_seconds ?? 0)}</p>
                </Card>
              </div>
              {mine && theirs && (
                <Card>
                  <p className="micro">DESGLOSE ({mod.name})</p>
                  {Object.keys(mine.breakdown).map((k) => (
                    <div className="row-between breakdown" key={k}>
                      <span className="muted">{k}</span>
                      <span>
                        <strong>{mine.breakdown[k]}</strong> <span className="muted">vs {theirs.breakdown[k]}</span>
                      </span>
                    </div>
                  ))}
                </Card>
              )}
              <Card className={won ? "win" : draw ? "soft" : "lose"}>
                <h2>
                  {draw ? "±0" : won ? "+" : "−"}
                  {draw ? "" : formatPoints(duel.stake)} {draw ? "" : "SOMA POINTS"}
                </h2>
                <p className="muted">
                  {draw ? "Se devolvió tu apuesta." : won ? "Recibiste los puntos apostados." : "Perdiste los puntos apostados."}
                </p>
              </Card>
            </>
          )}
          <Button full onClick={() => setView("list")}>
            VOLVER A DUELOS
          </Button>
        </div>
        <Coach state={won ? "victoria" : "derrota"} message={won ? "¡Ganaste tu duelo!" : "La revancha se entrena."} />
      </Screen>
    );
  }

  return (
    <Screen title="DUELOS" onBack={() => setView("list")}>
      <p className="muted">Selecciona un duelo.</p>
    </Screen>
  );
}

/** Fila compacta de un duelo en la lista. */
function DuelRow({ d, me, onOpen }) {
  const rivalName = d.viewer_role === "challenger" ? d.opponent.name : d.challenger.name;
  const won = d.status === "finished" && d.winner_user_id === me.id;
  const lost = d.status === "finished" && d.winner_user_id != null && d.winner_user_id !== me.id;
  const tone =
    d.status === "pending" ? "warning" : d.status === "finished" ? (won ? "success" : lost ? "error" : "default") : "accent";
  const badge = won ? `+${formatPoints(d.stake)}` : lost ? `−${formatPoints(d.stake)}` : STATUS_LABEL[d.status];
  return (
    <Card onClick={onOpen}>
      <div className="row-between">
        <div>
          <strong>vs {rivalName}</strong>
          <p className="muted">
            {formatDate(d.created_at)} · {findModality(d.modality).name}
          </p>
        </div>
        <Badge tone={tone}>{badge}</Badge>
      </div>
    </Card>
  );
}

/**
 * Pequeño helper para acciones async con estado busy/error compartido.
 * Devuelve una función `run(fn)` que envuelve la llamada.
 */
function useAction(setBusy, setError) {
  return useCallback(
    async (fn) => {
      setBusy(true);
      setError("");
      try {
        await fn();
      } catch (err) {
        setError(apiErrorMessage(err, "No se pudo completar la acción."));
      } finally {
        setBusy(false);
      }
    },
    [setBusy, setError]
  );
}
