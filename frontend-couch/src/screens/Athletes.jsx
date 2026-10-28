import { useMemo, useState } from "react";
import { useCoach } from "../state/CoachContext.jsx";
import { Button, Card, Field, Input, Screen, EmptyState, Modal } from "../components/UI.jsx";
import ScanQr from "../components/ScanQr.jsx";
import { apiErrorMessage } from "../utils/api.js";
import { formatDate } from "../utils/format.js";
import { groupRelationships } from "../utils/relationships.js";

/**
 * ATLETAS (Couch)
 * Gestión de la relación de consentimiento coach↔atleta contra el
 * backend real: solicitar un atleta (escaneando su QR o por su ID),
 * aceptar solicitudes recibidas, y cancelar/revocar relaciones.
 */
export default function Athletes({ onOpenAthlete }) {
  const { relationships, relationshipsLoading, actions } = useCoach();
  const g = useMemo(() => groupRelationships(relationships), [relationships]);
  // El backend también devuelve relaciones `revoked`; `g` ya las excluye,
  // así que el vacío se mide sobre los grupos vivos, no sobre `relationships`.
  const nothingLive =
    g.activeAthletes.length === 0 &&
    g.pendingSent.length === 0 &&
    g.pendingReceived.length === 0 &&
    g.activeCoaches.length === 0;

  const [athleteId, setAthleteId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busyId, setBusyId] = useState(null); // id de la relación en curso, o "request" / "confirm"
  const [scanOpen, setScanOpen] = useState(false);
  const [confirmId, setConfirmId] = useState(null); // athlete_user_id escaneado, pendiente de confirmar

  const run = async (key, fn, okMsg) => {
    setError("");
    setNotice("");
    setBusyId(key);
    try {
      await fn();
      if (okMsg) setNotice(okMsg);
      return true;
    } catch (e) {
      setError(apiErrorMessage(e, "No se pudo completar la acción."));
      return false;
    } finally {
      setBusyId(null);
    }
  };

  // Único camino de envío para el flujo manual y el de QR. El consentimiento
  // no cambia: crea la solicitud `pending` y el atleta debe aceptarla.
  const sendRequest = async (id, key) => {
    setError("");
    setNotice("");
    setBusyId(key);
    try {
      const rel = await actions.requestAthlete(id);
      setNotice(rel?.athlete?.name ? `Solicitud enviada a ${rel.athlete.name}.` : "Solicitud enviada.");
      setConfirmId(null);
      if (key === "request") setAthleteId("");
      return true;
    } catch (e) {
      setError(apiErrorMessage(e, "No se pudo completar la acción."));
      setConfirmId(null);
      return false;
    } finally {
      setBusyId(null);
    }
  };

  const submitRequest = () => {
    const id = Number(athleteId.trim());
    if (!Number.isInteger(id) || id <= 0) {
      setError("Escribe un ID de atleta válido (número).");
      return;
    }
    sendRequest(id, "request");
  };

  return (
    <Screen title="ATLETAS">
      <div className="stack">
        {/* AGREGAR ATLETA */}
        <Card>
          <p className="micro">AGREGAR ATLETA</p>
          <p className="muted">
            El atleta recibe la solicitud y debe aceptarla. Necesitas un rol de coach activo en algún gimnasio.
          </p>
          <Button full onClick={() => { setError(""); setNotice(""); setScanOpen(true); }}>
            ESCANEAR QR
          </Button>
          <Field label="…o introducir ID de atleta" hint="El atleta ve su ID y su QR en su app, en Perfil → Mi coach.">
            <Input
              type="number"
              min="1"
              value={athleteId}
              onChange={(e) => setAthleteId(e.target.value)}
              placeholder="p. ej. 42"
            />
          </Field>
          <Button variant="ghost" full disabled={busyId === "request"} onClick={submitRequest}>
            {busyId === "request" ? "ENVIANDO…" : "ENVIAR SOLICITUD POR ID"}
          </Button>
        </Card>

        <Modal open={scanOpen} title="Escanear QR del atleta" onClose={() => setScanOpen(false)}>
          <ScanQr
            onDetected={(id) => { setScanOpen(false); setConfirmId(id); }}
            onCancel={() => setScanOpen(false)}
          />
        </Modal>

        <Modal
          open={confirmId != null}
          title="Confirmar solicitud"
          onClose={() => (busyId === "confirm" ? null : setConfirmId(null))}
        >
          <div className="stack">
            <p>
              Vas a enviar una solicitud de coach al atleta con <strong>ID {confirmId}</strong>.
              El atleta deberá aceptarla desde su app para que la relación quede activa.
            </p>
            <div className="row-gap">
              <Button variant="ghost" disabled={busyId === "confirm"} onClick={() => setConfirmId(null)}>
                Cancelar
              </Button>
              <Button disabled={busyId === "confirm"} onClick={() => sendRequest(confirmId, "confirm")}>
                {busyId === "confirm" ? "ENVIANDO…" : "ENVIAR SOLICITUD"}
              </Button>
            </div>
          </div>
        </Modal>

        {error && (
          <Card>
            <p className="text-warning">{error}</p>
          </Card>
        )}
        {notice && (
          <Card>
            <p className="text-success">{notice}</p>
          </Card>
        )}

        {/* SOLICITUDES RECIBIDAS */}
        {g.pendingReceived.length > 0 && (
          <Card>
            <p className="micro">SOLICITUDES RECIBIDAS</p>
            <div className="stack-sm">
              {g.pendingReceived.map((r) => (
                <div className="row-between" key={r.id}>
                  <span>{r.coach.name} quiere entrenarte</span>
                  <div className="row-gap">
                    <Button variant="ghost" disabled={busyId === r.id} onClick={() => run(r.id, () => actions.revokeRelationship(r.id))}>
                      Rechazar
                    </Button>
                    <Button disabled={busyId === r.id} onClick={() => run(r.id, () => actions.acceptRelationship(r.id))}>
                      Aceptar
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* MIS ATLETAS ACTIVOS */}
        <Card>
          <p className="micro">MIS ATLETAS ({g.activeAthletes.length})</p>
          {relationshipsLoading && g.activeAthletes.length === 0 ? (
            <p className="muted">Cargando…</p>
          ) : g.activeAthletes.length === 0 ? (
            <p className="muted">Sin atletas activos todavía.</p>
          ) : (
            <p className="muted">Toca un atleta para ver su información y dejarle notas.</p>
          )}
        </Card>
        {g.activeAthletes.map((r) => (
          <Card key={r.id} onClick={() => onOpenAthlete(r.athlete)}>
            <div className="row-between">
              <div>
                <strong>{r.athlete.name}</strong>
                <p className="muted">
                  {r.activated_at ? `activo desde ${formatDate(r.activated_at)}` : "activo"}
                </p>
              </div>
              <span className="chevron">›</span>
            </div>
          </Card>
        ))}

        {/* SOLICITUDES ENVIADAS (pendientes) */}
        {g.pendingSent.length > 0 && (
          <Card>
            <p className="micro">SOLICITUDES ENVIADAS</p>
            <div className="stack-sm">
              {g.pendingSent.map((r) => (
                <div className="row-between" key={r.id}>
                  <span>{r.athlete.name}</span>
                  <Button variant="ghost" disabled={busyId === r.id} onClick={() => run(r.id, () => actions.revokeRelationship(r.id))}>
                    Cancelar
                  </Button>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* MIS COACHES (si otro coach te entrena a ti) */}
        {g.activeCoaches.length > 0 && (
          <Card>
            <p className="micro">MIS COACHES</p>
            <div className="stack-sm">
              {g.activeCoaches.map((r) => (
                <div className="row-between" key={r.id}>
                  <span>{r.coach.name}</span>
                  <Button variant="ghost" disabled={busyId === r.id} onClick={() => run(r.id, () => actions.revokeRelationship(r.id))}>
                    Terminar
                  </Button>
                </div>
              ))}
            </div>
          </Card>
        )}

        {nothingLive && !relationshipsLoading && (
          <EmptyState icon="≡" title="Sin relaciones" text="Envía una solicitud para empezar a entrenar a un atleta." />
        )}
      </div>
    </Screen>
  );
}
