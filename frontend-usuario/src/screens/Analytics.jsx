import { useMemo, useState } from "react";
import { useApp } from "../state/AppContext.jsx";
import { Badge, Bar, Button, Card, EmptyState, Screen, Stat, Tabs } from "../components/UI.jsx";
import Coach from "../components/Coach.jsx";
import { formatDate, formatPoints, formatTime } from "../utils/format.js";
import {
  comparePeriods,
  lastActivityDetail,
  personalRecords,
  routineMuscleGroups,
  summaryMetrics,
  weeklyMuscleFrequency,
  weeklySeries,
} from "../utils/analytics.js";

const TREND_METRICS = [
  { id: "count", label: "ENTRENAMIENTOS" },
  { id: "sets", label: "SERIES" },
  { id: "minutes", label: "MINUTOS" },
];

const VALIDATION_TONE = { VALID: "success", SUSPICIOUS: "warning", INVALID: "error", PENDING: "default" };

/**
 * ANALYTICS
 * Capa de lectura sobre state.identity.activities (historial real de
 * entrenamientos) + la rutina activa + data/machines.js. No hay estado
 * ni almacenamiento propio: todo se recalcula en cada render con
 * src/utils/analytics.js. Ver ese archivo para las limitaciones de
 * origen (BIAFYT aún no registra peso ni reps reales por serie).
 */
