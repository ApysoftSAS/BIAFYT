import { useEffect, useMemo, useState } from "react";
import { useSession } from "../state/SessionContext.jsx";
import { Card, EmptyState, Panel, Stat } from "../components/UI.jsx";
import { Columns, RankedBars } from "../components/Charts.jsx";
import { apiErrorMessage } from "../utils/api.js";
import { downloadText, hourLabel, hourRange, shortDate } from "../utils/report.js";
import { platformToCsv } from "../utils/platformReport.js";

const PERIODS = [7, 30, 90];

const QUEUE_LABEL = {
  pending: "Pendientes",
  in_review: "En revisión",
  changes_requested: "Cambios pedidos",
  approved: "Aprobadas",
  rejected: "Rechazadas",
};

// En la app nativa no hay descarga por blob ni impresión (este panel es web; por si se reutiliza).
const NATIVE = typeof window !== "undefined" && Boolean(window.Capacitor?.isNativePlatform?.());

/**
 * REPORTES (BIAFYT Admin) — salud de la plataforma: crecimiento, actividad,
 * gimnasios y colas de revisión. Solo cifras agregadas (sin datos personales).
 * "Usuario activo" = al menos un check-in o un entrenamiento registrado.
 */
export default function Reports() {
  const { actions } = useSession();
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
        if (!cancelled) setError(apiErrorMessage(e, "No pudimos cargar el reporte."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [getReport, days]);

  return (
    <div>
      <div className="gym-main-head">
        <h2>Reportes</h2>
        <p>Crecimiento, actividad y gimnasios de la plataforma.</p>
      </div>

      <div className="report-filters">
        <div className="seg" role="group" aria-label="Periodo">
          {PERIODS.map((p) => (
            <button key={p} type="button" className="btn btn-ghost" aria-pressed={days === p} onClick={() => setDays(p)}>
              {p} días
            </button>
          ))}
        </div>
        {report && !NATIVE && (
          <div className="seg report-actions">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => downloadText(`reporte-plataforma-${report.period.to}.csv`, platformToCsv(report))}
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
      {report && <Body report={report} busy={loading} />}
    </div>
  );
}

function Body({ report, busy }) {
  const { totals: t, period, active_users: au, queues } = report;

  const series = (rows, unit) => rows.map((d) => ({ key: d.date, label: shortDate(d.date), axis: shortDate(d.date), value: d.count, unit }));
  const newUsers = useMemo(() => series(report.new_users_by_day, "usuarios nuevos"), [report]);
  const checkIns = useMemo(() => series(report.check_ins_by_day, "check-ins"), [report]);
  const every = Math.max(1, Math.ceil(newUsers.length / 8));

  const hourData = useMemo(() => {
    const top = new Set(
      report.check_ins_by_hour
        .map((n, h) => ({ n, h }))
        .filter((x) => x.n > 0)
        .sort((a, b) => b.n - a.n)
        .slice(0, 3)
        .map((x) => x.h)
    );
    const [lo, hi] = hourRange([report.check_ins_by_hour]);
    return report.check_ins_by_hour
      .map((value, hour) => ({ key: hour, label: hourLabel(hour), axis: String(hour), value, emphasis: top.has(hour) }))
      .filter((d) => d.key >= lo && d.key <= hi);
  }, [report]);

  const queueCards = (title, map) => (
    <Panel title={title}>
      <div className="gym-grid">
        {Object.entries(map).map(([status, n]) => (
          <Stat key={status} label={QUEUE_LABEL[status] ?? status} value={n} tone={status === "pending" && n > 0 ? "warning" : undefined} />
        ))}
      </div>
    </Panel>
  );

  return (
    <div className="report-refetch stack" aria-busy={busy}>
      <Card className="soft">
        <p className="report-note">
          Cifras agregadas de toda la plataforma, sin datos personales. <strong>Usuario activo</strong> = al menos un check-in o un
          entrenamiento registrado. Los check-ins se atribuyen a los gimnasios por la membresía activa de quien los hace. Horas en{" "}
          {period.timezone}.
        </p>
      </Card>

      <Panel title="Usuarios activos">
        <div className="gym-grid">
          <Stat label="Hoy" value={au.today} />
          <Stat label="Últimos 7 días" value={au.last_7_days} />
          <Stat label="Últimos 30 días" value={au.last_30_days} />
          <Stat label={`En el periodo (${period.days} d)`} value={t.active_users_period} />
        </div>
      </Panel>

      <div className="gym-grid">
        <Card>
          <Stat label="Usuarios" value={t.users} />
          <p className="micro">{t.new_users} nuevos en el periodo.</p>
        </Card>
        <Card>
          <Stat label="Gimnasios" value={t.gyms} />
          <p className="micro">{t.new_gyms} nuevos en el periodo.</p>
        </Card>
        <Card>
          <Stat label="Miembros en gimnasios" value={t.members} />
        </Card>
        <Card>
          <Stat label="Coaches" value={t.coaches} />
        </Card>
        <Card>
          <Stat label="Staff" value={t.staff} />
        </Card>
        <Card>
          <Stat label={`Check-ins (${period.days} d)`} value={t.check_ins} />
        </Card>
        <Card>
          <Stat label={`Entrenamientos (${period.days} d)`} value={t.workouts} />
        </Card>
        <Card>
          <Stat label={`Duelos terminados (${period.days} d)`} value={t.duels_finished} />
        </Card>
        <Card>
          <Stat label={`Vouchers emitidos / usados`} value={`${t.vouchers_issued} / ${t.vouchers_redeemed}`} />
        </Card>
        <Card>
          <Stat label="Promociones activas" value={t.promotions_active} />
        </Card>
      </div>

      <Panel title="Usuarios nuevos por día">
        <Columns data={newUsers} every={every} ariaLabel="Usuarios nuevos por día" height={140} />
      </Panel>

      {t.check_ins === 0 ? (
        <EmptyState icon="◩" title="Sin check-ins en este periodo" text="Prueba con un periodo más largo." />
      ) : (
        <>
          <Panel title="Check-ins por día">
            <Columns data={checkIns} every={every} ariaLabel="Check-ins por día" height={140} />
          </Panel>
          <Panel title="Horas pico de la plataforma">
            <p className="report-sub">Check-ins por hora del día. Resaltadas, las 3 más concurridas.</p>
            <Columns data={hourData} ariaLabel="Check-ins por hora del día" />
          </Panel>
        </>
      )}

      <Panel title="Gimnasios con más actividad">
        {report.top_gyms.length === 0 ? (
          <p className="muted">Todavía no hay gimnasios.</p>
        ) : (
          <>
            <RankedBars
              rows={report.top_gyms.map((g) => ({
                key: g.id,
                name: g.name,
                value: g.check_ins,
                tip: `${g.members} miembros · ${g.coaches} coaches · ${g.active_members} asistieron`,
              }))}
            />
            <div className="gym-table-wrap" style={{ marginTop: 14 }}>
              <table className="gym-table">
                <thead>
                  <tr>
                    <th>Gimnasio</th>
                    <th>Miembros</th>
                    <th>Coaches</th>
                    <th>Asistieron</th>
                    <th>Check-ins</th>
                  </tr>
                </thead>
                <tbody>
                  {report.top_gyms.map((g) => (
                    <tr key={g.id}>
                      <td>{g.name}</td>
                      <td>{g.members}</td>
                      <td>{g.coaches}</td>
                      <td>{g.active_members}</td>
                      <td>{g.check_ins}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Panel>

      {queueCards("Solicitudes de registro de gimnasio", queues.gym_registrations)}
      {queueCards("Solicitudes de equipamiento", queues.equipment_requests)}
    </div>
  );
}
