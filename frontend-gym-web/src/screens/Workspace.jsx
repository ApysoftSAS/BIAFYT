import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "../state/SessionContext.jsx";
import { Panel, Button, Field, Input, EmptyState, Modal } from "../components/UI.jsx";
import { apiErrorMessage } from "../utils/api.js";
import { formatDate } from "../utils/gym.js";
import MemberDetail from "./MemberDetail.jsx";

/**
 * ESPACIO (Gym Web) — gestión de miembros y coaches (slice D-GYM).
 *
 * El gym_admin: ve la lista de miembros/coaches activos de SU gym, busca
 * un usuario por email exacto, lo asigna como member o coach, revoca una
 * asignación, y abre el detalle (sombra) de un miembro. NO administra
 * gym_admin/staff ni crea gyms/sedes (D-GYM-3, D-GYM-8).
 */
export default function Workspace() {
  const { gymAccess, actions } = useSession();
  const activeGym = useMemo(
    () => gymAccess.gyms.find((g) => g.id === gymAccess.activeGymId) ?? null,
    [gymAccess.gyms, gymAccess.activeGymId]
  );

  const [members, setMembers] = useState([]);
  const [coaches, setCoaches] = useState([]);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState("");

  const [selectedMember, setSelectedMember] = useState(null);
  const [revokeTarget, setRevokeTarget] = useState(null); // { assignment, kind }
  const [revokeBusy, setRevokeBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setListError("");
    try {
      const [m, c, b] = await Promise.all([actions.getMembers(), actions.getCoaches(), actions.getBranches()]);
      setMembers(m.members ?? []);
      setCoaches(c.coaches ?? []);
      setBranches(b ?? []);
    } catch (e) {
      setListError(apiErrorMessage(e, "No pudimos cargar la gestión del gimnasio."));
    } finally {
      setLoading(false);
    }
  }, [actions]);

  // Recarga al montar y cada vez que cambia el gym activo.
  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(() => {
      if (!cancelled) load();
    });
    return () => {
      cancelled = true;
    };
  }, [load, gymAccess.activeGymId]);

  const confirmRevoke = async () => {
    if (!revokeTarget) return;
    setRevokeBusy(true);
    try {
      await actions.revokeAssignment(revokeTarget.assignment.id);
      setRevokeTarget(null);
      await load();
    } catch (e) {
      setListError(apiErrorMessage(e, "No se pudo revocar la asignación."));
      setRevokeTarget(null);
    } finally {
      setRevokeBusy(false);
    }
  };

  return (
    <div>
      <div className="gym-main-head">
        <h2>Gestión de {activeGym?.name ?? "gimnasio"}</h2>
        <p>Miembros, coaches y alta de personas. Solo tu organización.</p>
      </div>

      {gymAccess.gyms.length > 1 && (
        <Field label="Organización">
          <select
            className="input"
            value={gymAccess.activeGymId ?? ""}
            onChange={(e) => actions.selectGym(Number(e.target.value))}
          >
            {gymAccess.gyms.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </Field>
      )}

      <div className="stack">
        {listError && <p className="text-warning">{listError}</p>}

        <AddPersonPanel branches={branches} onDone={load} />

        <AssignmentTable
          title="Miembros"
          rows={members}
          loading={loading}
          emptyText="Sin miembros activos. Añade una persona arriba."
          onOpen={(row) => setSelectedMember(row)}
          onRevoke={(row) => setRevokeTarget({ assignment: row, kind: "member" })}
          showBranch
        />

        <AssignmentTable
          title="Coaches"
          rows={coaches}
          loading={loading}
          emptyText="Sin coaches activos."
          onRevoke={(row) => setRevokeTarget({ assignment: row, kind: "coach" })}
        />
      </div>

      {selectedMember && (
        <MemberDetail member={selectedMember} onClose={() => setSelectedMember(null)} />
      )}

      {revokeTarget && (
        <Modal open title="Revocar asignación" onClose={() => (revokeBusy ? null : setRevokeTarget(null))}>
          <p className="muted">
            ¿Revocar el rol <strong>{revokeTarget.kind === "member" ? "miembro" : "coach"}</strong> de{" "}
            <strong>{revokeTarget.assignment.user.name}</strong> en {activeGym?.name}?
          </p>
          <p className="micro">
            La asignación queda inactiva (no se borra). {revokeTarget.kind === "coach" && "La relación coach↔atleta que ya exista no se toca."}
          </p>
          <div className="row-gap" style={{ marginTop: 12 }}>
            <Button variant="ghost" disabled={revokeBusy} onClick={() => setRevokeTarget(null)}>
              Cancelar
            </Button>
            <Button variant="danger" disabled={revokeBusy} onClick={confirmRevoke}>
              {revokeBusy ? "REVOCANDO…" : "REVOCAR"}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function AddPersonPanel({ branches, onDone }) {
  const { actions } = useSession();
  const [email, setEmail] = useState("");
  const [found, setFound] = useState(null);
  const [role, setRole] = useState("member");
  const [branchId, setBranchId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const reset = () => {
    setEmail("");
    setFound(null);
    setRole("member");
    setBranchId("");
    setError("");
  };

  const lookup = async () => {
    setError("");
    setNotice("");
    setFound(null);
    const value = email.trim().toLowerCase();
    if (!value) {
      setError("Escribe un correo.");
      return;
    }
    setBusy(true);
    try {
      const { user } = await actions.lookupUser(value);
      setFound(user);
    } catch (e) {
      setError(apiErrorMessage(e, "No encontramos a nadie con ese correo exacto."));
    } finally {
      setBusy(false);
    }
  };

  const assign = async () => {
    if (!found) return;
    setError("");
    if (role === "member" && !branchId) {
      setError("Elige una sede para el miembro.");
      return;
    }
    setBusy(true);
    try {
      await actions.createAssignment({
        user_id: found.id,
        role,
        branch_id: role === "member" ? Number(branchId) : null,
      });
      setNotice(`${found.name} asignado como ${role === "member" ? "miembro" : "coach"}.`);
      reset();
      await onDone();
    } catch (e) {
      setError(apiErrorMessage(e, "No se pudo asignar."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel title="Añadir persona">
      <div className="stack-sm">
        <Field label="Correo (exacto)" hint="La persona ya debe tener una cuenta BIAFYT.">
          <div className="row-gap">
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="persona@correo.com"
              style={{ flex: 1 }}
            />
            <Button variant="ghost" disabled={busy} onClick={lookup}>
              {busy && !found ? "BUSCANDO…" : "BUSCAR"}
            </Button>
          </div>
        </Field>

        {error && <p className="text-warning">{error}</p>}
        {notice && <p className="text-success">{notice}</p>}

        {found && (
          <div className="stack-sm">
            <p>
              <strong>{found.name}</strong> <span className="micro">#{found.id}</span>
            </p>
            <Field label="Rol">
              <select className="input" value={role} onChange={(e) => setRole(e.target.value)}>
                <option value="member">Miembro</option>
                <option value="coach">Coach</option>
              </select>
            </Field>
            {role === "member" && (
              <Field label="Sede">
                <select className="input" value={branchId} onChange={(e) => setBranchId(e.target.value)}>
                  <option value="">— elige una sede —</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            <div className="row-gap">
              <Button variant="ghost" disabled={busy} onClick={reset}>
                Cancelar
              </Button>
              <Button disabled={busy} onClick={assign}>
                {busy ? "ASIGNANDO…" : "ASIGNAR"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </Panel>
  );
}

function AssignmentTable({ title, rows, loading, emptyText, onOpen, onRevoke, showBranch = false }) {
  return (
    <Panel title={`${title} (${rows.length})`}>
      {loading && rows.length === 0 ? (
        <p className="muted">Cargando…</p>
      ) : rows.length === 0 ? (
        <EmptyState icon="◇" title={`Sin ${title.toLowerCase()}`} text={emptyText} />
      ) : (
        <div className="gym-table-wrap">
          <table className="gym-table">
            <thead>
              <tr>
                <th>Nombre</th>
                {showBranch && <th>Sede</th>}
                <th>Desde</th>
                <th aria-label="acciones" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    {onOpen ? (
                      <button className="link-button" onClick={() => onOpen(row)}>
                        {row.user.name}
                      </button>
                    ) : (
                      row.user.name
                    )}
                  </td>
                  {showBranch && <td>{row.branch?.name ?? "—"}</td>}
                  <td>{formatDate(row.since)}</td>
                  <td style={{ textAlign: "right" }}>
                    <Button variant="ghost" onClick={() => onRevoke(row)}>
                      Revocar
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
