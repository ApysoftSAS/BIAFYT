import { useCallback, useEffect, useState } from "react";
import { useSession } from "../state/SessionContext.jsx";
import { Panel, EmptyState } from "../components/UI.jsx";
import { apiErrorMessage } from "../utils/api.js";
import { formatDate } from "../utils/admin.js";

/**
 * GIMNASIOS (Admin) — lista básica de solo lectura. Sin datos personales:
 * nombres, sedes y recuentos de roles activos.
 */
export default function Gyms() {
  const { actions } = useSession();
  const [gyms, setGyms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await actions.listGyms();
      setGyms(data.gyms ?? []);
    } catch (e) {
      setError(apiErrorMessage(e, "No pudimos cargar los gimnasios."));
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

  return (
    <div>
      <div className="gym-main-head">
        <h2>Gimnasios</h2>
        <p>{gyms.length} gimnasio(s) en la plataforma.</p>
      </div>

      <div className="stack">
        {error && <p className="text-warning">{error}</p>}

        <Panel title="Todos los gimnasios">
          {loading && gyms.length === 0 ? (
            <p className="muted">Cargando…</p>
          ) : gyms.length === 0 ? (
            <EmptyState icon="▤" title="Sin gimnasios" text="Aún no se ha aprobado ningún registro de gimnasio." />
          ) : (
            <div className="gym-table-wrap">
              <table className="gym-table">
                <thead>
                  <tr>
                    <th>Nombre</th>
                    <th>Sedes</th>
                    <th>Admins</th>
                    <th>Coaches</th>
                    <th>Miembros</th>
                    <th>Creado</th>
                  </tr>
                </thead>
                <tbody>
                  {gyms.map((g) => (
                    <tr key={g.id}>
                      <td>{g.name}</td>
                      <td>{g.branches.map((b) => b.name).join(", ") || "—"}</td>
                      <td>{g.gym_admin_count}</td>
                      <td>{g.coach_count}</td>
                      <td>{g.member_count}</td>
                      <td>{formatDate(g.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
