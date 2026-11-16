import { useEffect, useMemo, useState } from "react";
import { useApp } from "../state/AppContext.jsx";
import { apiErrorMessage, apiGetGyms } from "../utils/api.js";
import { searchGyms } from "../data/gyms.js";
import { Badge, Card, Field, Input, Screen } from "../components/UI.jsx";

/**
 * CAMBIAR GIMNASIO — con sesión, el catálogo y la membresía son REALES
 * (`GET /gyms` + `POST /me/gym-assignments`): el gimnasio ve a este atleta en
 * su panel. Sin sesión (modo local) se conserva el catálogo de ejemplo.
 */
export default function ChangeGym({ onBack }) {
  const { state, actions, gym: currentGym, branch: currentBranch } = useApp();
  const online = Boolean(state.auth.signedIn && state.auth.token);
  const [remote, setRemote] = useState(null); // null = cargando
  const [loadError, setLoadError] = useState("");
  const [query, setQuery] = useState("");
  const [gymId, setGymId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!online) return undefined;
    let alive = true;
    apiGetGyms()
      .then((d) => alive && setRemote(d.gyms ?? []))
      .catch((e) => {
        if (!alive) return;
        setRemote([]);
        setLoadError(apiErrorMessage(e, "No pudimos cargar los gimnasios."));
      });
    return () => {
      alive = false;
    };
  }, [online]);

  const list = useMemo(() => {
    const base = online ? (remote ?? []) : state.device.gyms;
    return searchGyms(base.map((g) => ({ city: "", country: "", address: "", ...g })), query);
  }, [online, remote, state.device.gyms, query]);
  const gym = list.find((g) => g.id === gymId);

  const choose = async (g, b) => {
    setError("");
    if (!online) {
      actions.selectGym(g.id, b.id);
      onBack();
      return;
    }
    setBusy(true);
    try {
      await actions.joinGym(g, b);
      onBack();
    } catch (e) {
      setError(apiErrorMessage(e, "No pudimos unirte a esa sede."));
    } finally {
      setBusy(false);
    }
  };

  const isCurrent = (g) => (online ? currentGym?.apiId === g.id : g.id === state.identity.user.gymId);

  if (gym) {
    return (
      <Screen title="SELECCIONA TU SEDE" subtitle={gym.name} onBack={() => setGymId(null)}>
        <div className="stack-sm">
          {error && (
            <p className="muted text-warning" role="alert">
              {error}
            </p>
          )}
          {gym.branches.map((b) => (
            <Card key={b.id} onClick={busy ? undefined : () => choose(gym, b)}>
              <div className="row-between">
                <div>
                  <strong>
                    {gym.name} — {b.name}
                  </strong>
                  {b.address && <p className="muted">{b.address}</p>}
                </div>
                {online && isCurrent(gym) && currentBranch?.apiId === b.id ? <Badge tone="accent">Actual</Badge> : <span className="chevron">›</span>}
              </div>
            </Card>
          ))}
          {gym.branches.length === 0 && <p className="muted">Este gimnasio aún no tiene sedes.</p>}
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
        {online && remote === null && <p className="muted center">Cargando gimnasios…</p>}
        {loadError && (
          <p className="muted text-warning" role="alert">
            {loadError}
          </p>
        )}
        {online && remote?.length === 0 && !loadError && <p className="muted center">Aún no hay gimnasios registrados en BIAFYT.</p>}
        <div className="stack-sm">
          {list.map((g) => (
            <Card key={g.id} onClick={() => setGymId(g.id)}>
              <div className="row-between">
                <div>
                  <strong>{g.name}</strong>
                  <p className="muted">
                    {g.city ? `${g.city} · ` : ""}
                    {g.branches.length} {g.branches.length === 1 ? "sede" : "sedes"}
                  </p>
                </div>
                {isCurrent(g) && <Badge tone="accent">Actual</Badge>}
              </div>
            </Card>
          ))}
        </div>
      </div>
    </Screen>
  );
}
