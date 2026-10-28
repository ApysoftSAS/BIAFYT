import { useCallback, useEffect, useState } from "react";
import { useSession } from "../state/SessionContext.jsx";
import { Panel, EmptyState, Button, Modal, Field, Input } from "../components/UI.jsx";
import { apiErrorMessage } from "../utils/api.js";
import { formatDate } from "../utils/admin.js";

const AUDIENCES = [
  { value: "athlete", label: "Athlete" },
  { value: "coach", label: "Coach" },
  { value: "gym", label: "Gym" },
];

const DURATIONS = [3, 6, 12];

function audienceLabel(value) {
  return AUDIENCES.find((a) => a.value === value)?.label ?? value ?? "—";
}

function emptyRule() {
  return { audience: "athlete", duration_months: 3, benefit_type: "percent", benefit_value: "" };
}

function ruleSummary(rule) {
  const value = rule.benefit_value != null ? `${rule.benefit_value}${rule.benefit_type === "percent" ? "%" : ""}` : "—";
  return `${audienceLabel(rule.audience)} · ${rule.duration_months}m · ${value}`;
}

/**
 * PROMOCIONES (BIAFYT Admin) — Promotion V1.
 *
 * Descuentos de plataforma sobre membresías Premium de Athlete, Coach y/o
 * Gym. La audiencia y el beneficio viven en cada regla (`PromotionRule`),
 * nunca en la promoción — una misma promoción puede tener reglas para una,
 * dos o las tres audiencias, con valores distintos por audiencia y por
 * duración (3/6/12 meses). Alcance V1: listar y crear únicamente — el
 * backend no soporta edición, eliminación ni agregar reglas después de
 * creada; esta pantalla no los inventa.
 */
export default function Promotions() {
  const { actions } = useSession();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { promotions } = await actions.listPromotions();
      setItems(promotions ?? []);
    } catch (e) {
      setError(apiErrorMessage(e, "No pudimos cargar las promociones."));
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
        <h2>Promociones</h2>
        <p>Descuentos de BIAFYT sobre membresías Premium de Athlete, Coach y Gym.</p>
      </div>

      <div className="stack">
        {error && <p className="text-warning">{error}</p>}

        <Panel
          title={`Promociones (${items.length})`}
          action={<Button onClick={() => setCreating(true)}>Nueva promoción</Button>}
        >
          {loading && items.length === 0 ? (
            <p className="muted">Cargando…</p>
          ) : items.length === 0 ? (
            <EmptyState icon="◈" title="Sin promociones" text="Crea la primera promoción." />
          ) : (
            <div className="gym-table-wrap">
              <table className="gym-table">
                <thead>
                  <tr>
                    <th>Código</th>
                    <th>Estado</th>
                    <th>Vigencia</th>
                    <th>Reglas</th>
                    <th>Creada</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((p) => (
                    <tr key={p.id}>
                      <td>
                        <code>{p.code}</code>
                      </td>
                      <td>{p.active ? "Activa" : "Inactiva"}</td>
                      <td>
                        {p.valid_from || p.valid_until
                          ? `${formatDate(p.valid_from) || "—"} → ${formatDate(p.valid_until) || "—"}`
                          : "Sin vencimiento"}
                      </td>
                      <td>{(p.rules ?? []).map(ruleSummary).join(", ")}</td>
                      <td>{formatDate(p.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>

      {creating && (
        <PromotionCreator
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            load();
          }}
        />
      )}
    </div>
  );
}

function PromotionCreator({ onClose, onCreated }) {
  const { actions } = useSession();
  const [code, setCode] = useState("");
  const [active, setActive] = useState(true);
  const [validFrom, setValidFrom] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [rules, setRules] = useState([emptyRule()]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const updateRule = (index, patch) => setRules((rs) => rs.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  const addRule = () => setRules((rs) => [...rs, emptyRule()]);
  const removeRule = (index) => setRules((rs) => rs.filter((_, i) => i !== index));

  const save = async () => {
    setError("");
    if (!code.trim()) {
      setError("El código es obligatorio.");
      return;
    }
    if (rules.length === 0) {
      setError("Agrega al menos una regla.");
      return;
    }
    if (rules.some((r) => r.benefit_value === "" || r.benefit_value == null)) {
      setError("Todas las reglas necesitan un valor de beneficio.");
      return;
    }

    const payload = {
      code: code.trim(),
      active,
      valid_from: validFrom || null,
      valid_until: validUntil || null,
      rules: rules.map((r) => ({
        audience: r.audience,
        duration_months: Number(r.duration_months),
        benefit_type: r.benefit_type,
        benefit_value: Number(r.benefit_value),
      })),
    };

    setBusy(true);
    try {
      await actions.createPromotion(payload);
      onCreated();
    } catch (e) {
      setError(apiErrorMessage(e, "No se pudo crear la promoción."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open title="Nueva promoción" onClose={onClose}>
      <div className="stack-sm">
        <Field label="Código" hint="Se normaliza automáticamente (sin espacios, en mayúsculas).">
          <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="ANIVERSARIO2026" />
        </Field>

        <Field label="Activa">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
        </Field>

        <Field label="Vigente desde (opcional)">
          <Input type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} />
        </Field>
        <Field label="Vigente hasta (opcional)">
          <Input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
        </Field>

        <div className="stack-sm">
          <strong>Reglas</strong>
          {rules.map((rule, i) => (
            <div className="promotion-rule-row row-gap" key={i}>
              <select
                className="input"
                aria-label="Audiencia"
                value={rule.audience}
                onChange={(e) => updateRule(i, { audience: e.target.value })}
              >
                {AUDIENCES.map((a) => (
                  <option key={a.value} value={a.value}>
                    {a.label}
                  </option>
                ))}
              </select>
              <select
                className="input"
                aria-label="Duración"
                value={rule.duration_months}
                onChange={(e) => updateRule(i, { duration_months: e.target.value })}
              >
                {DURATIONS.map((d) => (
                  <option key={d} value={d}>
                    {d} meses
                  </option>
                ))}
              </select>
              <select
                className="input"
                aria-label="Tipo de beneficio"
                value={rule.benefit_type}
                onChange={(e) => updateRule(i, { benefit_type: e.target.value })}
              >
                <option value="percent">Porcentaje</option>
                <option value="fixed">Monto fijo</option>
              </select>
              <Input
                aria-label="Valor del beneficio"
                type="number"
                min="1"
                placeholder="Valor"
                value={rule.benefit_value}
                onChange={(e) => updateRule(i, { benefit_value: e.target.value })}
              />
              <Button variant="ghost" onClick={() => removeRule(i)} disabled={rules.length === 1}>
                Quitar
              </Button>
            </div>
          ))}
          <Button variant="ghost" onClick={addRule}>
            Agregar regla
          </Button>
        </div>

        {error && <p className="text-warning">{error}</p>}

        <div className="row-gap">
          <Button variant="ghost" disabled={busy} onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={busy} onClick={save}>
            {busy ? "CREANDO…" : "CREAR"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