export default function Analytics({ onBack, onNavigate }) {
  const { state, routine, machineCatalog } = useApp();
  const [trendMetric, setTrendMetric] = useState("count");

  const activities = state.identity.activities;
  const summary = useMemo(() => summaryMetrics(activities), [activities]);
  const series = useMemo(() => weeklySeries(activities, 8), [activities]);
  const progress = useMemo(() => comparePeriods(activities, 14), [activities]);
  const muscleGroups = useMemo(
    () => routineMuscleGroups(routine.exercises, machineCatalog),
    [routine.exercises, machineCatalog]
  );
  const frequency = useMemo(
    () => weeklyMuscleFrequency(activities, new Date(), machineCatalog),
    [activities, machineCatalog]
  );
  const records = useMemo(() => personalRecords(activities), [activities]);
  const last = useMemo(() => lastActivityDetail(activities), [activities]);

  if (activities.length === 0) {
    return (
      <Screen title="ANALYTICS" subtitle="Tu evolución de entrenamiento" onBack={onBack}>
        <EmptyState
          icon="📊"
          title="Aún no hay datos"
          text="Completa tu primer entrenamiento para empezar a ver tus estadísticas reales."
          action={
            <Button full onClick={() => onNavigate("workout")}>
              ▶ ENTRENAR
            </Button>
          }
        />
        <Coach state="explicacion" message="Aquí verás tu progreso real en cuanto entrenes." />
      </Screen>
    );
  }

  const maxTrend = Math.max(1, ...series.map((w) => w[trendMetric]));

  return (
    <Screen title="ANALYTICS" subtitle="Tu evolución de entrenamiento" onBack={onBack}>
      <div className="stack">
        {/* MÉTRICAS PRINCIPALES */}
        <Card accent>
          <div className="grid-2">
            <Stat label="Entrenamientos" value={summary.count} />
            <Stat label="Series" value={summary.totalSets} />
            <Stat label="Minutos" value={Math.round(summary.totalDurationSeconds / 60)} />
            <Stat label="Puntos" value={formatPoints(summary.totalActivityPoints)} />
          </div>
        </Card>

        {/* EVOLUCIÓN TEMPORAL */}
        <Card>
          <p className="micro">EVOLUCIÓN — ÚLTIMAS 8 SEMANAS</p>
          <Tabs items={TREND_METRICS} value={trendMetric} onChange={setTrendMetric} />
          <div className="trend-chart">
            {series.map((w, i) => (
              <div className="trend-col" key={i}>
                <div className="trend-bar">
                  <div className="trend-bar-fill" style={{ height: `${(w[trendMetric] / maxTrend) * 100}%` }} />
                </div>
                <span className="trend-label">{formatDate(w.start)}</span>
              </div>
            ))}
          </div>
        </Card>

        {/* 1. PROGRESO */}
        <Card>
          <p className="micro">TU PROGRESO</p>
          {!progress.hasBaseline ? (
            <p className="muted">Entrena un par de semanas más para ver tu progreso comparado con el período anterior.</p>
          ) : (
            <div className="stack-xs">
              <TrendRow label="Entrenamientos" current={progress.current.count} pct={progress.trainingsDeltaPct} />
              <TrendRow label="Series" current={progress.current.totalSets} pct={progress.setsDeltaPct} />
              <TrendRow label="Minutos" current={Math.round(progress.current.totalDurationSeconds / 60)} pct={progress.minutesDeltaPct} />
            </div>
          )}
          <p className="micro">Comparado contra los 14 días anteriores.</p>
        </Card>

        {/* 2. FUERZA */}
        <Card>
          <p className="micro">PROGRESO DE FUERZA</p>
          <EmptyState
            icon="🏋️"
            title="Aún no disponible"
            text="BIAFYT todavía no registra el peso levantado en cada serie, así que no podemos calcular tu progreso de fuerza por ejercicio."
          />
        </Card>

        {/* 3. VOLUMEN */}
        <Card>
          <p className="micro">VOLUMEN DE ENTRENAMIENTO</p>
          <p className="muted">Sin peso registrado por serie, el volumen se mide en series completadas.</p>
          <div className="row-around">
            <Stat label="Series totales" value={summary.totalSets} />
            <Stat label="Series/entreno" value={summary.count > 0 ? (summary.totalSets / summary.count).toFixed(1) : "0"} />
            <Stat label="Minutos totales" value={Math.round(summary.totalDurationSeconds / 60)} />
          </div>
        </Card>

        {/* 4. GRUPOS MUSCULARES */}
        <Card>
          <p className="micro">GRUPOS MUSCULARES</p>
          <p className="muted">Según tu rutina activa: {routine.name}.</p>
          <div className="stack-xs">
            {muscleGroups.groups.map((g) => (
              <div className="muscle-row" key={g.group}>
                <span className="muscle-label">{g.group}</span>
                <Bar value={g.count} max={muscleGroups.maxCount} tone="primary" />
                <span className="muscle-count">{g.count}</span>
              </div>
            ))}
          </div>
          {muscleGroups.unmatched.length > 0 && (
            <p className="micro">
              Sin clasificar: {muscleGroups.unmatched.join(", ")} (no tienen una máquina equivalente en la biblioteca).
            </p>
          )}
        </Card>

        {/* FRECUENCIA MUSCULAR */}
        <Card>
          <p className="micro">FRECUENCIA MUSCULAR ESTA SEMANA</p>
          {frequency.matchedSessions === 0 ? (
            <p className="muted">Aún no hay entrenamientos completos esta semana que podamos analizar por grupo muscular.</p>
          ) : (
            <div className="stack-xs">
              {frequency.groups
                .filter((g) => g.sessions > 0)
                .map((g) => (
                  <div className="row-between" key={g.group}>
                    <span className="muted">{g.group.toUpperCase()}</span>
                    <Badge>{g.sessions} {g.sessions === 1 ? "sesión" : "sesiones"}</Badge>
                  </div>
                ))}
            </div>
          )}
          {frequency.unmatchedSessions > 0 && (
            <p className="micro">
              {frequency.unmatchedSessions} entrenamiento(s) con rutina personalizada no se incluyen: no podemos reconstruir sus ejercicios.
            </p>
          )}
        </Card>

        {/* 5. RÉCORDS */}
        <Card>
          <p className="micro">RÉCORDS</p>
          <div className="stack-xs">
            <RecordRow icon="🏆" label="Entrenamiento más largo" value={formatTime(records.longestSession.durationSeconds)} date={records.longestSession.date} />
            <RecordRow icon="🏆" label="Más series en una sesión" value={`${records.mostSetsSession.sets} series`} date={records.mostSetsSession.date} />
            <RecordRow icon="🏆" label="Más puntos en una sesión" value={`+${formatPoints(records.mostPointsSession.activityPoints)}`} date={records.mostPointsSession.date} />
          </div>
          <p className="micro">Basado en duración, series y puntos — sin peso registrado no incluye récords de carga.</p>
        </Card>

        {/* ÚLTIMO ENTRENAMIENTO */}
        <Card>
          <p className="micro">ÚLTIMO ENTRENAMIENTO</p>
          <div className="row-between">
            <div>
              <strong>{last.activity.routine}</strong>
              <p className="muted">
                {formatDate(last.activity.date)} · {formatTime(last.activity.durationSeconds)}
              </p>
            </div>
            <Badge tone={VALIDATION_TONE[last.activity.validation]}>+{formatPoints(last.activity.activityPoints)}</Badge>
          </div>
          <div className="row-around">
            <Stat label="Series" value={last.activity.sets} />
            <Stat label="Ejercicios" value={last.activity.exercises} />
          </div>
          {last.plannedExercises ? (
            <div className="stack-xs">
              <p className="micro">EJERCICIOS DE ESTA RUTINA</p>
              {last.plannedExercises.map((ex) => (
                <div className="row-between" key={ex.id}>
                  <span className="muted">{ex.name}</span>
                  <span className="micro">
                    {ex.sets}×{ex.reps}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="micro">Rutina personalizada: no podemos reconstruir la lista exacta de ejercicios de esa sesión.</p>
          )}
        </Card>

        {/* 6. HISTORIAL */}
        <Card>
          <p className="micro">HISTORIAL RECIENTE</p>
          <div className="stack-xs">
            {activities.slice(0, 8).map((a) => (
              <div className="row-between activity-row" key={a.id}>
                <div>
                  <strong>{a.routine}</strong>
                  <p className="micro">
                    {formatDate(a.date)} · {formatTime(a.durationSeconds)} · {a.sets} series
                  </p>
                </div>
                <Badge tone={VALIDATION_TONE[a.validation]}>+{formatPoints(a.activityPoints)}</Badge>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Coach state="normal" message="Estas métricas se calculan con tus entrenamientos reales." />
    </Screen>
  );
}

function TrendRow({ label, current, pct }) {
  const arrow = pct === null ? "" : pct > 0 ? "↑" : pct < 0 ? "↓" : "→";
  const tone = pct === null ? "" : pct > 0 ? "text-success" : pct < 0 ? "text-error" : "text-muted";
  return (
    <div className="row-between">
      <span className="muted">{label}</span>
      <span>
        {current} {pct !== null && <span className={tone}>{arrow} {Math.abs(pct)}%</span>}
      </span>
    </div>
  );
}

function RecordRow({ icon, label, value, date }) {
  return (
    <div className="row-between">
      <div>
        <span>{icon} {label}</span>
        <p className="micro">{formatDate(date)}</p>
      </div>
      <strong>{value}</strong>
    </div>
  );
}
