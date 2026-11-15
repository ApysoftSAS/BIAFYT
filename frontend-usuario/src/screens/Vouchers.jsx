import { useEffect, useState } from "react";
import { useApp } from "../state/AppContext.jsx";
import { apiClaimVoucherCode, apiGetMyVouchers, apiErrorMessage } from "../utils/api.js";
import { STATUS, benefitText, claimErrorMessage, issuerName, validUntil } from "../utils/vouchers.js";
import { Badge, Button, Card, Field, Input, Screen } from "../components/UI.jsx";

/**
 * VOUCHERS — los beneficios que tu gimnasio o tu coach te dan (`GET /me/vouchers`)
 * y el canje de un código compartido que te entregó tu gimnasio
 * (`POST /me/voucher-campaigns/claim`): al canjearlo recibes TU voucher.
 *
 * El voucher no mueve dinero en BIAFYT: muestras el código en el gimnasio y
 * ellos confirman que lo usaste ("Marcar usado"). Aquí solo se leen y se canjean.
 */
export default function Vouchers({ onBack }) {
  const { state } = useApp();
  const token = state.auth.token;
  const [vouchers, setVouchers] = useState(null); // null = cargando
  const [nextCursor, setNextCursor] = useState(null);
  const [reload, setReload] = useState(0);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!token) return;
    let alive = true;
    apiGetMyVouchers(token)
      .then((d) => {
        if (!alive) return;
        setVouchers(d.vouchers ?? []);
        setNextCursor(d.has_more ? d.next_cursor : null);
      })
      .catch((e) => {
        if (!alive) return;
        setVouchers([]);
        setError(apiErrorMessage(e, "No pudimos cargar tus vouchers."));
      });
    return () => {
      alive = false;
    };
  }, [token, reload]);

  const claim = async (e) => {
    e.preventDefault();
    if (!code.trim()) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const { voucher } = await apiClaimVoucherCode(token, code.trim());
      setNotice(`¡Listo! «${voucher.title}» ya está en tu lista.`);
      setCode("");
      setReload((n) => n + 1);
    } catch (err) {
      setError(claimErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const loadMore = async () => {
    setBusy(true);
    try {
      const d = await apiGetMyVouchers(token, nextCursor);
      setVouchers((prev) => [...prev, ...(d.vouchers ?? [])]);
      setNextCursor(d.has_more ? d.next_cursor : null);
    } catch (err) {
      setError(apiErrorMessage(err, "No pudimos cargar más."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen title="VOUCHERS" subtitle="Tus beneficios y códigos." onBack={onBack}>
      <div className="stack">
        <Card>
          <p className="micro">CANJEAR UN CÓDIGO</p>
          <p className="muted">¿Tu gimnasio te dio un código (por ejemplo VERANO30)? Escríbelo aquí para recibir tu voucher.</p>
          <form className="stack-sm" onSubmit={claim}>
            <Field label="Código">
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/[^A-Za-z0-9]/g, "").toUpperCase())}
                placeholder="VERANO30"
                maxLength={24}
                autoCapitalize="characters"
                autoComplete="off"
              />
            </Field>
            <Button type="submit" full disabled={busy || !code.trim()}>
              {busy ? "CANJEANDO…" : "CANJEAR"}
            </Button>
          </form>
          {error && (
            <p className="muted text-warning" role="alert">
              {error}
            </p>
          )}
          {notice && (
            <p className="muted text-success" role="status">
              {notice}
            </p>
          )}
        </Card>

        {vouchers === null && <p className="muted center">Cargando…</p>}
        {vouchers?.length === 0 && (
          <p className="muted center">Aún no tienes vouchers. Cuando tu gimnasio o tu coach te dé uno, aparecerá aquí.</p>
        )}

        {vouchers?.map((v) => (
          <Card key={v.id}>
            <div className="row-between">
              <strong>{v.title}</strong>
              <Badge tone={STATUS[v.status]?.tone}>{STATUS[v.status]?.label ?? v.status}</Badge>
            </div>
            <p className="muted">{benefitText(v)}</p>
            <p className="micro">
              {issuerName(v)}
              {v.applies_to ? ` · Aplica a: ${v.applies_to}` : ""}
            </p>
            {v.status === "issued" && (
              <>
                <p className="micro">TU CÓDIGO</p>
                <strong className="voucher-code">{v.code}</strong>
                <p className="micro">
                  Muéstralo en el gimnasio para usarlo.
                  {v.expires_at ? ` Válido hasta el ${validUntil(v.expires_at)}.` : " Sin fecha de vencimiento."}
                </p>
              </>
            )}
            {v.status === "redeemed" && <p className="micro">Ya lo usaste{v.redeemed_at ? ` el ${validUntil(v.redeemed_at)}` : ""}.</p>}
            {v.status === "expired" && <p className="micro">Venció{v.expires_at ? ` el ${validUntil(v.expires_at)}` : ""}.</p>}
            {v.status === "revoked" && <p className="micro">Este voucher fue anulado por quien lo emitió.</p>}
          </Card>
        ))}

        {nextCursor && (
          <Button variant="ghost" full disabled={busy} onClick={loadMore}>
            CARGAR MÁS
          </Button>
        )}
      </div>
    </Screen>
  );
}
