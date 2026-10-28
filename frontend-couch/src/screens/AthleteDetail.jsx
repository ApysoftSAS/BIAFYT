import { useCallback, useEffect, useState } from "react";
import { useCoach } from "../state/CoachContext.jsx";
import { Button, Card, Screen, Stat } from "../components/UI.jsx";
import { apiErrorMessage } from "../utils/api.js";
import { formatDate } from "../utils/format.js";
import { profileRows, formatDuration } from "../utils/athlete.js";

/**
 * DETALLE DE ATLETA (Couch)
 * Solo accesible con una relación coach↔atleta ACTIVA (el backend
 * responde 404 si deja de estarlo). Muestra información de calidad
 * "sombra" del atleta y permite dejar notas de feedback — la única
 * acción del Coach MVP. El atleta no recibe las notas todavía.
 */
export default function AthleteDetail({ athlete, onBack, onOpenRoutine }) {
  const { actions } = useCoach();
  const [detail, setDetail] = useState(null);
  const [notes, setNotes] = useState([]);
  const [programs, setPrograms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [noteError, setNoteError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [d, n, p] = await Promise.all([
        actions.getAthleteDetail(athlete.id),
        actions.getAthleteNotes(athlete.id),
        actions.getAthletePrograms(athlete.id),
      ]);
      setDetail(d);
      setNotes(n.notes ?? []);
      setPrograms(p.programs ?? []);
    } catch (e) {
      setError(apiErrorMessage(e, "No pudimos cargar la información del atleta."));
    } finally {
      setLoading(false);
    }
  }, [actions, athlete.id]);

  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(() => {
      if (!cancelled) load();
    });
    return () => {
      cancelled = true;
    };
  }, [load]);

  const saveNote = async () => {
    const body = draft.trim();
    if (!body) {
      setNoteError("Escribe una nota antes de guardar.");
      return;
    }
    setBusy(true);
    setNoteError("");
    try {
      const { note } = await actions.createAthleteNote(athlete.id, body);
      setNotes((prev) => [note, ...prev]);
      setDraft("");
    } catch (e) {
      setNoteError(apiErrorMessage(e, "No se pudo guardar la nota."));
    } finally {
      setBusy(false);
    }
  };

  const removeNote = async (id) => {
    setNoteError("");
    try {
      await actions.deleteAthleteNote(id);
      setNotes((prev) => prev.filter((x) => x.id !== id));
    } catch (e) {
      setNoteError(apiErrorMessage(e, "No se pudo borrar la nota."));
    }
  };

  const removeProgram = async (id) => {
    setError("");
    try {
      await actions.deleteAthleteProgram(athlete.id, id);
      setPrograms((prev) => prev.filter((x) => x.id !== id));
    } catch (e) {
      setError(apiErrorMessage(e, "No se pudo borrar la rutina."));
    }
  };

  const rows = profileRows(detail?.profile);
  const summary = detail?.activity_summary;

  return (
    <Screen title={athlete.name} subtitle="Atleta" onBack={onBack}>
      <div className="stack">
        {loading && (
          <Card>
            <p className="muted">Cargando…</p>
          </Card>
        )}
        {error && !loading && (
          <Card>
            <p className="text-warning">{error}</p>
          </Card>
        )}

        {detail && !loading && (
          <>
            <Card accent>
              <div className="row-between">
                <Stat label="RACHA ACTUAL" value={detail.streak.current_streak} />
                <Stat label="MEJOR RACHA" value={detail.streak.longest_streak} />
                <Stat label="PUNTOS" value={detail.points.balance} />
              </div>
            </Card>

            <Card>
              <p className="micro">PERFIL</p>
              {rows.length === 0 ? (
                <p className="muted">El atleta aún no completó su perfil.</p>
              ) : (
                <div className="stack-sm">
                  {rows.map((r) => (
                    <div className="row-between" key={r.label}>
                      <span className="muted">{r.label}</span>
                      <span>{r.value}</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card>
              <p className="micro">ACTIVIDAD RECIENTE</p>
              {summary.count === 0 ? (
                <p className="muted">Sin actividad registrada todavía.</p>
              ) : (
                <>
                  <div className="row-between">
                    <span className="muted">Sesiones</span>
                    <span>{summary.count}</span>
                  </div>
                  <div className="row-between">
                    <span className="muted">Series / ejercicios</span>
                    <span>
                      {summary.total_sets} / {summary.total_exercises}
                    </span>
                  </div>
                  <div className="row-between">
                    <span className="muted">Tiempo total</span>
                    <span>{formatDuration(summary.total_duration_seconds)}</span>
                  </div>
                  <div className="stack-sm" style={{ marginTop: 12 }}>
                    {summary.recent.map((a) => (
                      <div className="row-between" key={a.id}>
                        <span>{a.routine_label || "Sesión"}</span>
                        <span className="micro">
                          {formatDate(a.finished_at)} · {formatDuration(a.duration_seconds)} · +{a.points_awarded}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </Card>

            <Card>
              <div className="row-between">
                <p className="micro">RUTINAS ({programs.length})</p>
                <button className="link-button" onClick={() => onOpenRoutine(null)}>
                  ＋ Nueva
                </button>
              </div>
              <p className="muted">
                Rutinas que tú creas para {athlete.name}. Las verá en su app junto a las suyas.
              </p>
              {programs.length === 0 ? (
                <p className="muted">Aún no le has creado ninguna rutina.</p>
              ) : (
                <div className="stack-sm" style={{ marginTop: 8 }}>
                  {programs.map((p) => (
                    <div className="row-between" key={p.id}>
                      <div>
                        <strong>{p.name}</strong>
                        <p className="micro muted">
                          {p.days.length} día(s)
                          {p.reference_gym ? ` · ref: ${p.reference_gym.name}` : ""}
                        </p>
                      </div>
                      <div className="row-gap">
                        <button className="link-button" onClick={() => onOpenRoutine(p)}>
                          Editar
                        </button>
                        <button className="link-button danger" onClick={() => removeProgram(p.id)}>
                          Borrar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card>
              <p className="micro">NOTAS PARA EL ATLETA</p>
              <p className="muted">Solo tú ves estas notas. El atleta no las recibe todavía.</p>
              <textarea
                className="input"
                rows={4}
                style={{ resize: "vertical", minHeight: 96, fontFamily: "inherit" }}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Feedback, ajustes, objetivos…"
                maxLength={2000}
              />
              {noteError && <p className="text-warning">{noteError}</p>}
              <Button full disabled={busy} onClick={saveNote}>
                {busy ? "GUARDANDO…" : "GUARDAR NOTA"}
              </Button>

              {notes.length > 0 && (
                <div className="stack-sm" style={{ marginTop: 12 }}>
                  {notes.map((n) => (
                    <div key={n.id}>
                      <p style={{ whiteSpace: "pre-wrap" }}>{n.body}</p>
                      <div className="row-between">
                        <span className="micro">{formatDate(n.created_at)}</span>
                        <button className="link-button" onClick={() => removeNote(n.id)}>
                          Borrar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card className="soft">
              <p className="micro">NOTA</p>
              <p className="muted">
                La actividad, la racha y los puntos vienen de lo que la app del atleta pudo
                sincronizar (best-effort). Pueden faltar sesiones registradas sin conexión.
              </p>
            </Card>
          </>
        )}
      </div>
    </Screen>
  );
}
