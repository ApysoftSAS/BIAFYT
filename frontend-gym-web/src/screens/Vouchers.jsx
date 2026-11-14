import { useCallback, useEffect, useState } from "react";
import { useSession } from "../state/SessionContext.jsx";
import { Panel, Button, Field, Input, Badge, EmptyState } from "../components/UI.jsx";
import { apiErrorMessage } from "../utils/api.js";
import { formatDate } from "../utils/gym.js";

const STATUS = {
  issued: { label: "Vigente", tone: "success" },
  redeemed: { label: "Usado", tone: "accent" },
  revoked: { label: "Anulado", tone: "error" },
  expired: { label: "Vencido", tone: "warning" },
};

const EMPTY_FORM = { athleteId: "", title: "", type: "text", value: "", description: "", appliesTo: "", expiresAt: "" };

function benefitText(v) {
  if (v.benefit_type === "percent") return `${v.benefit_value}% de descuento`;
  if (v.benefit_type === "fixed") return `Descuento de ${v.benefit_value}`;
  return v.benefit_description;
}

/**
 * VOUCHERS (Gym Web) — beneficios que el gym emite a sus miembros activos.
 * Sin dinero: BIAFYT no cobra ni calcula precios. El miembro ve el voucher
 * y su código en su app; el gym confirma aquí cuándo lo usó ("Marcar usado")
 * o lo anula mientras siga vigente.
 */
export default function Vouchers() {
  const { gymAccess, actions } = useSession();
  const [vouchers, setVouchers] = useState([]);
  const [nextCursor, setNextCursor] = useState(null);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const load = useCallback(async () => {
    try {
      const [v, m] = await Promise.all([actions.getVouchers(), actions.getMembers()]);
      setVouchers(v.vouchers ?? []);
      setNextCursor(v.has_more ? v.next_cursor : null);
      setMembers(m.members ?? []);
    } catch (e) {
      setError(apiErrorMessage(e, "No pudimos cargar los vouchers."));
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

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const needsValue = form.type !== "text";

  const submit = (e) => {
    e.preventDefault();
    run(async () => {
      await actions.createVoucher({
        athlete_user_id: Number(form.athleteId),
        title: form.title.trim(),
        benefit_type: form.type,
        benefit_value: needsValue ? Number(form.value) : null,
        benefit_description: form.description.trim(),
        applies_to: form.appliesTo.trim() || null,
        expires_at: form.expiresAt || null,
      });
      setForm(EMPTY_FORM);
    }, "No se pudo emitir el voucher.");
  };

  const loadMore = async () => {
    setBusy(true);
    try {
      const v = await actions.getVouchers(nextCursor);
      setVouchers((prev) => [...prev, ...(v.vouchers ?? [])]);
      setNextCursor(v.has_more ? v.next_cursor : null);
    } catch (e) {
      setError(apiErrorMessage(e, "No pudimos cargar más vouchers."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="gym-main-head">
        <h2>Vouchers</h2>
        <p>Beneficios para tus miembros. El miembro lo ve en su app; tú confirmas aquí cuando lo usa.</p>
      </div>

      <div className="stack">
        {error && (
          <p className="text-warning" role="alert">
            {error}
          </p>
        )}

        <Panel title="Emitir voucher">
          {members.length === 0 && !loading ? (
            <p className="muted">Necesitas al menos un miembro activo para emitir un voucher.</p>
          ) : (
            <form className="stack-sm" onSubmit={submit}>
              <Field label="Miembro">
                <select className="input" value={form.athleteId} onChange={set("athleteId")} required>
                  <option value="">— elige un miembro —</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.user.id}>
                      {m.user.name}
                      {m.branch ? ` · ${m.branch.name}` : ""}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Título">
                <Input value={form.title} onChange={set("title")} placeholder="Clase de cortesía" maxLength={255} required />
              </Field>
              <div className="row-gap">
                <Field label="Tipo de beneficio">
                  <select className="input" value={form.type} onChange={set("type")}>
                    <option value="text">Beneficio descrito</option>
                    <option value="percent">Descuento en %</option>
                    <option value="fixed">Descuento de valor fijo</option>
                  </select>
                </Field>
                {needsValue && (
                  <Field label={form.type === "percent" ? "Porcentaje" : "Valor"}>
                    <Input
                      type="number"
                      min="1"
                      max={form.type === "percent" ? "100" : undefined}
                      value={form.value}
                      onChange={set("value")}
                      required
                    />
                  </Field>
                )}
              </div>
              <Field label="Descripción" hint="Qué recibe el miembro y cómo usarlo.">
                <Input value={form.description} onChange={set("description")} maxLength={2000} required />
              </Field>
              <div className="row-gap">
                <Field label="Aplica a (opcional)">
                  <Input value={form.appliesTo} onChange={set("appliesTo")} placeholder="Mensualidad, tienda…" maxLength={255} />
                </Field>
                <Field label="Vence (opcional)">
                  <Input type="date" value={form.expiresAt} onChange={set("expiresAt")} />
                </Field>
              </div>
              <div>
                <Button type="submit" disabled={busy}>
                  {busy ? "EMITIENDO…" : "EMITIR VOUCHER"}
                </Button>
              </div>
            </form>
          )}
        </Panel>

        <Panel title={`Vouchers emitidos (${vouchers.length}${nextCursor ? "+" : ""})`}>
          {loading ? (
            <p className="muted">Cargando…</p>
          ) : vouchers.length === 0 ? (
            <EmptyState icon="◇" title="Sin vouchers" text="Emite el primero arriba." />
          ) : (
            <div className="gym-table-wrap">
              <table className="gym-table">
                <thead>
                  <tr>
                    <th>Código</th>
                    <th>Miembro</th>
                    <th>Beneficio</th>
                    <th>Estado</th>
                    <th>Vence</th>
                    <th aria-label="acciones" />
                  </tr>
                </thead>
                <tbody>
                  {vouchers.map((v) => (
                    <tr key={v.id}>
                      <td>{v.code}</td>
                      <td>{v.athlete?.name ?? "—"}</td>
                      <td>
                        <strong>{v.title}</strong>
                        <p className="micro">{benefitText(v)}</p>
                      </td>
                      <td>
                        <Badge tone={STATUS[v.status]?.tone}>{STATUS[v.status]?.label ?? v.status}</Badge>
                      </td>
                      <td>{v.expires_at ? formatDate(v.expires_at) : "—"}</td>
                      <td style={{ textAlign: "right" }}>
                        {v.status === "issued" && (
                          <div className="row-gap" style={{ justifyContent: "flex-end" }}>
                            <Button variant="ghost" disabled={busy} onClick={() => run(() => actions.redeemVoucher(v.id), "No se pudo marcar como usado.")}>
                              Marcar usado
                            </Button>
                            <Button variant="ghost" disabled={busy} onClick={() => run(() => actions.revokeVoucher(v.id), "No se pudo anular.")}>
                              Anular
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
          {nextCursor && (
            <Button variant="ghost" disabled={busy} onClick={loadMore}>
              Cargar más
            </Button>
          )}
        </Panel>
      </div>
    </div>
  );
}
