import { useMemo, useState } from "react";
import { useSession } from "../state/SessionContext.jsx";
import { Panel, Button, Field, Input } from "../components/UI.jsx";
import { apiErrorMessage } from "../utils/api.js";
import { VALIDITY_OPTIONS, audienceCount, needsValue, templatePayload } from "../utils/voucher.js";

const MODES = [
  { id: "single", label: "A un miembro" },
  { id: "bulk", label: "A varios miembros" },
  { id: "code", label: "Código compartido" },
];

const EMPTY = { title: "", type: "text", value: "", description: "", appliesTo: "" };

/**
 * EMITIR VOUCHER (Gym Web) — tres formas de repartir el mismo beneficio:
 *  - A un miembro: un voucher con su código VCH-….
 *  - A varios miembros: todos, los de una sede o los que elijas; cada uno recibe
 *    SU voucher (con su propio código, se marca usado por separado).
 *  - Código compartido: un código ("VERANO30") con cupo opcional ("los primeros
 *    50") que los miembros canjean en su app; al canjearlo reciben su voucher.
 * La vigencia es "N días desde hoy" o una fecha; ambas cuentan hasta el FINAL
 * del último día. Solo gym_admin (el backend responde 404 a staff).
 */
export default function VoucherIssuePanel({ members, branches, onDone, onError }) {
  const { actions } = useSession();
  const [mode, setMode] = useState("single");
  const [form, setForm] = useState(EMPTY);
  const [validity, setValidity] = useState("none");
  const [date, setDate] = useState("");
  const [athleteId, setAthleteId] = useState("");
  const [audience, setAudience] = useState("all");
  const [branchId, setBranchId] = useState("");
  const [picked, setPicked] = useState(() => new Set());
  const [search, setSearch] = useState("");
  const [code, setCode] = useState("");
  const [maxClaims, setMaxClaims] = useState("");
  const [busy, setBusy] = useState(false);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return members.filter((m) => !q || m.user.name.toLowerCase().includes(q)).slice(0, 200);
  }, [members, search]);

  const recipients = audienceCount(audience, members, branchId, picked.size);

  const toggle = (id) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const reset = () => {
    setForm(EMPTY);
    setValidity("none");
    setDate("");
    setAthleteId("");
    setPicked(new Set());
    setCode("");
    setMaxClaims("");
  };

  const submit = async (e) => {
    e.preventDefault();
    onError("");
    if (validity === "date" && !date) return onError("Elige la fecha de vencimiento.");
    if (mode === "single" && !athleteId) return onError("Elige un miembro.");
    if (mode === "bulk" && audience === "branch" && !branchId) return onError("Elige una sede.");
    if (mode === "bulk" && recipients === 0) return onError("No hay miembros para esa selección.");

    const template = templatePayload(form, validity, date);
    setBusy(true);
    try {
      if (mode === "single") {
        await actions.createVoucher({ athlete_user_id: Number(athleteId), ...template });
        onDone("Voucher emitido.");
      } else if (mode === "bulk") {
        const scope =
          audience === "all"
            ? { scope: "all" }
            : audience === "branch"
              ? { scope: "branch", branch_id: Number(branchId) }
              : { scope: "selected", athlete_user_ids: [...picked] };
        const { issued } = await actions.bulkIssueVouchers({ ...scope, ...template });
        onDone(`Se emitieron ${issued} vouchers (uno por miembro).`);
      } else {
        const { campaign } = await actions.createCampaign({
          ...template,
          ...(code.trim() ? { code: code.trim() } : {}),
          ...(maxClaims ? { max_claims: Number(maxClaims) } : {}),
        });
        onDone(`Código creado: ${campaign.code}. Compártelo: los miembros lo canjean en la app (Vouchers → Canjear código).`);
      }
      reset();
    } catch (err) {
      onError(apiErrorMessage(err, "No se pudo emitir."));
    } finally {
      setBusy(false);
    }
  };

  const submitLabel =
    mode === "single" ? "EMITIR VOUCHER" : mode === "bulk" ? `EMITIR A ${recipients} MIEMBRO${recipients === 1 ? "" : "S"}` : "CREAR CÓDIGO";

  return (
    <Panel title="Emitir voucher">
      <div className="seg" role="group" aria-label="Forma de emisión" style={{ marginBottom: 12 }}>
        {MODES.map((m) => (
          <button key={m.id} type="button" className="btn btn-ghost" aria-pressed={mode === m.id} onClick={() => setMode(m.id)}>
            {m.label}
          </button>
        ))}
      </div>

      {members.length === 0 && mode !== "code" ? (
        <p className="muted">Necesitas al menos un miembro activo para emitir un voucher.</p>
      ) : (
        <form className="stack-sm" onSubmit={submit}>
          {mode === "single" && (
            <Field label="Miembro">
              <select className="input" value={athleteId} onChange={(e) => setAthleteId(e.target.value)} required>
                <option value="">— elige un miembro —</option>
                {members.map((m) => (
                  <option key={m.id} value={m.user.id}>
                    {m.user.name}
                    {m.branch ? ` · ${m.branch.name}` : ""}
                  </option>
                ))}
              </select>
            </Field>
          )}

          {mode === "bulk" && (
            <>
              <Field label="¿A quiénes?">
                <select className="input" value={audience} onChange={(e) => setAudience(e.target.value)}>
                  <option value="all">Todos los miembros activos ({members.length})</option>
                  <option value="branch">Los miembros de una sede</option>
                  <option value="selected">Elegir miembros</option>
                </select>
              </Field>
              {audience === "branch" && (
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
              {audience === "selected" && (
                <div className="stack-sm">
                  <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nombre" aria-label="Buscar miembro" />
                  <div className="row-gap">
                    <Button variant="ghost" onClick={() => setPicked(new Set([...picked, ...visible.map((m) => m.user.id)]))}>
                      Seleccionar visibles
                    </Button>
                    <Button variant="ghost" onClick={() => setPicked(new Set())}>
                      Limpiar
                    </Button>
                    <span className="micro">{picked.size} elegidos</span>
                  </div>
                  <div className="pick-list">
                    {visible.map((m) => (
                      <label key={m.id} className="pick-row">
                        <input type="checkbox" checked={picked.has(m.user.id)} onChange={() => toggle(m.user.id)} />
                        <span>{m.user.name}</span>
                        <span className="micro">{m.branch?.name ?? ""}</span>
                      </label>
                    ))}
                    {visible.length === 0 && <p className="micro">Sin resultados.</p>}
                  </div>
                </div>
              )}
              <p className="micro">Cada miembro recibe su propio voucher, con su propio código; los marcas como usados uno por uno.</p>
            </>
          )}

          {mode === "code" && (
            <>
              <div className="row-gap">
                <Field label="Código (opcional)" hint="4 a 20 letras o números. Vacío = se genera solo.">
                  <Input value={code} onChange={(e) => setCode(e.target.value.replace(/[^A-Za-z0-9]/g, ""))} placeholder="VERANO30" maxLength={20} />
                </Field>
                <Field label="Cupo (opcional)" hint="Ej. 50 = los primeros 50. Vacío = sin límite.">
                  <Input type="number" min="1" value={maxClaims} onChange={(e) => setMaxClaims(e.target.value)} placeholder="Sin límite" />
                </Field>
              </div>
              <p className="micro">
                Los miembros activos de tu gimnasio lo canjean en la app; cada uno una vez. Al canjear reciben su propio voucher.
              </p>
            </>
          )}

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
            {needsValue(form.type) && (
              <Field label={form.type === "percent" ? "Porcentaje" : "Valor"}>
                <Input type="number" min="1" max={form.type === "percent" ? "100" : undefined} value={form.value} onChange={set("value")} required />
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
            <Field label="Vigencia" hint="Cuenta hasta el final del último día.">
              <select className="input" value={validity} onChange={(e) => setValidity(e.target.value)}>
                {VALIDITY_OPTIONS.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>
            {validity === "date" && (
              <Field label="Vence el">
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
              </Field>
            )}
          </div>
          <div>
            <Button type="submit" disabled={busy}>
              {busy ? "ENVIANDO…" : submitLabel}
            </Button>
          </div>
        </form>
      )}
    </Panel>
  );
}
