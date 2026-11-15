import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "../state/SessionContext.jsx";
import { Panel, Button, Badge, EmptyState, Field, Input } from "../components/UI.jsx";
import { apiErrorMessage } from "../utils/api.js";

const REQUEST_STATUS_LABEL = {
  pending: { text: "Pendiente", tone: "default" },
  in_review: { text: "En revisión", tone: "default" },
  changes_requested: { text: "Correcciones solicitadas", tone: "warning" },
  approved: { text: "Aprobada", tone: "success" },
  rejected: { text: "Rechazada", tone: "warning" },
};

const EVENT_LABEL = {
  submitted: "Enviada",
  resubmitted: "Reenviada tras correcciones",
  info_corrected: "Información corregida",
  review_started: "BIAFYT inició la revisión",
  changes_requested: "BIAFYT pidió correcciones",
  approved: "Aprobada por BIAFYT",
  rejected: "Rechazada por BIAFYT",
};

/**
 * INVENTARIO (Gym Web) — slice D-GYM-INVENTORY.
 *
 * El catálogo de equipamiento es GLOBAL de BIAFYT. Aquí el gym_admin
 * solo marca qué items del catálogo existen en SU gym y si están
 * disponibles. No se crean máquinas nuevas: no hay duplicación por gym.
 *
 * El inventario se usa como contexto al crear rutinas con "gimnasio de
 * referencia" (una rutina con gym de referencia solo puede usar máquinas
 * disponibles en ese gym). No afecta al catálogo global que ve el atleta.
 */
