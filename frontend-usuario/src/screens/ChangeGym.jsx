import { useMemo, useState } from "react";
import { useApp } from "../state/AppContext.jsx";
import { searchGyms } from "../data/gyms.js";
import { Badge, Card, Field, Input, Screen } from "../components/UI.jsx";

export default function ChangeGym({ onBack }) {
  const { state, actions } = useApp();
  const [query, setQuery] = useState("");
  const [gymId, setGymId] = useState(null);
  const results = useMemo(() => searchGyms(state.device.gyms, query), [state.device.gyms, query]);
  const gym = state.device.gyms.find((g) => g.id === gymId);

  if (gym) {
    return (
      <Screen title="SELECCIONA TU SEDE" subtitle={gym.name} onBack={() => setGymId(null)}>
        <div className="stack-sm">
          {gym.branches.map((b) => (
            <Card
              key={b.id}
              onClick={() => {
                actions.selectGym(gym.id, b.id);
                onBack();
              }}
            >
              <div className="row-between">
                <div>
                  <strong>
                    {gym.name} — {b.name}
                  </strong>
                  <p className="muted">{b.address}</p>
                </div>
                <span className="chevron">›</span>
              </div>
            </Card>
          ))}
        </div>
      </Screen>
    );
  }

  return (
    <Screen title="CAMBIAR GIMNASIO" onBack={onBack}>
      <div className="stack">
        <Field label="Buscar">
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Nombre, ciudad o dirección" />
        </Field>
        <div className="stack-sm">
          {results.map((g) => (
            <Card key={g.id} onClick={() => setGymId(g.id)}>
              <div className="row-between">
                <div>
                  <strong>{g.name}</strong>
                  <p className="muted">
                    {g.city} · {g.branches.length} {g.branches.length === 1 ? "sede" : "sedes"}
                  </p>
                </div>
                {g.id === state.identity.user.gymId && <Badge tone="accent">Actual</Badge>}
              </div>
            </Card>
          ))}
        </div>
      </div>
    </Screen>
  );
}
