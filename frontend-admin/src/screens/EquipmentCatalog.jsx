import { useCallback, useEffect, useState } from "react";
import { useSession } from "../state/SessionContext.jsx";
import { Panel, Badge, EmptyState, Button, Modal, Field, Input } from "../components/UI.jsx";
import { apiErrorMessage } from "../utils/api.js";

/**
 * CATÁLOGO → EQUIPAMIENTO (BIAFYT Admin)
 *
 * El catálogo global de máquinas de BIAFYT. Esta pantalla es el ÚNICO
 * lugar donde se crea/edita `equipment`; un gym solo gestiona su inventario
 * y puede solicitar una máquina nueva (ver "Solicitudes de equipo").
 */
export default function EquipmentCatalog() {
  const { actions } = useSession();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(null); // null | {} (nuevo) | item

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { equipment } = await actions.listEquipment();
      setItems(equipment ?? []);
    } catch (e) {
      setError(apiErrorMessage(e, "No pudimos cargar el catálogo."));
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
        <h2>Catálogo de equipamiento</h2>
        <p>El catálogo global de BIAFYT. Los gimnasios lo usan para su inventario; no pueden editarlo.</p>
      </div>

      <div className="stack">
        {error && <p className="text-warning">{error}</p>}

        <Panel
          title={`Equipamiento (${items.length})`}
          action={<Button onClick={() => setEditing({})}>Nuevo equipamiento</Button>}
        >
          {loading && items.length === 0 ? (
            <p className="muted">Cargando…</p>
          ) : items.length === 0 ? (
            <EmptyState icon="◻" title="Catálogo vacío" text="Crea el primer equipamiento." />
          ) : (
            <div className="gym-table-wrap">
              <table className="gym-table">
                <thead>
                  <tr>
                    <th>Nombre</th>
                    <th>Marca / Modelo</th>
                    <th>Categoría</th>
                    <th>Gyms</th>
                    <th>Estado</th>
                    <th aria-label="acciones" />
                  </tr>
                </thead>
                <tbody>
                  {items.map((it) => (
                    <tr key={it.id}>
                      <td>
                        <button className="link-button" onClick={() => setEditing(it)}>
                          {it.name}
                        </button>
                        <div className="micro muted">{it.slug}</div>
                      </td>
                      <td>{[it.brand, it.model].filter(Boolean).join(" · ") || "—"}</td>
                      <td>{it.category || "—"}</td>
                      <td>{it.gym_count}</td>
                      <td>
                        {it.is_active ? <Badge tone="success">Activo</Badge> : <Badge tone="warning">Inactivo</Badge>}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <Button variant="ghost" onClick={() => setEditing(it)}>
                          Editar
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>

      {editing && (
        <EquipmentEditor
          item={editing.id ? editing : null}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function EquipmentEditor({ item, onClose, onSaved }) {
  const { actions } = useSession();
  const [form, setForm] = useState({
    name: item?.name ?? "",
    brand: item?.brand ?? "",
    model: item?.model ?? "",
    category: item?.category ?? "",
    description: item?.description ?? "",
    photos: (item?.photo_urls ?? []).join("\n"),
    is_active: item?.is_active ?? true,
    // Ficha educativa (biblioteca de máquinas de la app del atleta).
    purpose: item?.purpose ?? "",
    primary_muscle: item?.primary_muscle ?? "",
    secondary_muscles: (item?.secondary_muscles ?? []).join("\n"),
    movement: item?.movement ?? "",
    level: item?.level ?? "",
    tips: (item?.tips ?? []).join("\n"),
    mistakes: (item?.mistakes ?? []).join("\n"),
    related: (item?.related ?? []).join("\n"),
    art: item?.art ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const lines = (s) => s.split(/\s*\n\s*/).map((x) => x.trim()).filter(Boolean);

  const save = async () => {
    setError("");
    if (!form.name.trim()) {
      setError("El nombre es obligatorio.");
      return;
    }
    const photo_urls = lines(form.photos);
    const secondary_muscles = lines(form.secondary_muscles);
    const tips = lines(form.tips);
    const mistakes = lines(form.mistakes);
    const related = lines(form.related);
    const payload = {
      name: form.name.trim(),
      brand: form.brand.trim() || null,
      model: form.model.trim() || null,
      category: form.category.trim() || null,
      description: form.description.trim() || null,
      photo_urls: photo_urls.length ? photo_urls : null,
      is_active: Boolean(form.is_active),
      purpose: form.purpose.trim() || null,
      primary_muscle: form.primary_muscle.trim() || null,
      secondary_muscles: secondary_muscles.length ? secondary_muscles : null,
      movement: form.movement.trim() || null,
      level: form.level.trim() || null,
      tips: tips.length ? tips : null,
      mistakes: mistakes.length ? mistakes : null,
      related: related.length ? related : null,
      art: form.art.trim() || null,
    };
    setBusy(true);
    try {
      if (item) await actions.updateEquipment(item.id, payload);
      else await actions.createEquipment(payload);
      onSaved();
    } catch (e) {
      setError(apiErrorMessage(e, "No se pudo guardar."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open title={item ? `Editar “${item.name}”` : "Nuevo equipamiento"} onClose={onClose}>
      <div className="stack-sm">
        {item && <p className="micro muted">slug: {item.slug} · en {item.gym_count} gym(s) — el slug no se puede cambiar</p>}
        <Field label="Nombre (obligatorio)">
          <Input value={form.name} onChange={set("name")} placeholder="Prensa de piernas" />
        </Field>
        <Field label="Marca">
          <Input value={form.brand} onChange={set("brand")} />
        </Field>
        <Field label="Modelo">
          <Input value={form.model} onChange={set("model")} />
        </Field>
        <Field label="Categoría">
          <Input value={form.category} onChange={set("category")} placeholder="Piernas" />
        </Field>
        <Field label="Descripción">
          <textarea className="input" rows={3} style={{ resize: "vertical", fontFamily: "inherit" }} value={form.description} onChange={set("description")} />
        </Field>
        <Field label="Fotos (una URL por línea)">
          <textarea className="input" rows={2} style={{ resize: "vertical", fontFamily: "inherit" }} value={form.photos} onChange={set("photos")} placeholder="https://…" />
        </Field>

        <p className="micro muted" style={{ marginTop: 8 }}>
          FICHA EDUCATIVA (biblioteca de máquinas de la app del atleta)
        </p>
        <Field label="¿Para qué sirve?">
          <textarea className="input" rows={2} style={{ resize: "vertical", fontFamily: "inherit" }} value={form.purpose} onChange={set("purpose")} />
        </Field>
        <Field label="Músculo principal">
          <Input value={form.primary_muscle} onChange={set("primary_muscle")} placeholder="Cuádriceps" />
        </Field>
        <Field label="Músculos secundarios (uno por línea)">
          <textarea className="input" rows={2} style={{ resize: "vertical", fontFamily: "inherit" }} value={form.secondary_muscles} onChange={set("secondary_muscles")} />
        </Field>
        <Field label="Patrón de movimiento">
          <Input value={form.movement} onChange={set("movement")} placeholder="Empuje de tren inferior" />
        </Field>
        <Field label="Nivel">
          <Input value={form.level} onChange={set("level")} placeholder="Principiante / Intermedio / Avanzado" />
        </Field>
        <Field label="Consejos (uno por línea)">
          <textarea className="input" rows={3} style={{ resize: "vertical", fontFamily: "inherit" }} value={form.tips} onChange={set("tips")} />
        </Field>
        <Field label="Errores frecuentes (uno por línea)">
          <textarea className="input" rows={3} style={{ resize: "vertical", fontFamily: "inherit" }} value={form.mistakes} onChange={set("mistakes")} />
        </Field>
        <Field label="Ejercicios relacionados (uno por línea)">
          <textarea className="input" rows={2} style={{ resize: "vertical", fontFamily: "inherit" }} value={form.related} onChange={set("related")} />
        </Field>
        <Field label="Ilustración (clave `art`)" hint="Clave que MachineArt.jsx resuelve: chestPress, latPulldown, legPress, seatedRow, legExtension, legCurl, shoulderPress, cableStation, treadmill, hipThrust. Si no coincide, se usa un dibujo por defecto.">
          <Input value={form.art} onChange={set("art")} placeholder="legPress" />
        </Field>

        <label className="row-gap" style={{ alignItems: "center", marginTop: 8 }}>
          <input type="checkbox" checked={form.is_active} onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))} />
          <span>Activo (visible para gimnasios y atletas)</span>
        </label>

        {error && <p className="text-warning">{error}</p>}

        <div className="row-gap">
          <Button variant="ghost" disabled={busy} onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={busy} onClick={save}>
            {busy ? "GUARDANDO…" : item ? "GUARDAR" : "CREAR"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
