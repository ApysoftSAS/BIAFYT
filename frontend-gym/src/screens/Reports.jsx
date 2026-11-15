import { useEffect, useMemo, useState } from "react";
import { useSession } from "../state/SessionContext.jsx";
import { Card, Panel, Stat, EmptyState, Field } from "../components/UI.jsx";
import { Columns, Heatmap, RankedBars } from "../components/Charts.jsx";
import { apiErrorMessage } from "../utils/api.js";
import { WEEKDAYS, dayLabel, downloadText, hourLabel, hourRange, minutesLabel, percent, reportToCsv, shortDate } from "../utils/report.js";

const PERIODS = [7, 30, 90];

// En la app nativa (Capacitor) no hay descarga por blob ni impresión: sin exportar.
const NATIVE = typeof window !== "undefined" && Boolean(window.Capacitor?.isNativePlatform?.());

/**
 * REPORTES (Gym Web) — información administrativa del gimnasio: cuánta gente
 * asiste, a qué hora, qué días, por sede, y a quién se está perdiendo.
 *
 * Los números salen de los check-ins que los miembros hacen en la app
 * BIAFYT. El check-in no guarda en qué gimnasio ocurrió: el backend lo
 * atribuye a este gimnasio por la membresía activa de la persona (desde su
 * fecha de alta). Esa limitación se muestra aquí, no se esconde.
 */
