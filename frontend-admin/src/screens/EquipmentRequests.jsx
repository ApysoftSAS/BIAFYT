import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "../state/SessionContext.jsx";
import { Panel, Badge, EmptyState, Button, Modal, Field, Input } from "../components/UI.jsx";
import { apiErrorMessage } from "../utils/api.js";
import { formatDate } from "../utils/admin.js";

const STATUS = {
  pending: { text: "Pendiente", tone: "default" },
  in_review: { text: "En revisión", tone: "default" },
  changes_requested: { text: "Correcciones pedidas", tone: "warning" },
  approved: { text: "Aprobada", tone: "success" },
  rejected: { text: "Rechazada", tone: "warning" },
};

const EVENT_LABEL = {
  submitted: "Enviada por el gym",
  resubmitted: "Reenviada por el gym tras correcciones",
  info_corrected: "Información corregida",
  review_started: "Revisión iniciada",
  changes_requested: "Correcciones solicitadas",
  approved: "Aprobada",
  rejected: "Rechazada",
};

const FILTERS = [
  { id: "pending", label: "Pendientes" },
  { id: "in_review", label: "En revisión" },
  { id: "changes_requested", label: "Con correcciones" },
  { id: "approved", label: "Aprobadas" },
  { id: "rejected", label: "Rechazadas" },
  { id: "", label: "Todas" },
];

/**
 * CATÁLOGO → SOLICITUDES DE EQUIPAMIENTO (BIAFYT Admin)
 *
 * Flujo de revisión de las solicitudes que envían los gimnasios para añadir
 * una máquina al catálogo global. Regla anti-duplicados: al aprobar, el
 * admin elige explícitamente entre ASOCIAR a un equipamiento existente o
 * CREAR uno nuevo. Aprobar NO añade nada al inventario de ningún gym.
 */
