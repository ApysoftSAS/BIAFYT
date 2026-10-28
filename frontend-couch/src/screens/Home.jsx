import { useMemo } from "react";
import { useCoach } from "../state/CoachContext.jsx";
import { Button, Card } from "../components/UI.jsx";
import { Wordmark } from "../components/Brand.jsx";
import { groupRelationships } from "../utils/relationships.js";

export default function Home({ onNavigate }) {
  const { auth, relationships, relationshipsLoading, relationshipsError } = useCoach();
  const g = useMemo(() => groupRelationships(relationships), [relationships]);

  return (
    <div className="screen home">
      <header className="home-head">
        <div>
          <Wordmark />
          <h1>Hola, {auth.user.name.split(" ")[0] || "coach"}</h1>
          <p className="muted">Panel de coach</p>
        </div>
      </header>

      <div className="screen-body">
        {relationshipsError && (
          <Card>
            <p className="text-warning">{relationshipsError}</p>
          </Card>
        )}

        <Card accent>
          <div className="row-between">
            <div>
              <p className="micro dark">ATLETAS ACTIVOS</p>
              <h2 className="big-number dark">{g.activeAthletes.length}</h2>
            </div>
            <div>
              <p className="micro dark">SOLICITUDES ENVIADAS</p>
              <h2 className="big-number dark">{g.pendingSent.length}</h2>
            </div>
          </div>
        </Card>

        {g.pendingReceived.length > 0 && (
          <Card onClick={() => onNavigate("athletes")}>
            <div className="row-between">
              <div>
                <p className="micro">SOLICITUDES RECIBIDAS</p>
                <strong>{g.pendingReceived.length} coach(es) quieren entrenarte</strong>
                <p className="muted">Acéptalas o recházalas desde Atletas.</p>
              </div>
              <span className="chevron">›</span>
            </div>
          </Card>
        )}

        <Card>
          <p className="micro">TUS ATLETAS</p>
          {relationshipsLoading && g.activeAthletes.length === 0 ? (
            <p className="muted">Cargando…</p>
          ) : g.activeAthletes.length === 0 ? (
            <p className="muted">Todavía no tienes atletas activos. Envía una solicitud desde Atletas.</p>
          ) : (
            <div className="stack-xs">
              {g.activeAthletes.slice(0, 5).map((r) => (
                <div className="row-between" key={r.id}>
                  <span>{r.athlete.name}</span>
                  <span className="micro">activo</span>
                </div>
              ))}
            </div>
          )}
          <Button variant="ghost" full onClick={() => onNavigate("athletes")}>
            GESTIONAR ATLETAS
          </Button>
        </Card>

        <Card className="soft">
          <p className="micro">NOTA</p>
          <p className="muted">
            El backend solo expone hoy la relación de consentimiento coach↔atleta. Ver el entrenamiento, los
            programas y el progreso de cada atleta llegará cuando existan esos endpoints.
          </p>
        </Card>
      </div>
    </div>
  );
}