export default function Inventory() {
  const { gymAccess, actions } = useSession();
  const activeGym = useMemo(
    () => gymAccess.gyms.find((g) => g.id === gymAccess.activeGymId) ?? null,
    [gymAccess.gyms, gymAccess.activeGymId]
  );

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { equipment } = await actions.getEquipment();
      setItems(equipment ?? []);
    } catch (e) {
      setError(apiErrorMessage(e, "No pudimos cargar el inventario."));
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

  const run = async (id, fn) => {
    setBusyId(id);
    setError("");
    try {
      await fn();
      await load();
    } catch (e) {
      setError(apiErrorMessage(e, "No se pudo actualizar el inventario."));
    } finally {
      setBusyId(null);
    }
  };

  const inCount = items.filter((i) => i.in_inventory).length;

  return (
    <div>
      <div className="gym-main-head">
        <h2>Inventario de {activeGym?.name ?? "gimnasio"}</h2>
        <p>
          Marca qué equipamiento del catálogo BIAFYT tiene tu gimnasio. El catálogo global
          no cambia para los atletas; esto solo se usa como contexto en rutinas con gimnasio de referencia.
        </p>
      </div>

      {gymAccess.gyms.length > 1 && (
        <label className="field">
          <span className="field-label">Organización</span>
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
        </label>
      )}

      <div className="stack">
        {error && <p className="text-warning">{error}</p>}

        <Panel title={`Equipamiento (${inCount} / ${items.length} en el gimnasio)`}>
          {loading && items.length === 0 ? (
            <p className="muted">Cargando…</p>
          ) : items.length === 0 ? (
            <EmptyState icon="◇" title="Catálogo vacío" text="No hay equipamiento en el catálogo global." />
          ) : (
            <div className="gym-table-wrap">
              <table className="gym-table">
                <thead>
                  <tr>
                    <th>Equipamiento</th>
                    <th>Estado</th>
                    <th aria-label="acciones" />
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => {
                    const busy = busyId === item.id;
                    return (
                      <tr key={item.id}>
                        <td>{item.name}</td>
                        <td>
                          {!item.in_inventory ? (
                            <Badge>No está en el gimnasio</Badge>
                          ) : item.available ? (
                            <Badge tone="success">Disponible</Badge>
                          ) : (
                            <Badge tone="warning">No disponible</Badge>
                          )}
                        </td>
                        <td style={{ textAlign: "right" }}>
                          <div className="row-gap" style={{ justifyContent: "flex-end" }}>
                            {!item.in_inventory ? (
                              <Button disabled={busy} onClick={() => run(item.id, () => actions.setEquipment(item.id, true))}>
                                {busy ? "…" : "Añadir"}
                              </Button>
                            ) : (
                              <>
                                <Button
                                  variant="ghost"
                                  disabled={busy}
                                  onClick={() => run(item.id, () => actions.setEquipment(item.id, !item.available))}
                                >
                                  {item.available ? "Marcar no disponible" : "Marcar disponible"}
                                </Button>
                                <Button
                                  variant="ghost"
                                  disabled={busy}
                                  onClick={() => run(item.id, () => actions.removeEquipment(item.id))}
                                >
                                  Quitar
                                </Button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <EquipmentRequests key={gymAccess.activeGymId} />
      </div>
    </div>
  );
}

/**
 * "Solicitar nuevo equipamiento" + "Mis solicitudes". El gym pide a
 * BIAFYT que añada una máquina al catálogo global; nunca lo edita. Puede
 * editar y reenviar mientras la solicitud esté pendiente o con correcciones
 * solicitadas.
 */
function EquipmentRequests() {
  const { actions } = useSession();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(null); // null | {} (nueva) | request (editar)

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { equipment_requests: list } = await actions.getEquipmentRequests();
      setRequests(list ?? []);
    } catch (e) {
      setError(apiErrorMessage(e, "No pudimos cargar tus solicitudes."));
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

  if (editing) {
    return (
      <EquipmentRequestForm
        request={editing.id ? editing : null}
        onCancel={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          load();
        }}
      />
    );
  }

  return (
    <Panel
      title="Solicitudes de equipamiento al catálogo"
      action={
        <Button onClick={() => setEditing({})}>Solicitar nuevo equipamiento</Button>
      }
    >
      <p className="muted">
        Si necesitas una máquina que no está en el catálogo global de BIAFYT, solicítala aquí.
        El equipo de BIAFYT la revisará. No puedes editar el catálogo directamente.
      </p>

      {error && <p className="text-warning">{error}</p>}

      {loading && requests.length === 0 ? (
        <p className="muted">Cargando…</p>
      ) : requests.length === 0 ? (
        <EmptyState icon="✎" title="Sin solicitudes" text="Aún no has solicitado equipamiento nuevo." />
      ) : (
        <div className="stack" style={{ marginTop: 12 }}>
          {requests.map((r) => {
            const label = REQUEST_STATUS_LABEL[r.status] ?? { text: r.status, tone: "default" };
            return (
              <div key={r.id} style={{ borderTop: "1px solid var(--c-border)", paddingTop: 12 }}>
                <div className="row-between">
                  <strong>{r.name}</strong>
                  <Badge tone={label.tone}>{label.text}</Badge>
                </div>
                {(r.brand || r.model) && (
                  <p className="micro muted">
                    {[r.brand, r.model].filter(Boolean).join(" · ")}
                  </p>
                )}
                {r.review_note && (
                  <p className="text-warning" style={{ marginTop: 6 }}>
                    BIAFYT: {r.review_note}
                  </p>
                )}
                {r.resulting_equipment && (
                  <p className="text-success" style={{ marginTop: 6 }}>
                    Añadida al catálogo como “{r.resulting_equipment.name}”. Ya puedes añadirla a tu inventario arriba.
                  </p>
                )}
                {r.events?.length > 0 && (
                  <ul className="micro muted" style={{ marginTop: 6, paddingLeft: 16 }}>
                    {r.events.map((e, i) => (
                      <li key={i}>{EVENT_LABEL[e.action] ?? e.action}</li>
                    ))}
                  </ul>
                )}
                {r.status === "changes_requested" && (
                  <div style={{ marginTop: 8 }}>
                    <Button variant="ghost" onClick={() => setEditing(r)}>
                      Editar y reenviar
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}

function EquipmentRequestForm({ request, onCancel, onSaved }) {
  const { actions } = useSession();
  const [form, setForm] = useState({
    name: request?.name ?? "",
    brand: request?.brand ?? "",
    model: request?.model ?? "",
    category: request?.category ?? "",
    description: request?.description ?? "",
    photos: (request?.photo_urls ?? []).join("\n"),
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async () => {
    setError("");
    if (!form.name.trim()) {
      setError("Escribe el nombre del equipamiento.");
      return;
    }
    const photo_urls = form.photos
      .split(/\s*\n\s*/)
      .map((s) => s.trim())
      .filter(Boolean);
    const payload = {
      name: form.name.trim(),
      brand: form.brand.trim() || null,
      model: form.model.trim() || null,
      category: form.category.trim() || null,
      description: form.description.trim() || null,
      photo_urls: photo_urls.length ? photo_urls : null,
    };
    setBusy(true);
    try {
      if (request) await actions.updateEquipmentRequest(request.id, payload);
      else await actions.createEquipmentRequest(payload);
      onSaved();
    } catch (e) {
      setError(apiErrorMessage(e, "No se pudo enviar la solicitud."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel title={request ? "Editar y reenviar solicitud" : "Solicitar nuevo equipamiento"}>
      {request?.review_note && (
        <p className="text-warning">BIAFYT pidió: {request.review_note}</p>
      )}
      <div className="stack-sm">
        <Field label="Nombre (obligatorio)">
          <Input value={form.name} onChange={set("name")} placeholder="Prensa 45°" />
        </Field>
        <Field label="Marca">
          <Input value={form.brand} onChange={set("brand")} placeholder="Hammer Strength" />
        </Field>
        <Field label="Modelo">
          <Input value={form.model} onChange={set("model")} placeholder="ISO-Lateral Leg Press" />
        </Field>
        <Field label="Categoría">
          <Input value={form.category} onChange={set("category")} placeholder="Piernas" />
        </Field>
        <Field label="Descripción">
          <textarea
            className="input"
            rows={3}
            style={{ resize: "vertical", fontFamily: "inherit" }}
            value={form.description}
            onChange={set("description")}
            placeholder="Para qué sirve, qué la diferencia…"
          />
        </Field>
        <Field label="Fotos (una URL por línea)" hint="Enlaces a imágenes. BIAFYT no aloja archivos todavía.">
          <textarea
            className="input"
            rows={2}
            style={{ resize: "vertical", fontFamily: "inherit" }}
            value={form.photos}
            onChange={set("photos")}
            placeholder="https://…"
          />
        </Field>

        {error && <p className="text-warning">{error}</p>}

        <div className="row-gap">
          <Button variant="ghost" disabled={busy} onClick={onCancel}>
            Cancelar
          </Button>
          <Button disabled={busy} onClick={submit}>
            {busy ? "ENVIANDO…" : request ? "REENVIAR" : "ENVIAR SOLICITUD"}
          </Button>
        </div>
      </div>
    </Panel>
  );
}
