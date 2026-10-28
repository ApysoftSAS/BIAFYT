import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "../state/AppContext.jsx";
import { Button, Card, Badge, Screen, Stat } from "../components/UI.jsx";
import Coach from "../components/Coach.jsx";
import { formatTime, formatPoints } from "../utils/format.js";
import { GPS_STATE, requestPosition, evaluateProximity } from "../utils/gps.js";
import { ACTIVITY_STATE, validateActivity, computeWorkoutPoints, stateLabel, stateMessage } from "../utils/validation.js";
import { feedback } from "../utils/feedback.js";
import { setsFor, unitFor } from "../utils/exercisePrescription.js";

/**
 * ENTRENAMIENTO
 * Conserva el flujo original (serie → descanso con temporizador y Coach)
 * y añade encima: validación GPS, medición de tiempos, estados de
 * validación y separación entre puntos de actividad y competitivos.
 *
 * `duel` opcional: ejecuta la MISMA rutina en modo duelo (punto 98).
 */
export default function Workout({ onExit, duel = null, onDuelRun }) {
  const { state, branch, routine, actions } = useApp();
  const competitive = Boolean(duel) || state.device.settings.gpsCompetitive;

  const [phase, setPhase] = useState("gate"); // gate | active | rest | summary
  const [gps, setGps] = useState({ state: GPS_STATE.IDLE, coords: null, near: false, distance: null });
  const [cursor, setCursor] = useState({ exercise: 0, set: 1 });
  const [progress, setProgress] = useState({ sets: 0, exercises: 0 });
  const [timeLeft, setTimeLeft] = useState(0);
  const [result, setResult] = useState(null);

  // Solo se leen/escriben en handlers y efectos, nunca durante el render.
  const marks = useRef({ startedAt: 0, setStartedAt: 0, restStartedAt: 0 });
  const metrics = useRef({ setDurations: [], restDurations: [], validReps: 0 });

  const exercises = routine.exercises;
  const exercise = exercises[cursor.exercise];
  const settings = useMemo(
    () => ({ sound: state.device.settings.sound, vibration: state.device.settings.vibration }),
    [state.device.settings.sound, state.device.settings.vibration]
  );
  const totalSets = useMemo(() => exercises.reduce((t, e) => t + setsFor(e), 0), [exercises]);

  // ---------------------------------------------------------------
  // GPS (puntos 59, 60, 88)
  // ---------------------------------------------------------------
  const askGps = useCallback(
    async (simulate = false) => {
      setGps((g) => ({ ...g, state: GPS_STATE.REQUESTING }));
      const pos = await requestPosition({
        simulateAt: simulate && branch?.lat ? { lat: branch.lat, lng: branch.lng } : null,
      });
      const prox = evaluateProximity(pos.coords, branch);
      setGps({ ...pos, near: prox.near, distance: prox.distance });
    },
    [branch]
  );

  const beginWorkout = useCallback(() => {
    const now = Date.now();
    marks.current = { startedAt: now, setStartedAt: now, restStartedAt: 0 };
    metrics.current = { setDurations: [], restDurations: [], validReps: 0 };
    setCursor({ exercise: 0, set: 1 });
    setProgress({ sets: 0, exercises: 0 });
    setPhase("active");
    feedback("start", settings);
  }, [settings]);

  // ---------------------------------------------------------------
  // FINALIZAR Y VALIDAR (puntos 60, 61, 62)
  // ---------------------------------------------------------------
  const finishWorkout = useCallback(
    (finalProgress) => {
      const durationSeconds = (Date.now() - marks.current.startedAt) / 1000;
      const session = {
        durationSeconds,
        setsCompleted: finalProgress.sets,
        exercisesCompleted: finalProgress.exercises,
        setDurations: metrics.current.setDurations,
        restDurations: metrics.current.restDurations,
        gps: {
          required: competitive,
          granted: gps.state === GPS_STATE.GRANTED,
          near: gps.near,
          distance: gps.distance,
        },
      };

      const validation = validateActivity(session);
      const points = computeWorkoutPoints(session, validation, state.identity.user.streak);

      const run = {
        durationSeconds,
        exercisesCompleted: session.exercisesCompleted,
        setsCompleted: session.setsCompleted,
        validReps: metrics.current.validReps,
        consistency: Math.min(100, Math.round(state.identity.user.stats.consistency)),
        penalties: validation.state === ACTIVITY_STATE.SUSPICIOUS ? 1 : 0,
      };

      actions.addActivity({
        routine: routine.name,
        durationSeconds,
        sets: session.setsCompleted,
        exercises: session.exercisesCompleted,
        validation: validation.state,
        activityPoints: points.activityPoints,
        competitivePoints: points.competitivePoints,
        duelId: duel?.id ?? null,
      });
      actions.addPoints(points.activityPoints, "Entrenamiento");
      actions.notify({
        channel: "training",
        title: stateLabel[validation.state],
        body: stateMessage[validation.state],
        tone: validation.state === ACTIVITY_STATE.VALID ? "success" : "alert",
      });

      setResult({ session, validation, points, run });
      setPhase("summary");
    },
    [actions, competitive, duel, gps, routine.name, state.identity.user.streak, state.identity.user.stats.consistency]
  );

  // ---------------------------------------------------------------
  // TERMINAR SERIE
  // ---------------------------------------------------------------
  const finishSet = useCallback(() => {
    const duration = (Date.now() - marks.current.setStartedAt) / 1000;
    metrics.current.setDurations.push(duration);
    // Cardio en modo abierto (sin `duration` objetivo) no aporta un valor
    // medible aquí sin cronómetro propio: suma 0 en vez de inventar un dato.
    metrics.current.validReps += unitFor(exercise).value ?? 0;

    const lastSetOfExercise = cursor.set >= setsFor(exercise);
    const lastExercise = cursor.exercise >= exercises.length - 1;
    const nextProgress = {
      sets: progress.sets + 1,
      exercises: progress.exercises + (lastSetOfExercise ? 1 : 0),
    };
    setProgress(nextProgress);

    if (lastSetOfExercise && lastExercise) {
      finishWorkout(nextProgress);
      return;
    }

    marks.current.restStartedAt = Date.now();
    setTimeLeft(exercise.rest);
    setPhase("rest");
    feedback("success", { sound: settings.sound, vibration: false });
  }, [cursor, exercise, exercises.length, finishWorkout, progress, settings.sound]);

  // ---------------------------------------------------------------
  // TEMPORIZADOR DE DESCANSO (comportamiento original conservado)
  // ---------------------------------------------------------------
  useEffect(() => {
    if (phase !== "rest" || timeLeft <= 0) return;
    const timer = setInterval(() => setTimeLeft((prev) => prev - 1), 1000);
    return () => clearInterval(timer);
  }, [phase, timeLeft]);

  // Aviso sonoro en la cuenta atrás final (punto 72)
  useEffect(() => {
    if (phase !== "rest" || timeLeft > 3 || timeLeft <= 0) return;
    feedback("tick", { sound: settings.sound, vibration: false });
  }, [phase, timeLeft, settings.sound]);

  // Fin del descanso: el Coach sale y avanzamos de serie
  useEffect(() => {
    if (phase !== "rest" || timeLeft > 0) return;
    feedback("restEnd", settings);
    metrics.current.restDurations.push((Date.now() - marks.current.restStartedAt) / 1000);

    const timeout = setTimeout(() => {
      marks.current.setStartedAt = Date.now();
      setCursor((prev) => {
        const current = exercises[prev.exercise];
        if (prev.set >= setsFor(current)) {
          return { exercise: Math.min(exercises.length - 1, prev.exercise + 1), set: 1 };
        }
        return { ...prev, set: prev.set + 1 };
      });
      setPhase("active");
    }, 700);
    return () => clearTimeout(timeout);
  }, [phase, timeLeft, settings, exercises]);

  // ---------------------------------------------------------------
  // COACH DERIVADO DEL ESTADO (puntos 66, 67)
  // ---------------------------------------------------------------
  const coach = useMemo(() => {
    if (phase === "gate") return { state: "explicacion", message: "El GPS solo se usa para validar lo competitivo." };
    if (phase === "active") return { state: "motivacion", message: `¡Vamos! Serie ${cursor.set} de ${setsFor(exercise)}.` };
    if (phase === "rest") {
      if (timeLeft <= 0) return { state: "motivacion", message: "¡Vamos con la siguiente!" };
      if (timeLeft <= 15) return { state: "competitivo", message: "¡Prepárate!" };
      return { state: "descanso", message: "Respira. Recupera." };
    }
    const valid = result?.validation.state === ACTIVITY_STATE.VALID;
    return {
      state: valid ? "celebracion" : "alerta",
      message: valid ? "¡Entrenamiento completado!" : "Revisa la validación de la sesión.",
    };
  }, [phase, cursor.set, exercise, timeLeft, result]);

  // ---------------------------------------------------------------
  // PANTALLA: PUERTA GPS (punto 59)
  // ---------------------------------------------------------------
  if (phase === "gate") {
    const denied = gps.state === GPS_STATE.DENIED || gps.state === GPS_STATE.UNAVAILABLE;
    return (
      <Screen title={duel ? "DUELO — MISMA RUTINA" : "ANTES DE EMPEZAR"} onBack={onExit}>
        <div className="stack">
          <Card>
            <p className="micro">RUTINA</p>
            <h3>{routine.name}</h3>
            <p className="muted">
              {exercises.length} ejercicios · {totalSets} series
            </p>
          </Card>

          {competitive ? (
            <Card>
              <h3>GPS requerido</h3>
              <p className="muted">
                Para que esta actividad genere puntos para rankings y premios necesitamos validar que el entrenamiento se realiza en el gimnasio.
              </p>
              {branch && (
                <p className="micro">
                  Sede: {branch.name} · {branch.address}
                </p>
              )}

              {gps.state === GPS_STATE.GRANTED && (
                <p className={gps.near ? "text-success" : "text-warning"}>
                  {gps.near ? "Ubicación validada en tu sede." : `Estás a ${Math.round(gps.distance ?? 0)} m de tu sede.`}
                </p>
              )}
              {denied && <p className="text-warning">No pudimos leer tu ubicación. Puedes entrenar igual, pero sin puntos competitivos.</p>}

              <Button full onClick={() => askGps(false)} disabled={gps.state === GPS_STATE.REQUESTING}>
                {gps.state === GPS_STATE.REQUESTING ? "BUSCANDO SEÑAL…" : "ACTIVAR GPS"}
              </Button>
              {import.meta.env.DEV && branch?.lat && (
                <Button variant="ghost" full onClick={() => askGps(true)}>
                  SIMULAR UBICACIÓN EN LA SEDE (demo)
                </Button>
              )}
            </Card>
          ) : (
            <Card className="soft">
              <p className="muted">
                Tienes desactivado el GPS para actividades competitivas. Esta sesión sumará puntos de actividad, pero no competitivos.
              </p>
            </Card>
          )}

          <Button full onClick={beginWorkout}>
            ▶ INICIAR ENTRENAMIENTO
          </Button>
        </div>
        <Coach state={coach.state} message={coach.message} />
      </Screen>
    );
  }

  // ---------------------------------------------------------------
  // PANTALLA: SERIE
  // ---------------------------------------------------------------
  if (phase === "active") {
    const unit = unitFor(exercise);
    return (
      <div className="screen workout">
        <header className="workout-head">
          <button className="icon-btn" onClick={onExit} aria-label="Salir">
            ✕
          </button>
          <div className="workout-progress">
            <div className="progress-line">
              <div className="progress-fill" style={{ width: `${(progress.sets / totalSets) * 100}%` }} />
            </div>
            <span className="micro">
              {progress.sets}/{totalSets} series
            </span>
          </div>
          {duel && <Badge tone="accent">DUELO</Badge>}
        </header>

        <div className="workout-body">
          <p className="micro">
            EJERCICIO {cursor.exercise + 1} DE {exercises.length}
          </p>
          <h1 className="exercise-name">{exercise.name}</h1>
          <div className="set-counter">
            SERIE {cursor.set} / {setsFor(exercise)}
          </div>
          {unit.open ? (
            <div className="reps">
              <span>CARDIO LIBRE — SIN OBJETIVO DE TIEMPO</span>
            </div>
          ) : (
            <div className="reps">
              {unit.isTime ? formatTime(unit.value) : unit.value}
              <span>{unit.label}</span>
            </div>
          )}
          <button className="finish-button" onClick={finishSet}>
            <span className="finish-icon">✓</span>
            <span>TERMINÉ LA SERIE</span>
          </button>
        </div>

        <Coach state={coach.state} message={coach.message} />
      </div>
    );
  }

  // ---------------------------------------------------------------
  // PANTALLA: DESCANSO (flujo original conservado, punto 67)
  // ---------------------------------------------------------------
  if (phase === "rest") {
    const nextSet = cursor.set >= setsFor(exercise) ? 1 : cursor.set + 1;
    const nextExercise = cursor.set >= setsFor(exercise) ? exercises[cursor.exercise + 1] : exercise;
    return (
      <div className="screen workout rest-screen">
        <h1>DESCANSO</h1>
        <div className="timer">{formatTime(timeLeft)}</div>
        <p className="muted">
          Prepárate para la serie <strong>{nextSet}</strong>
          {nextExercise && nextExercise !== exercise ? ` de ${nextExercise.name}` : ""}
        </p>
        <button className="btn btn-ghost" onClick={() => setTimeLeft(0)}>
          SALTAR DESCANSO
        </button>
        <Coach state={coach.state} message={coach.message} />
      </div>
    );
  }

  // ---------------------------------------------------------------
  // PANTALLA: RESUMEN Y VALIDACIÓN
  // ---------------------------------------------------------------
  const { validation, points, session } = result;
  const tone = { VALID: "success", SUSPICIOUS: "warning", INVALID: "error", PENDING: "default" }[validation.state];

  return (
    <Screen title="ENTRENAMIENTO FINALIZADO">
      <div className="stack">
        <Card>
          <Badge tone={tone}>{stateLabel[validation.state]}</Badge>
          <p className="muted">{stateMessage[validation.state]}</p>
          {validation.reasons.length > 0 && (
            <ul className="reasons">
              {validation.reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          )}
        </Card>

        <div className="grid-3">
          <Stat label="Duración" value={formatTime(session.durationSeconds)} />
          <Stat label="Series" value={session.setsCompleted} />
          <Stat label="Ejercicios" value={session.exercisesCompleted} />
        </div>

        <Card>
          <div className="row-between">
            <div>
              <p className="micro">PUNTOS DE ACTIVIDAD</p>
              <h3>+{formatPoints(points.activityPoints)}</h3>
            </div>
            <div className="right">
              <p className="micro">PUNTOS COMPETITIVOS</p>
              <h3 className={points.competitivePoints ? "text-success" : "text-muted"}>+{formatPoints(points.competitivePoints)}</h3>
            </div>
          </div>
          {!points.competitivePoints && <p className="micro">Los puntos competitivos requieren GPS validado en tu sede.</p>}
        </Card>

        {duel ? (
          <Button full onClick={() => onDuelRun(result.run, validation)}>
            VER RESULTADO DEL DUELO
          </Button>
        ) : (
          <Button full onClick={onExit}>
            VOLVER AL INICIO
          </Button>
        )}
      </div>
      <Coach state={coach.state} message={coach.message} />
    </Screen>
  );
}