export default function Reports() {
  const { gymAccess, actions } = useSession();
  const [days, setDays] = useState(30);
  const [branchId, setBranchId] = useState("");
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
        const { report: r } = await actions.getReport({ days, branchId: branchId || null });
        if (!cancelled) setReport(r);
      } catch (e) {
        if (!cancelled) setError(apiErrorMessage(e, "No pudimos cargar el reporte."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [actions, days, branchId, gymAccess.activeGymId]);

  return (
    <div>
      <div className="gym-main-head">
        <h2>Reportes</h2>
        <p>Asistencia, horas pico y miembros en riesgo de tu gimnasio.</p>
      </div>

      <div className="report-filters">
        <div className="seg" role="group" aria-label="Periodo">
          {PERIODS.map((p) => (
            <button key={p} type="button" className="btn btn-ghost" aria-pressed={days === p} onClick={() => setDays(p)}>
              {p} días
            </button>
          ))}
        </div>
        {(report?.by_branch.length ?? 0) > 1 && (
          <Field label="Sede">
            <select className="input" value={branchId} onChange={(e) => setBranchId(e.target.value)}>
              <option value="">Todas las sedes</option>
              {report.by_branch.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        {report && !NATIVE && (
          <div className="seg report-actions">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                const gym = gymAccess.gyms.find((g) => g.id === gymAccess.activeGymId)?.name ?? "gimnasio";
                downloadText(`reporte-${gym.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${report.period.to}.csv`, reportToCsv(report, gym));
              }}
            >
              Exportar CSV
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => window.print()}>
              Imprimir / PDF
            </button>
          </div>
        )}
      </div>

      {error && (
        <p className="text-warning" role="alert">
          {error}
        </p>
      )}
      {!report && loading && <p className="muted">Cargando reporte…</p>}
      {report && <ReportBody report={report} busy={loading} />}
    </div>
  );
}

function ReportBody({ report, busy }) {
  const t = report.totals;
  const { period } = report;

  const hourData = useMemo(() => {
    const top = new Set(report.peak_hours.map((h) => h.hour));
    const [lo, hi] = hourRange(report.by_weekday_hour);
    return report.by_hour
      .map((value, hour) => ({ key: hour, label: hourLabel(hour), axis: String(hour), value, emphasis: top.has(hour) }))
      .filter((d) => d.key >= lo && d.key <= hi);
  }, [report]);

  const dayData = useMemo(
    () => report.by_day.map((d) => ({ key: d.date, label: shortDate(d.date), axis: shortDate(d.date), value: d.check_ins })),
    [report]
  );
  const dayEvery = Math.max(1, Math.ceil(dayData.length / 8));

  const heatRange = useMemo(() => hourRange(report.by_weekday_hour), [report]);

  if (t.members === 0) {
    return (
      <EmptyState
        icon="◩"
        title="Aún no hay miembros"
        text="Cuando añadas miembros desde Espacio y hagan check-in en la app, verás aquí la asistencia."
      />
    );
  }

  const peakText = report.peak_hours.map((h) => hourLabel(h.hour)).join(" · ");

  return (
    <div className="report-refetch stack" aria-busy={busy}>
      <Card className="soft">
        <p className="report-note">
          Basado en los <strong>check-ins que tus miembros hacen en la app BIAFYT</strong>, atribuidos a este gimnasio por su
          membresía activa (desde su fecha de alta). No es un conteo de acceso físico: no incluye a quien no usa la app. Horas en{" "}
          {period.timezone}.
        </p>
      </Card>

      <div className="gym-grid">
        <Card>
          <Stat label="Miembros activos" value={t.members} />
        </Card>
        <Card>
          <Stat label="Check-ins hoy" value={t.check_ins_today} />
        </Card>
        <Card>
          <Stat label="Dentro ahora (est.)" value={t.inside_now_estimate} />
          <p className="micro">Check-in de hoy sin salida, en las últimas {period.stay_hours_estimate} h.</p>
        </Card>
        <Card>
          <Stat label="Hora pico" value={report.peak_hours[0] ? hourLabel(report.peak_hours[0].hour) : "—"} />
          <p className="micro">Hora con más check-ins en el periodo.</p>
        </Card>
        <Card>
          <Stat label={`Check-ins (${period.days} días)`} value={t.check_ins} />
        </Card>
        <Card>
          <Stat label="Miembros que asistieron" value={`${t.active_members} · ${percent(t.active_members, t.members)}%`} />
          <p className="micro">Con al menos un check-in en el periodo.</p>
        </Card>
        <Card>
          <Stat label="Visitas por miembro activo" value={t.visits_per_active_member ?? "—"} />
        </Card>
        <Card>
          <Stat label="Permanencia promedio" value={minutesLabel(t.avg_stay_minutes)} />
          <p className="micro">Solo de {t.stays_measured} visitas con salida registrada.</p>
        </Card>
        <Card>
          <Stat label="Miembros nuevos" value={t.new_members} />
        </Card>
        <Card>
          <Stat label="Entrenamientos registrados" value={t.workouts} />
          <p className="micro">{t.avg_workout_minutes != null ? `Duración promedio: ${minutesLabel(t.avg_workout_minutes)}.` : "Sin entrenamientos en el periodo."}</p>
        </Card>
      </div>

      {t.check_ins === 0 ? (
        <EmptyState icon="◩" title="Sin check-ins en este periodo" text="Prueba con un periodo más largo o verifica que tus miembros usen la app." />
      ) : (
        <>
          <Panel title="Horas pico">
            <p className="report-sub">
              Check-ins por hora del día. Resaltadas, las 3 horas más concurridas: <strong>{peakText}</strong>.
            </p>
            <Columns data={hourData} ariaLabel="Check-ins por hora del día" />
            <details className="report-details">
              <summary>Ver como tabla</summary>
              <div className="gym-table-wrap">
                <table className="gym-table">
                  <thead>
                    <tr>
                      <th>Hora</th>
                      <th>Check-ins</th>
                    </tr>
                  </thead>
                  <tbody>
                    {hourData.map((d) => (
                      <tr key={d.key}>
                        <td>{d.label}</td>
                        <td>{d.value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </Panel>

          <Panel title="Día y hora">
            <p className="report-sub">Cuándo se llena el gimnasio: más intenso = más check-ins.</p>
            <Heatmap matrix={report.by_weekday_hour} range={heatRange} ariaLabel="Check-ins por día de la semana y hora" />
          </Panel>

          <Panel title="Asistencia diaria">
            <Columns data={dayData} every={dayEvery} ariaLabel="Check-ins por día" height={150} />
            <details className="report-details">
              <summary>Ver como tabla</summary>
              <div className="gym-table-wrap">
                <table className="gym-table">
                  <thead>
                    <tr>
                      <th>Día</th>
                      <th>Check-ins</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...report.by_day].reverse().map((d) => (
                      <tr key={d.date}>
                        <td>
                          {WEEKDAYS[(new Date(`${d.date}T00:00:00`).getDay() + 6) % 7]} {shortDate(d.date)}
                        </td>
                        <td>{d.check_ins}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </Panel>

          {report.by_branch.length > 1 && (
            <Panel title="Por sede">
              <p className="report-sub">Check-ins en el periodo de los miembros de cada sede.</p>
              <RankedBars
                rows={[...report.by_branch]
                  .sort((a, b) => b.check_ins - a.check_ins)
                  .map((b) => ({
                    key: b.id,
                    name: b.name,
                    value: b.check_ins,
                    tip: `${b.members} miembros · ${b.active_members} asistieron`,
                  }))}
              />
            </Panel>
          )}
        </>
      )}

      <Panel title={`Miembros sin asistir (${t.inactive_members})`}>
        <p className="report-sub">
          Sin check-in hace más de {period.inactive_days} días (o nunca). Quienes se unieron hace menos de ese tiempo no aparecen.
        </p>
        {report.inactive_members.length === 0 ? (
          <p className="muted">Todos tus miembros han asistido recientemente.</p>
        ) : (
          <div className="gym-table-wrap">
            <table className="gym-table">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Sede</th>
                  <th>Último check-in</th>
                  <th>Miembro desde</th>
                </tr>
              </thead>
              <tbody>
                {report.inactive_members.map((m) => (
                  <tr key={m.user.id}>
                    <td>{m.user.name}</td>
                    <td>{m.branch?.name ?? "—"}</td>
                    <td>{m.last_check_in_date ? `${dayLabel(m.last_check_in_date)} (hace ${m.days_since} d)` : "Nunca"}</td>
                    <td>{dayLabel(m.member_since)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {t.inactive_members > report.inactive_members.length && (
          <p className="micro">Mostrando los {report.inactive_members.length} con más tiempo sin asistir.</p>
        )}
      </Panel>

      <Panel title="Vouchers">
        <div className="gym-grid">
          <Stat label={`Emitidos (${period.days} días)`} value={report.vouchers.issued} />
          <Stat label={`Usados (${period.days} días)`} value={report.vouchers.redeemed} />
          <Stat label="Vigentes ahora" value={report.vouchers.open} />
        </div>
        <p className="micro">De todo el gimnasio (los vouchers no tienen sede).</p>
      </Panel>
    </div>
  );
}