export default function EquipmentRequests() {
  const { actions } = useSession();
  const [filter, setFilter] = useState("pending");
  const [all, setAll] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { equipment_requests: list } = await actions.listEquipmentRequests();
      setAll(list ?? []);
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

  const shown = filter ? all.filter((r) => r.status === filter) : all;

  return (
    <div>
      <div className="gym-main-head">
        <h2>Solicitudes de equipamiento</h2>
        <p>Gimnasios que piden añadir una máquina al catálogo global.</p>
      </div>

      <div className="stack">
        <div className="row-gap" style={{ flexWrap: "wrap" }}>
          {FILTERS.map((f) => (
            <button key={f.id || "all"} className={`btn ${filter === f.id ? "btn-primary" : "btn-ghost"}`} onClick={() => setFilter(f.id)}>
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
                    <th>Equipamiento pedido</th>
                    <th>Gimnasio</th>
                    <th>Solicitante</th>
                    <th>Fecha</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r) => {
                    const s = STATUS[r.status] ?? { text: r.status, tone: "default" };
                    return (
                      <tr key={r.id}>
                        <td>
                          <button className="link-button" onClick={() => setSelectedId(r.id)}>
                            {r.name}
                          </button>
                        </td>
                        <td>{r.gym?.name ?? "—"}</td>
                        <td>{r.requester?.name ?? "—"}</td>
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
        <EquipmentRequestDetail
          id={selectedId}
          onClose={() => setSelectedId(null)}
          onChanged={() => {
            setSelectedId(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function EquipmentRequestDetail({ id, onClose, onChanged }) {
  const { actions } = useSession();
  const [req, setReq] = useState(null);
  const [catalog, setCatalog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const [note, setNote] = useState("");
  const [mode, setMode] = useState(null); // null | "correct" | "changes" | "reject" | "approve"
  const [correct, setCorrect] = useState({ name: "", brand: "", model: "", category: "", description: "" });
  const [approveChoice, setApproveChoice] = useState("existing"); // "existing" | "new"
  const [equipmentId, setEquipmentId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [{ equipment_request: r }, { equipment }] = await Promise.all([
        actions.getEquipmentRequest(id),
        actions.listEquipment(true),
      ]);
      setReq(r);
      setCatalog(equipment ?? []);
    } catch (e) {
      setError(apiErrorMessage(e, "No pudimos cargar la solicitud."));
    } finally {
      setLoading(false);
    }
  }, [actions, id]);

  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(() => {
      if (!cancelled) load();
    });
    return () => {
      cancelled = true;
    };
  }, [load]);

  const suggestions = useMemo(() => {
    if (!req) return [];
    const q = req.name.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
    return catalog.filter((c) => q.some((w) => c.name.toLowerCase().includes(w)));
  }, [req, catalog]);

  const run = async (fn, okReload = true) => {
    setBusy(true);
    setError("");
    try {
      const { equipment_request: r } = await fn();
      setReq(r);
      setMode(null);
      setNote("");
      if (okReload) onChanged();
    } catch (e) {
      setError(apiErrorMessage(e, "No se pudo completar la acción."));
    } finally {
      setBusy(false);
    }
  };

  const status = req ? STATUS[req.status] : null;

  return (
    <Modal open title={req ? `Solicitud: ${req.name}` : "Solicitud"} onClose={onClose}>
      {loading ? (
        <p className="muted">Cargando…</p>
      ) : !req ? (
        <p className="text-warning">{error || "No encontrada."}</p>
      ) : (
        <div className="stack-sm">
          <div className="row-gap" style={{ alignItems: "center" }}>
            <Badge tone={status.tone}>{status.text}</Badge>
            <span className="micro muted">{req.gym.name} · {req.requester.name} ({req.requester.email})</span>
          </div>

          <div>
            <p className="micro muted">PROPUESTA</p>
            <p><strong>{req.name}</strong></p>
            {(req.brand || req.model) && <p className="micro">{[req.brand, req.model].filter(Boolean).join(" · ")}</p>}
            {req.category && <p className="micro">Categoría: {req.category}</p>}
            {req.description && <p style={{ whiteSpace: "pre-wrap" }}>{req.description}</p>}
            {req.photo_urls?.length > 0 && (
              <ul className="micro">
                {req.photo_urls.map((u, i) => (
                  <li key={i}><a href={u} target="_blank" rel="noreferrer">{u}</a></li>
                ))}
              </ul>
            )}
          </div>

          {req.resulting_equipment && (
            <p className="text-success">
              Resuelta → catálogo: “{req.resulting_equipment.name}” ({req.resulting_equipment.slug})
            </p>
          )}
          {req.review_note && <p className="text-warning">Última nota: {req.review_note}</p>}

          <div>
            <p className="micro muted">HISTORIAL</p>
            <ul className="micro muted">
              {req.events.map((e, i) => (
                <li key={i}>
                  {formatDate(e.at)} — {EVENT_LABEL[e.action] ?? e.action}
                  {e.actor ? ` (${e.actor.name})` : ""}
                  {e.note ? ` — “${e.note}”` : ""}
                </li>
              ))}
            </ul>
          </div>

          {error && <p className="text-warning">{error}</p>}

          {/* ------- acciones según estado ------- */}
          {req.status === "pending" && (
            <Button disabled={busy} onClick={() => run(() => actions.startEquipmentReview(id), false)}>
              {busy ? "…" : "Poner en revisión"}
            </Button>
          )}

          {req.status === "in_review" && mode === null && (
            <div className="row-gap" style={{ flexWrap: "wrap" }}>
              <Button variant="ghost" onClick={() => { setCorrect({ name: req.name, brand: req.brand ?? "", model: req.model ?? "", category: req.category ?? "", description: req.description ?? "" }); setMode("correct"); }}>
                Corregir info
              </Button>
              <Button variant="ghost" onClick={() => setMode("changes")}>Solicitar correcciones</Button>
              <Button variant="ghost" onClick={() => setMode("reject")}>Rechazar</Button>
              <Button onClick={() => setMode("approve")}>Aprobar</Button>
            </div>
          )}

          {req.status === "in_review" && mode === "correct" && (
            <div className="stack-sm">
              <p className="micro muted">Normaliza la propuesta antes de aprobar (no cambia el estado).</p>
              <Field label="Nombre"><Input value={correct.name} onChange={(e) => setCorrect((c) => ({ ...c, name: e.target.value }))} /></Field>
              <Field label="Marca"><Input value={correct.brand} onChange={(e) => setCorrect((c) => ({ ...c, brand: e.target.value }))} /></Field>
              <Field label="Modelo"><Input value={correct.model} onChange={(e) => setCorrect((c) => ({ ...c, model: e.target.value }))} /></Field>
              <Field label="Categoría"><Input value={correct.category} onChange={(e) => setCorrect((c) => ({ ...c, category: e.target.value }))} /></Field>
              <Field label="Descripción">
                <textarea className="input" rows={3} style={{ resize: "vertical", fontFamily: "inherit" }} value={correct.description} onChange={(e) => setCorrect((c) => ({ ...c, description: e.target.value }))} />
              </Field>
              <div className="row-gap">
                <Button variant="ghost" disabled={busy} onClick={() => setMode(null)}>Cancelar</Button>
                <Button disabled={busy || !correct.name.trim()} onClick={() => run(() => actions.correctEquipmentRequest(id, {
                  name: correct.name.trim(),
                  brand: correct.brand.trim() || null,
                  model: correct.model.trim() || null,
                  category: correct.category.trim() || null,
                  description: correct.description.trim() || null,
                }), false)}>
                  Guardar correcciones
                </Button>
              </div>
            </div>
          )}

          {req.status === "in_review" && mode === "changes" && (
            <div className="stack-sm">
              <Field label="Qué debe corregir el gym (obligatorio)">
                <textarea className="input" rows={3} style={{ resize: "vertical", fontFamily: "inherit" }} value={note} onChange={(e) => setNote(e.target.value)} />
              </Field>
              <div className="row-gap">
                <Button variant="ghost" disabled={busy} onClick={() => setMode(null)}>Cancelar</Button>
                <Button disabled={busy || !note.trim()} onClick={() => run(() => actions.requestEquipmentChanges(id, note.trim()))}>
                  Enviar correcciones
                </Button>
              </div>
            </div>
          )}

          {req.status === "in_review" && mode === "reject" && (
            <div className="stack-sm">
              <Field label="Motivo del rechazo (opcional)">
                <textarea className="input" rows={2} style={{ resize: "vertical", fontFamily: "inherit" }} value={note} onChange={(e) => setNote(e.target.value)} />
              </Field>
              <div className="row-gap">
                <Button variant="ghost" disabled={busy} onClick={() => setMode(null)}>Cancelar</Button>
                <Button disabled={busy} onClick={() => run(() => actions.rejectEquipmentRequest(id, note.trim() || null))}>
                  Confirmar rechazo
                </Button>
              </div>
            </div>
          )}

          {req.status === "in_review" && mode === "approve" && (
            <div className="stack-sm">
              <p className="micro muted">Evita duplicados: si ya existe una máquina equivalente, asóciala en vez de crear una nueva.</p>
              <label className="row-gap" style={{ alignItems: "center" }}>
                <input type="radio" name="approve" checked={approveChoice === "existing"} onChange={() => setApproveChoice("existing")} />
                <span>Asociar a un equipamiento existente</span>
              </label>
              {approveChoice === "existing" && (
                <Field label={suggestions.length ? "Posibles equivalentes primero" : "Equipamiento del catálogo"}>
                  <select className="input" value={equipmentId} onChange={(e) => setEquipmentId(e.target.value)}>
                    <option value="">— elige —</option>
                    {suggestions.map((c) => (
                      <option key={`s-${c.id}`} value={c.id}>★ {c.name}</option>
                    ))}
                    {catalog.filter((c) => !suggestions.some((s) => s.id === c.id)).map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </Field>
              )}
              <label className="row-gap" style={{ alignItems: "center" }}>
                <input type="radio" name="approve" checked={approveChoice === "new"} onChange={() => setApproveChoice("new")} />
                <span>Crear un equipamiento nuevo (es una máquina nueva)</span>
              </label>
              <Field label="Nota (opcional)">
                <Input value={note} onChange={(e) => setNote(e.target.value)} />
              </Field>
              <div className="row-gap">
                <Button variant="ghost" disabled={busy} onClick={() => setMode(null)}>Cancelar</Button>
                <Button
                  disabled={busy || (approveChoice === "existing" && !equipmentId)}
                  onClick={() =>
                    run(() =>
                      actions.approveEquipmentRequest(id, {
                        equipmentId: approveChoice === "existing" ? Number(equipmentId) : undefined,
                        createEquipment: approveChoice === "new",
                        reviewNote: note.trim() || null,
                      })
                    )
                  }
                >
                  Aprobar
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
