import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "../state/SessionContext.jsx";
import { Card, Panel, Stat, Button } from "../components/UI.jsx";
import { apiErrorMessage } from "../utils/api.js";

/**
 * RESUMEN (Gym Web) — cifras reales del gym administrado (slice D-GYM).
 *
 * Deliberadamente simple: sedes, miembros activos y coaches activos,
 * derivados de las APIs del slice. Sin actividad agregada de la
 * organización — eso es fase posterior.
 */
export default function Overview({ onNavigate }) {
  const { gymAccess, actions } = useSession();
  const activeGym = useMemo(
    () => gymAccess.gyms.find((g) => g.id === gymAccess.activeGymId) ?? null,
    [gymAccess.gyms, gymAccess.activeGymId]
  );

  const [counts, setCounts] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [m, c, b] = await Promise.all([actions.getMembers(), actions.getCoaches(), actions.getBranches()]);
      setCounts({
        members: (m.members ?? []).length,
        coaches: (c.coaches ?? []).length,
        branches: (b ?? []).length,
      });
    } catch (e) {
      setError(apiErrorMessage(e, "No pudimos cargar el resumen."));
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

  const tiles = [
    ["Sedes", counts?.branches],
    ["Miembros", counts?.members],
    ["Coaches", counts?.coaches],
  ];

  return (
    <div>
      <div className="gym-main-head">
        <h2>{activeGym?.name ?? "Organización"}</h2>
        <p>Resumen de tu organización.</p>
      </div>

      <div className="stack">
        {error && <p className="text-warning">{error}</p>}

        <div className="gym-grid">
          {tiles.map(([label, value]) => (
            <Card key={label}>
              <Stat label={label} value={loading || value === undefined ? "…" : value} />
            </Card>
          ))}
        </div>

        <Panel title="Gestión" action={<Button variant="ghost" onClick={() => onNavigate("workspace")}>ABRIR ESPACIO</Button>}>
          <p className="muted">
            Añade o revoca miembros y coaches, y consulta el estado de un miembro,
            desde <strong>Espacio</strong>.
          </p>
        </Panel>
      </div>
    </div>
  );
}
