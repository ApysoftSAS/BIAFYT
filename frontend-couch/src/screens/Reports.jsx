import { useEffect, useMemo, useState } from "react";
import { useCoach } from "../state/CoachContext.jsx";
import { Badge, Card, EmptyState, Screen, Stat, Tabs } from "../components/UI.jsx";
import { Columns } from "../components/Charts.jsx";
import { apiErrorMessage } from "../utils/api.js";
import { dayLabel, hourLabel, minutesLabel, percent, shortDate } from "../utils/report.js";

const PERIODS = [
  { id: 7, label: "7 días" },
  { id: 30, label: "30 días" },
  { id: 90, label: "90 días" },
];

/**
 * REPORTES (Coach) — cómo entrenan TUS atletas activos y qué has hecho tú.
 *
 * Datos sombra/best-effort: salen de los entrenamientos que la app del atleta
 * sincronizó; una sesión que no se sincronizó no aparece. Solo cuentan los
 * atletas con relación activa (el mismo consentimiento que el resto de la app).
 */
export default function Reports({ onOpenAthlete }) {
  const { actions } = useCoach();
  const { getReport } = actions;
  const [days, setDays] = useState(30);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(async () => {
      if (cancelled) return;
      setLoading(true);
      setError("");
      try {
        const { report: r } = await getReport(days);
        if (!cancelled) setReport(r);
      } catch (e) {
        if (!cancelled) setError(apiErrorMessage(e, "No pudimos cargar tu reporte."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [getReport, days]);

  return (
    <Screen title="REPORTES" subtitle="Tus atletas y tu actividad.">
      <div className="stack">
        <Tabs items={PERIODS} value={days} onChange={setDays} />
        {error && (
          <p className="text-warning" role="alert">
            {error}
          </p>
        )}
        {!report && loading && <p className="muted">Cargando reporte…</p>}
        {report && <Body report={report} busy={loading} onOpenAthlete={onOpenAthlete} />}
      </div>
    </Screen>
  );
}

function Body({ report, busy, onOpenAthlete }) {
  const t = report.totals;
  const { period, coach } = report;

  const hourData = useMemo(() => {
    const nonZero = report.by_hour.flatMap((n, h) => (n > 0 ? [h] : []));
    if (nonZero.length === 0) return [];
    const lo = Math.max(0, Math.min(...nonZero) - 1);
    const hi = Math.min(23, Math.max(...nonZero) + 1);
    const top = new Set(
      report.by_hour
        .map((n, h) => ({ n, h }))
        .filter((x) => x.n > 0)
        .sort((a, b) => b.n - a.n)
        .slice(0, 3)
        .map((x) => x.h)
    );
    return report.by_hour
      .map((value, hour) => ({ key: hour, label: hourLabel(hour), axis: String(hour), value, unit: "entrenamientos", emphasis: top.has(hour) }))
      .filter((d) => d.key >= lo && d.key <= hi);
  }, [report]);

  const dayData = useMemo(
    () => report.by_day.map((d) => ({ key: d.date, label: shortDate(d.date), axis: shortDate(d.date), value: d.workouts, unit: "entrenamientos" })),
    [report]
  );

  if (t.athletes === 0) {
    return (
      <EmptyState
        icon="◩"
        title="Aún no tienes atletas activos"
        text={t.pending_requests > 0 ? `Tienes ${t.pending_requests} solicitud(es) enviadas esperando respuesta.` : "Cuando un atleta acepte tu solicitud verás aquí cómo entrena."}
      />
    );
  }

  return (
    <div className="stack report-refetch" aria-busy={busy}>
      <Card className="soft">
        <p className="micro">
          Basado en los entrenamientos que sincronizan tus atletas desde su app (calidad sombra: una sesión sin sincronizar no aparece).
          Horas en {period.timezone}.
        </p>
      </Card>

      <div className="grid-2">
        <Card>
          <Stat label="Atletas activos" value={t.athletes} />
        </Card>
        <Card>
          <Stat label="Entrenaron" value={`${t.athletes_trained} · ${percent(t.athletes_trained, t.athletes)}%`} />
          <p className="micro">En los últimos {period.days} días.</p>
        </Card>
        <Card>
          <Stat label="Entrenamientos" value={t.workouts} />
          <p className="micro">{t.workouts_per_active_athlete != null ? `${t.workouts_per_active_athlete} por atleta activo` : "Sin entrenamientos"}</p>
        </Card>
        <Card>
          <Stat label="Duración promedio" value={minutesLabel(t.avg_workout_minutes)} />
        </Card>
        <Card>
          <Stat label="Requieren atención" value={t.needs_attention} tone={t.needs_attention > 0 ? "warning" : undefined} />
          <p className="micro">Sin entrenar hace más de {period.inactive_days} días.</p>
        </Card>
        <Card>
          <Stat label="Solicitudes enviadas" value={t.pending_requests} />
          <p className="micro">Esperando respuesta.</p>
        </Card>
      </div>

      {t.workouts > 0 && (
        <>
          <Card>
            <p className="micro">CUÁNDO ENTRENAN TUS ATLETAS</p>
            <Columns data={hourData} ariaLabel="Entrenamientos por hora del día" height={140} />
            <p className="micro">Hora de inicio del entrenamiento. Resaltadas, las 3 más frecuentes.</p>
          </Card>
          <Card>
            <p className="micro">ENTRENAMIENTOS POR DÍA</p>
            <Columns data={dayData} every={Math.max(1, Math.ceil(dayData.length / 5))} ariaLabel="Entrenamientos por día" height={130} />
          </Card>
        </>
      )}

      <Card>
        <p className="micro">TUS ATLETAS</p>
        <div className="stack-sm">
          {report.athletes.map((a) => (
            <button
              key={a.user.id}
              type="button"
              className="athlete-row"
              onClick={() => onOpenAthlete?.({ id: a.user.id, name: a.user.name })}
            >
              <div>
                <strong>{a.user.name}</strong>
                <p className="micro">
                  {a.workouts} entrenamientos · {a.last_activity_date ? `último ${dayLabel(a.last_activity_date)}` : "sin entrenamientos"}
                  {a.current_streak > 0 ? ` · racha ${a.current_streak}` : ""}
                </p>
              </div>
              {a.needs_attention && <Badge tone="warning">Atender</Badge>}
            </button>
          ))}
        </div>
      </Card>

      <Card>
        <p className="micro">TU ACTIVIDAD COMO COACH</p>
        <div className="grid-2">
          <Stat label={`Rutinas creadas (${coach.routines_period} en ${period.days} d)`} value={coach.routines} />
          <Stat label={`Notas (${coach.notes_period} en ${period.days} d)`} value={coach.notes} />
          <Stat label="Videos publicados" value={coach.videos} />
          <Stat label="Vouchers vigentes" value={coach.vouchers_open} />
          <Stat label={`Vouchers emitidos (${period.days} d)`} value={coach.vouchers_issued} />
          <Stat label={`Vouchers usados (${period.days} d)`} value={coach.vouchers_redeemed} />
        </div>
      </Card>
    </div>
  );
}
