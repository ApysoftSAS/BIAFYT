import { useCallback, useEffect, useState } from "react";
import { useSession } from "../state/SessionContext.jsx";
import { Panel, Button, Field, Input, EmptyState } from "../components/UI.jsx";
import { apiErrorMessage } from "../utils/api.js";

/**
 * SEDES (Gym Web) — el gym_admin crea, renombra y elimina las sedes de SU
 * gym. Una sede con miembros o historial de asignaciones no se puede
 * eliminar (el backend responde 422): se renombra.
 */
export default function Branches() {
  const { gymAccess, actions } = useSession();
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [editing, setEditing] = useState(null); // { id, name }

  const load = useCallback(async () => {
    try {
      setBranches((await actions.getManagedBranches()).branches ?? []);
    } catch (e) {
      setError(apiErrorMessage(e, "No pudimos cargar las sedes."));
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
  }, [load, gymAccess.activeGymId]);

  const run = async (fn, fallback) => {
    setBusy(true);
    setError("");
    try {
      await fn();
      await load();
    } catch (e) {
      setError(apiErrorMessage(e, fallback));
    } finally {
      setBusy(false);
    }
  };

  const create = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    run(async () => {
      await actions.createBranch(name.trim());
      setName("");
    }, "No se pudo crear la sede.");
  };

  const saveRename = (e) => {
    e.preventDefault();
    if (!editing.name.trim()) return;
    run(async () => {
      await actions.renameBranch(editing.id, editing.name.trim());
      setEditing(null);
    }, "No se pudo renombrar la sede.");
  };

  return (
    <div>
      <div className="gym-main-head">
        <h2>Sedes</h2>
        <p>Las sedes de tu organización. Cada miembro pertenece a una sede.</p>
      </div>

      <div className="stack">
        {error && (
          <p className="text-warning" role="alert">
            {error}
          </p>
        )}

        <Panel title="Nueva sede">
          <form className="row-gap" onSubmit={create}>
            <Field label="Nombre">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Sede Norte" maxLength={255} />
            </Field>
            <Button type="submit" disabled={busy || !name.trim()}>
              CREAR
            </Button>
          </form>
        </Panel>

        <Panel title={`Sedes (${branches.length})`}>
          {loading ? (
            <p className="muted">Cargando…</p>
          ) : branches.length === 0 ? (
            <EmptyState icon="◫" title="Sin sedes" text="Crea la primera sede arriba." />
          ) : (
            <div className="gym-table-wrap">
              <table className="gym-table">
                <thead>
                  <tr>
                    <th>Nombre</th>
                    <th>Miembros activos</th>
                    <th aria-label="acciones" />
                  </tr>
                </thead>
                <tbody>
                  {branches.map((b) => (
                    <tr key={b.id}>
                      <td>
                        {editing?.id === b.id ? (
                          <form className="row-gap" onSubmit={saveRename}>
                            <Input
                              value={editing.name}
                              onChange={(e) => setEditing({ id: b.id, name: e.target.value })}
                              aria-label={`Nuevo nombre de ${b.name}`}
                              maxLength={255}
                              autoFocus
                            />
                            <Button type="submit" disabled={busy}>
                              Guardar
                            </Button>
                            <Button variant="ghost" disabled={busy} onClick={() => setEditing(null)}>
                              Cancelar
                            </Button>
                          </form>
                        ) : (
                          b.name
                        )}
                      </td>
                      <td>{b.members_count}</td>
                      <td style={{ textAlign: "right" }}>
                        {editing?.id !== b.id && (
                          <div className="row-gap" style={{ justifyContent: "flex-end" }}>
                            <Button variant="ghost" disabled={busy} onClick={() => setEditing({ id: b.id, name: b.name })}>
                              Renombrar
                            </Button>
                            <Button
                              variant="ghost"
                              disabled={busy || branches.length <= 1 || b.members_count > 0}
                              onClick={() => run(() => actions.deleteBranch(b.id), "No se pudo eliminar la sede.")}
                            >
                              Eliminar
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="micro" style={{ marginTop: 10 }}>
            No se puede eliminar la única sede ni una sede con miembros o historial; renómbrala.
          </p>
        </Panel>
      </div>
    </div>
  );
}
