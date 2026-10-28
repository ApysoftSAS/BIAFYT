import { useCallback, useEffect, useState } from "react";
import { useApp } from "../state/AppContext.jsx";
import { Button, Card, Field, Input, Screen, Badge } from "../components/UI.jsx";
import { apiCreateGymRegistrationRequest, apiGetGymRegistrationRequests, apiErrorMessage } from "../utils/api.js";

/**
 * REGISTRAR MI GIMNASIO (onboarding B2B)
 *
 * El usuario solicita registrar un gimnasio. Un Admin BIAFYT aprueba o
 * rechaza. Al aprobar, el backend crea Gym + sede principal + el rol
 * `gym_admin` para el usuario; a partir de ahí administra su gimnasio desde
 * la app Gym Web (`gym.<dominio>`). Esta pantalla NO toca los flujos
 * existentes de Cliente/Coach (selección de gimnasio local, etc.).
 */

const GYM_WEB_URL = import.meta.env.VITE_GYM_WEB_URL || "";

const STATUS_LABEL = {
  pending: { text: "En revisión", tone: "warning" },
  approved: { text: "Aprobada", tone: "success" },
  rejected: { text: "Rechazada", tone: "error" },
};

export default function RegisterMyGym({ onBack }) {
  const { state } = useApp();
  const token = state.auth.token;

  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [form, setForm] = useState({ gymName: "", branchName: "", applicantMessage: "" });
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");

  const update = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setLoadError("");
    try {
      const data = await apiGetGymRegistrationRequests(token);
      setRequests(data.gym_registration_requests ?? []);
    } catch (e) {
      setLoadError(apiErrorMessage(e, "No pudimos cargar tus solicitudes."));
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

  const pending = requests.find((r) => r.status === "pending") ?? null;
  const approved = requests.find((r) => r.status === "approved") ?? null;

  const submit = async () => {
    setFormError("");
    if (form.gymName.trim().length < 2) return setFormError("Escribe el nombre del gimnasio.");
    if (form.branchName.trim().length < 2) return setFormError("Escribe el nombre de la sede principal.");
    setBusy(true);
    try {
      await apiCreateGymRegistrationRequest(token, {
        gymName: form.gymName.trim(),
        branchName: form.branchName.trim(),
        applicantMessage: form.applicantMessage.trim(),
      });
      setForm({ gymName: "", branchName: "", applicantMessage: "" });
      await load();
    } catch (e) {
      setFormError(apiErrorMessage(e, "No se pudo enviar la solicitud."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen title="REGISTRAR MI GIMNASIO" onBack={onBack}>
      <div className="stack">
        <Card className="soft">
          <p className="muted">
            Si eres dueño o administrador de un gimnasio, solicita registrarlo en BIAFYT.
            El equipo revisa la solicitud y, al aprobarla, podrás administrar tu gimnasio,
            sus coaches y sus miembros desde el panel de gimnasio.
          </p>
        </Card>

        {loadError && (
          <Card>
            <p className="text-warning">{loadError}</p>
          </Card>
        )}

        {approved && (
          <Card accent>
            <p className="micro dark">TU GIMNASIO</p>
            <strong>{approved.gym?.name ?? approved.gym_name}</strong>
            <p className="micro dark">Solicitud aprobada. Administra tu gimnasio desde el panel de gimnasio (Gym Web).</p>
            {GYM_WEB_URL && (
              <Button variant="ghost" full onClick={() => window.open(GYM_WEB_URL, "_blank", "noopener")}>
                ABRIR PANEL DE GIMNASIO
              </Button>
            )}
          </Card>
        )}

        {pending && (
          <Card>
            <div className="row-between">
              <div>
                <p className="micro">SOLICITUD EN CURSO</p>
                <strong>{pending.gym_name}</strong>
                <p className="muted">Sede principal: {pending.branch_name}</p>
              </div>
              <Badge tone={STATUS_LABEL.pending.tone}>{STATUS_LABEL.pending.text}</Badge>
            </div>
          </Card>
        )}

        {!pending && !approved && !loading && (
          <Card>
            <p className="micro">NUEVA SOLICITUD</p>
            <Field label="Nombre del gimnasio">
              <Input value={form.gymName} onChange={update("gymName")} placeholder="p. ej. KAIROS GYM" />
            </Field>
            <Field label="Sede principal">
              <Input value={form.branchName} onChange={update("branchName")} placeholder="p. ej. Norte" />
            </Field>
            <Field label="Mensaje para el equipo (opcional)" hint="Contexto que ayude a revisar tu solicitud.">
              <textarea
                className="input"
                rows={3}
                style={{ resize: "vertical", minHeight: 72, fontFamily: "inherit" }}
                value={form.applicantMessage}
                onChange={update("applicantMessage")}
                maxLength={2000}
              />
            </Field>
            {formError && <p className="text-warning">{formError}</p>}
            <Button full disabled={busy} onClick={submit}>
              {busy ? "ENVIANDO…" : "ENVIAR SOLICITUD"}
            </Button>
          </Card>
        )}

        {requests.filter((r) => r.status === "rejected").length > 0 && (
          <Card>
            <p className="micro">SOLICITUDES ANTERIORES</p>
            <div className="stack-sm">
              {requests
                .filter((r) => r.status === "rejected")
                .map((r) => (
                  <div key={r.id}>
                    <div className="row-between">
                      <span>{r.gym_name}</span>
                      <Badge tone={STATUS_LABEL.rejected.tone}>{STATUS_LABEL.rejected.text}</Badge>
                    </div>
                    {r.review_note && <p className="micro muted">{r.review_note}</p>}
                  </div>
                ))}
            </div>
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
