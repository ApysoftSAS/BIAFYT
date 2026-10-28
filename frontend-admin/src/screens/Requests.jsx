import { useCallback, useEffect, useState } from "react";
import { useSession } from "../state/SessionContext.jsx";
import { Panel, Badge, EmptyState } from "../components/UI.jsx";
import { apiErrorMessage } from "../utils/api.js";
import { statusLabel, countByStatus, formatDate } from "../utils/admin.js";
import RequestDetail from "./RequestDetail.jsx";

const FILTERS = [
  { id: "pending", label: "Pendientes" },
  { id: "approved", label: "Aprobadas" },
  { id: "rejected", label: "Rechazadas" },
  { id: "", label: "Todas" },
];

/**
 * SOLICITUDES DE REGISTRO DE GIMNASIO (Admin)
 * Lista filtrable + detalle (modal) con aprobar/rechazar.
 */
export default function Requests() {
  const { actions } = useSession();
  const [filter, setFilter] = useState("pending");
  const [requests, setRequests] = useState([]);
  const [counts, setCounts] = useState({ pending: 0, approved: 0, rejected: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      // Una carga sin filtro para los contadores; el filtro se aplica en cliente.
      const data = await actions.listRequests();
      const all = data.gym_registration_requests ?? [];
      setRequests(all);
      setCounts(countByStatus(all));
    } catch (e) {
      setError(apiErrorMessage(e, "No pudimos cargar las solicitudes."));
    } finally {
      setLoading(false);
    }
  }, [actions]);

  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(() => {
      if (!cancelled) load();
    });
    return () => {
      cancelled = true;
    };
  }, [load]);

  const shown = filter ? requests.filter((r) => r.status === filter) : requests;

  return (
    <div>
      <div className="gym-main-head">
        <h2>Solicitudes de registro</h2>
        <p>
          Pendientes: {counts.pending} · Aprobadas: {counts.approved} · Rechazadas: {counts.rejected}
        </p>
      </div>

      <div className="stack">
        <div className="row-gap" style={{ flexWrap: "wrap" }}>
          {FILTERS.map((f) => (
            <button
              key={f.id || "all"}
              className={`btn ${filter === f.id ? "btn-primary" : "btn-ghost"}`}
              onClick={() => setFilter(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>

        {error && <p className="text-warning">{error}</p>}

        <Panel title={`Solicitudes (${shown.length})`}>
          {loading && shown.length === 0 ? (
            <p className="muted">Cargando…</p>
          ) : shown.length === 0 ? (
            <EmptyState icon="◇" title="Sin solicitudes" text="No hay solicitudes en este estado." />
          ) : (
            <div className="gym-table-wrap">
              <table className="gym-table">
                <thead>
                  <tr>
                    <th>Gimnasio</th>
                    <th>Sede</th>
                    <th>Solicitante</th>
                    <th>Fecha</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r) => {
                    const s = statusLabel(r.status);
                    return (
                      <tr key={r.id}>
                        <td>
                          <button className="link-button" onClick={() => setSelectedId(r.id)}>
                            {r.gym_name}
                          </button>
                        </td>
                        <td>{r.branch_name}</td>
                        <td>{r.applicant?.name ?? "—"}</td>
                        <td>{formatDate(r.created_at)}</td>
                        <td>
                          <Badge tone={s.tone}>{s.text}</Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>

      {selectedId && (
        <RequestDetail
          id={selectedId}
          onClose={() => setSelectedId(null)}
          onReviewed={() => {
            setSelectedId(null);
            load();
          }}
        />
      )}
    </div>
  );
}
