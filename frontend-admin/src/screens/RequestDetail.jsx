import { useCallback, useEffect, useState } from "react";
import { useSession } from "../state/SessionContext.jsx";
import { Modal, Button, Field } from "../components/UI.jsx";
import { apiErrorMessage } from "../utils/api.js";
import { statusLabel, formatDate } from "../utils/admin.js";

/**
 * DETALLE DE SOLICITUD (Admin) — modal con aprobar/rechazar.
 *
 * Aprobar es idempotente y crea Gym + sede principal + `gym_admin` para el
 * solicitante, todo en el backend en una transacción.
 */
export default function RequestDetail({ id, onClose, onReviewed }) {
  const { actions } = useSession();
  const [req, setReq] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState("");
  const [confirm, setConfirm] = useState(null); // "approve" | "reject"

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await actions.getRequest(id);
      setReq(data.gym_registration_request);
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

  const review = async (kind) => {
    setBusy(kind);
    setError("");
    try {
      const fn = kind === "approve" ? actions.approveRequest : actions.rejectRequest;
      await fn(id, note.trim());
      onReviewed();
    } catch (e) {
      setError(apiErrorMessage(e, "No se pudo completar la revisión."));
      setConfirm(null);
    } finally {
      setBusy("");
    }
  };

  const s = req ? statusLabel(req.status) : null;
  const isPending = req?.status === "pending";

  return (
    <Modal open title={req?.gym_name ?? "Solicitud"} onClose={busy ? undefined : onClose}>
      {loading && <p className="muted">Cargando…</p>}
      {error && <p className="text-warning">{error}</p>}

      {req && !loading && (
        <div className="stack">
          <div className="row-between">
            <span className="muted">Estado</span>
            <span>{s.text}</span>
          </div>
          <div className="row-between">
            <span className="muted">Sede principal</span>
            <span>{req.branch_name}</span>
          </div>
          <div className="row-between">
            <span className="muted">Solicitante</span>
            <span>{req.applicant?.name}</span>
          </div>
          <div className="row-between">
            <span className="muted">Correo</span>
            <span>{req.applicant?.email}</span>
          </div>
          <div className="row-between">
            <span className="muted">Fecha</span>
            <span>{formatDate(req.created_at)}</span>
          </div>

          {req.applicant_message && (
            <div>
              <p className="micro">MENSAJE DEL SOLICITANTE</p>
              <p style={{ whiteSpace: "pre-wrap" }}>{req.applicant_message}</p>
            </div>
          )}

          {req.gym && (
            <div className="row-between">
              <span className="muted">Gimnasio creado</span>
              <span>
                {req.gym.name} <span className="micro">#{req.gym.id}</span>
              </span>
            </div>
          )}

          {req.review_note && (
            <div>
              <p className="micro">NOTA DE REVISIÓN</p>
              <p style={{ whiteSpace: "pre-wrap" }}>{req.review_note}</p>
            </div>
          )}

          {isPending && !confirm && (
            <>
              <Field label="Nota de revisión (opcional)">
                <textarea
                  className="input"
                  rows={3}
                  style={{ resize: "vertical", minHeight: 72, fontFamily: "inherit" }}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  maxLength={2000}
                />
              </Field>
              <div className="row-gap">
                <Button variant="danger" disabled={Boolean(busy)} onClick={() => setConfirm("reject")}>
                  RECHAZAR
                </Button>
                <Button disabled={Boolean(busy)} onClick={() => setConfirm("approve")}>
                  APROBAR
                </Button>
              </div>
            </>
          )}

          {isPending && confirm && (
            <div className="stack-sm">
              <p className="muted">
                {confirm === "approve"
                  ? `Al aprobar se crea el gimnasio "${req.gym_name}" con la sede "${req.branch_name}" y ${req.applicant?.name} pasa a ser su administrador.`
                  : `La solicitud de "${req.gym_name}" quedará rechazada. El solicitante podrá volver a solicitar.`}
              </p>
              <div className="row-gap">
                <Button variant="ghost" disabled={Boolean(busy)} onClick={() => setConfirm(null)}>
                  Cancelar
                </Button>
                <Button
                  variant={confirm === "reject" ? "danger" : "primary"}
                  disabled={Boolean(busy)}
                  onClick={() => review(confirm)}
                >
                  {busy ? "PROCESANDO…" : confirm === "approve" ? "CONFIRMAR APROBACIÓN" : "CONFIRMAR RECHAZO"}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
