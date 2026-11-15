import { useCallback, useEffect, useState } from "react";
import { useSession } from "../state/SessionContext.jsx";
import { Modal, Stat } from "../components/UI.jsx";
import { apiErrorMessage } from "../utils/api.js";
import { profileRows, formatDuration, formatDate } from "../utils/gym.js";

/**
 * DETALLE DE MIEMBRO (Gym Web)
 *
 * Snapshot de calidad SOMBRA de un miembro del gym: perfil + resumen de
 * actividad + racha + puntos (mismo shape que Coach MVP). El gym_admin
 * solo LEE. No se muestran email, ubicación, rewards, duelos ni notas del
 * coach — el endpoint no los devuelve.
 */
export default function MemberDetail({ member, onClose }) {
  const { actions } = useSession();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const memberUserId = member.user.id;

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await actions.getMemberDetail(memberUserId));
    } catch (e) {
      setError(apiErrorMessage(e, "No pudimos cargar el detalle del miembro."));
    } finally {
      setLoading(false);
    }
  }, [actions, memberUserId]);

  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(() => {
      if (!cancelled) load();
    });
    return () => {
      cancelled = true;
    };
  }, [load]);

  const rows = profileRows(data?.profile);
  const summary = data?.activity_summary;

  return (
    <Modal open title={member.user.name} onClose={onClose}>
      {loading && <p className="muted">Cargando…</p>}
      {error && !loading && <p className="text-warning">{error}</p>}

      {data && !loading && (
        <div className="stack">
          <div className="gym-grid">
            <Stat label="Racha actual" value={data.streak.current_streak} />
            <Stat label="Mejor racha" value={data.streak.longest_streak} />
            <Stat label="Puntos" value={data.points.balance} />
            <Stat label="Sesiones" value={summary.count} />
          </div>

          <section>
            <p className="micro">PERFIL</p>
            {rows.length === 0 ? (
              <p className="muted">El miembro aún no completó su perfil.</p>
            ) : (
              <div className="stack-sm">
                {rows.map((r) => (
                  <div className="row-between" key={r.label}>
                    <span className="muted">{r.label}</span>
                    <span>{r.value}</span>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section>
            <p className="micro">ACTIVIDAD (SOMBRA · BEST-EFFORT)</p>
            {summary.count === 0 ? (
              <p className="muted">Sin actividad sincronizada todavía.</p>
            ) : (
              <>
                <div className="row-between">
                  <span className="muted">Última actividad</span>
                  <span>{summary.last_activity_at ? formatDate(summary.last_activity_at) : "—"}</span>
                </div>
                <div className="row-between">
                  <span className="muted">Series / ejercicios</span>
                  <span>
                    {summary.total_sets} / {summary.total_exercises}
                  </span>
                </div>
                <div className="row-between">
                  <span className="muted">Tiempo total</span>
                  <span>{formatDuration(summary.total_duration_seconds)}</span>
                </div>
                <div className="stack-sm" style={{ marginTop: 12 }}>
                  {summary.recent.map((a) => (
                    <div className="row-between" key={a.id}>
                      <span>{a.routine_label || "Sesión"}</span>
                      <span className="micro">
                        {formatDate(a.finished_at)} · {formatDuration(a.duration_seconds)} · +{a.points_awarded}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </section>

          <p className="micro">
            La actividad, la racha y los puntos vienen de lo que la app del miembro pudo
            sincronizar (best-effort). Pueden faltar sesiones registradas sin conexión.
          </p>
        </div>
      )}
    </Modal>
  );
}
