import { useCallback, useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { useApp } from "../state/AppContext.jsx";
import { Button, Card, Screen, Badge } from "../components/UI.jsx";
import {
  apiGetCoachRelationships,
  apiAcceptCoachRelationship,
  apiRevokeCoachRelationship,
  apiErrorMessage,
} from "../utils/api.js";
import { groupRelationships } from "../utils/relationships.js";
import { buildAthleteQr } from "../utils/coachQr.js";
import { formatDate } from "../utils/format.js";

/**
 * "CONÉCTATE CON UN COACH": muestra el QR + el ID del atleta para que un
 * coach los use al enviar la solicitud. El QR SOLO identifica (lleva el
 * `user.id`, nada más); NO acepta ni autoriza nada — el atleta sigue
 * teniendo que aceptar la solicitud abajo.
 */
function ConnectWithCoach({ userId }) {
  const [copied, setCopied] = useState(false);

  if (userId == null) return null;
  const id = String(userId);

  const copyId = async () => {
    try {
      await navigator.clipboard.writeText(id);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  return (
    <Card>
      <p className="micro">CONÉCTATE CON UN COACH</p>
      <p className="muted">
        Enséñale este código a un coach de tu gimnasio. Él te enviará una solicitud
        que verás aquí abajo para aceptar o rechazar.
      </p>
      <div style={{ display: "grid", placeItems: "center", gap: 12, margin: "14px 0" }}>
        <div style={{ background: "#fff", padding: 12, borderRadius: 12, lineHeight: 0 }}>
          <QRCodeSVG value={buildAthleteQr(userId)} size={168} marginSize={0} />
        </div>
        <div style={{ textAlign: "center" }}>
          <p className="micro">TU ID DE ATLETA</p>
          <strong style={{ fontSize: "1.6rem", letterSpacing: "0.05em" }}>{id}</strong>
        </div>
      </div>
      <Button variant="ghost" full onClick={copyId}>
        {copied ? "ID COPIADO ✓" : "COPIAR ID"}
      </Button>
    </Card>
  );
}

/**
 * MI COACH (slice D-CLIENT-COACH)
 *
 * Cierra el lado del atleta del lazo Cliente → Coach → Gym: el atleta ve
 * las solicitudes de coach entrantes y las acepta o rechaza, y ve de forma
 * pasiva el/los coach(es) que ya lo entrenan. Consume solo endpoints
 * existentes (`GET/POST/DELETE /me/coach-relationships`); no crea autoridad
 * nueva y no toca puntos/actividad/racha. El coach envía la solicitud desde
 * su propia app.
 */
export default function CoachRelationship({ onBack }) {
  const { state } = useApp();
  const token = state.auth.token;
  const athleteId = state.identity.user.id;

  const [relationships, setRelationships] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [actionError, setActionError] = useState("");

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setLoadError("");
    try {
      const data = await apiGetCoachRelationships(token);
      setRelationships(data.coach_relationships ?? []);
    } catch (e) {
      setLoadError(apiErrorMessage(e, "No pudimos cargar tus solicitudes de coach."));
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(() => {
      if (!cancelled) load();
    });
    return () => {
      cancelled = true;
    };
  }, [load]);

  const { activeCoaches, pendingReceived } = groupRelationships(relationships);

  // kind: "accept" → POST .../accept ; "reject" → DELETE (pending → revoked).
  const respond = async (id, kind) => {
    setBusyId(id);
    setActionError("");
    try {
      if (kind === "accept") await apiAcceptCoachRelationship(token, id);
      else await apiRevokeCoachRelationship(token, id);
      await load();
    } catch (e) {
      setActionError(apiErrorMessage(e, "No se pudo completar la acción."));
    } finally {
      setBusyId(null);
    }
  };

  const empty = !loading && !loadError && activeCoaches.length === 0 && pendingReceived.length === 0;

  return (
    <Screen title="MI COACH" onBack={onBack}>
      <div className="stack">
        <Card className="soft">
          <p className="muted">
            Un coach de tu gimnasio puede pedir acompañarte. Si aceptas, podrá ver tu
            actividad, tu racha y tus puntos para ayudarte a progresar. Puedes rechazar
            la solicitud o, más adelante, terminar la relación.
          </p>
        </Card>

        <ConnectWithCoach userId={athleteId} />

        {loadError && (
          <Card>
            <p className="text-warning">{loadError}</p>
          </Card>
        )}

        {activeCoaches.length > 0 && (
          <Card accent>
            <p className="micro dark">{activeCoaches.length === 1 ? "TU COACH" : "TUS COACHES"}</p>
            <div className="stack-sm">
              {activeCoaches.map((r) => (
                <div className="row-between" key={r.id}>
                  <strong>{r.coach?.name ?? "Coach"}</strong>
                  <Badge tone="success">Activo</Badge>
                </div>
              ))}
            </div>
          </Card>
        )}

        {pendingReceived.length > 0 && (
          <Card>
            <p className="micro">SOLICITUDES PENDIENTES</p>
            {actionError && <p className="micro text-warning">{actionError}</p>}
            <div className="stack-sm">
              {pendingReceived.map((r) => (
                <div key={r.id} className="stack-xs">
                  <div className="row-between">
                    <div>
                      <strong>{r.coach?.name ?? "Coach"}</strong>
                      {r.requested_at && <p className="micro muted">Solicitado el {formatDate(r.requested_at)}</p>}
                    </div>
                    <Badge tone="warning">Pendiente</Badge>
                  </div>
                  <div className="row-gap">
                    <Button variant="ghost" disabled={busyId === r.id} onClick={() => respond(r.id, "reject")}>
                      RECHAZAR
                    </Button>
                    <Button disabled={busyId === r.id} onClick={() => respond(r.id, "accept")}>
                      {busyId === r.id ? "…" : "ACEPTAR"}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {empty && (
          <Card>
            <p className="muted">No tienes coach asignado ni solicitudes pendientes.</p>
          </Card>
        )}

        {loading && (
          <Card>
            <p className="muted">Cargando…</p>
          </Card>
        )}
      </div>
    </Screen>
  );
}
