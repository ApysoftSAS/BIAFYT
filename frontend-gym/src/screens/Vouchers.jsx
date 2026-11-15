import { useCallback, useEffect, useState } from "react";
import { useSession } from "../state/SessionContext.jsx";
import { Panel, Button, Badge, EmptyState } from "../components/UI.jsx";
import { apiErrorMessage } from "../utils/api.js";
import { formatDate } from "../utils/gym.js";
import { CAMPAIGN_STATUS, benefitText, claimsLabel } from "../utils/voucher.js";
import VoucherIssuePanel from "./VoucherIssuePanel.jsx";

const STATUS = {
  issued: { label: "Vigente", tone: "success" },
  redeemed: { label: "Usado", tone: "accent" },
  revoked: { label: "Anulado", tone: "error" },
  expired: { label: "Vencido", tone: "warning" },
};

/**
 * VOUCHERS (Gym Web) — beneficios que el gym da a sus miembros activos.
 * Sin dinero: BIAFYT no cobra ni calcula precios. El miembro ve el voucher y
 * su código en su app; el gym confirma aquí cuándo lo usó ("Marcar usado") o
 * lo anula mientras siga vigente. Se puede emitir a un miembro, a varios a la
 * vez o con un código compartido con cupo (`VoucherIssuePanel`). El STAFF
 * (recepción) solo ve la lista y marca usados: emitir, anular y los códigos
 * compartidos son del gym_admin.
 */
export default function Vouchers() {
  const { gymAccess, actions, activeRole } = useSession();
  const isAdmin = activeRole === "gym_admin";
  const [vouchers, setVouchers] = useState([]);
  const [nextCursor, setNextCursor] = useState(null);
  const [members, setMembers] = useState([]);
  const [branches, setBranches] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const none = Promise.resolve(null);
      const [v, m, b, c] = await Promise.all([
        actions.getVouchers(),
        isAdmin ? actions.getMembers() : none,
        isAdmin ? actions.getBranches() : none,
        isAdmin ? actions.getCampaigns() : none,
      ]);
      setVouchers(v.vouchers ?? []);
      setNextCursor(v.has_more ? v.next_cursor : null);
      setMembers(m?.members ?? []);
      setBranches(b ?? []);
      setCampaigns(c?.campaigns ?? []);
    } catch (e) {
      setError(apiErrorMessage(e, "No pudimos cargar los vouchers."));
    } finally {
      setLoading(false);
    }
  }, [actions, isAdmin]);

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
    setNotice("");
    try {
      await fn();
      await load();
    } catch (e) {
      setError(apiErrorMessage(e, fallback));
    } finally {
      setBusy(false);
    }
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
        <p>
          {isAdmin
            ? "Beneficios para tus miembros. El miembro lo ve en su app; tú confirmas aquí cuando lo usa."
            : "Confirma aquí cuando un miembro usa su beneficio (pídele el código VCH-…)."}
        </p>
      </div>

      <div className="stack">
        {error && (
          <p className="text-warning" role="alert">
            {error}
          </p>
        )}
        {notice && (
          <p className="text-success" role="status">
            {notice}
          </p>
        )}

        {isAdmin && (
          <VoucherIssuePanel
            members={members}
            branches={branches}
            onError={setError}
            onDone={async (message) => {
              setError("");
              setNotice(message);
              await load();
            }}
          />
        )}

        {isAdmin && (
          <Panel title={`Códigos compartidos (${campaigns.length})`}>
            {campaigns.length === 0 ? (
              <p className="muted">Aún no has creado códigos. Usa "Código compartido" arriba.</p>
            ) : (
              <div className="gym-table-wrap">
                <table className="gym-table">
                  <thead>
                    <tr>
                      <th>Código</th>
                      <th>Beneficio</th>
                      <th>Canjes</th>
                      <th>Vence</th>
                      <th>Estado</th>
                      <th aria-label="acciones" />
                    </tr>
                  </thead>
                  <tbody>
                    {campaigns.map((c) => (
                      <tr key={c.id}>
                        <td>
                          <strong>{c.code}</strong>
                        </td>
                        <td>
                          <strong>{c.title}</strong>
                          <p className="micro">{benefitText(c)}</p>
                        </td>
                        <td>{claimsLabel(c)}</td>
                        <td>{c.expires_at ? formatDate(c.expires_at) : "—"}</td>
                        <td>
                          <Badge tone={CAMPAIGN_STATUS[c.status]?.tone}>{CAMPAIGN_STATUS[c.status]?.label ?? c.status}</Badge>
                        </td>
                        <td style={{ textAlign: "right" }}>
                          {c.status === "active" && (
                            <Button variant="ghost" disabled={busy} onClick={() => run(() => actions.closeCampaign(c.id), "No se pudo cerrar el código.")}>
                              Cerrar
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="micro">Cerrar un código detiene nuevos canjes; los vouchers ya canjeados siguen vigentes.</p>
          </Panel>
        )}

        <Panel title={`Vouchers emitidos (${vouchers.length}${nextCursor ? "+" : ""})`}>
          {loading ? (
            <p className="muted">Cargando…</p>
          ) : vouchers.length === 0 ? (
            <EmptyState icon="◇" title="Sin vouchers" text={isAdmin ? "Emite el primero arriba." : "Aún no hay vouchers."} />
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
                        <p className="micro">
                          {benefitText(v)}
                          {v.via_code ? " · vía código" : ""}
                        </p>
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
                            {isAdmin && (
                              <Button variant="ghost" disabled={busy} onClick={() => run(() => actions.revokeVoucher(v.id), "No se pudo anular.")}>
                                Anular
                              </Button>
                            )}
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
