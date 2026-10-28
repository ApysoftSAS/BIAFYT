import { useMemo, useState } from "react";
import { useApp } from "../state/AppContext.jsx";
import MachineArt from "../components/MachineArt.jsx";
import { Badge, Card, Field, Input, Screen } from "../components/UI.jsx";
import Coach from "../components/Coach.jsx";

const TODAY_KEY = new Date().toISOString().slice(0, 10);

export default function Machines() {
  // `machineCatalog` viene del backend (`GET /equipment`); `data/machines.js`
  // solo es el fallback offline. Ver `state/AppContext.jsx` /
  // `data/equipmentCatalog.js`.
  const { actions, machineCatalog } = useApp();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(null);

  // Alimenta el reto diario de consultar máquinas.
  const openMachine = (m) => {
    setSelected(m);
    actions.bumpChallenge(TODAY_KEY, "machinesViewed", 1);
  };

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return machineCatalog;
    return machineCatalog.filter((m) =>
      `${m.name} ${m.primary} ${(m.secondary ?? []).join(" ")} ${m.movement}`.toLowerCase().includes(q)
    );
  }, [query, machineCatalog]);

  // ---------------- FICHA (punto 69) ----------------
  if (selected) {
    const m = selected;
    return (
      <Screen title={m.name} onBack={() => setSelected(null)}>
        <div className="stack">
          <div className="machine-hero">
            <MachineArt art={m.art} />
          </div>

          <Card>
            <p className="micro">¿PARA QUÉ SIRVE?</p>
            <p>{m.purpose}</p>
          </Card>

          <Card>
            <p className="micro">MÚSCULO PRINCIPAL</p>
            <h3>{m.primary}</h3>
            <p className="micro">MÚSCULOS SECUNDARIOS</p>
            <div className="chips">
              {m.secondary.map((s) => (
                <span className="chip" key={s}>
                  {s}
                </span>
              ))}
            </div>
            <div className="row-between">
              <Badge>{m.movement}</Badge>
              <Badge tone="accent">{m.level}</Badge>
            </div>
          </Card>

          <Card>
            <p className="micro">CONSEJOS</p>
            <ul className="list">
              {m.tips.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </Card>

          <Card>
            <p className="micro">ERRORES FRECUENTES</p>
            <ul className="list list-warning">
              {m.mistakes.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </Card>

          <Card>
            <p className="micro">EJERCICIOS RELACIONADOS</p>
            <div className="chips">
              {m.related.map((r) => (
                <span className="chip" key={r}>
                  {r}
                </span>
              ))}
            </div>
          </Card>
        </div>
        <Coach state="explicacion" message="Ajusta la máquina antes de cargar peso." />
      </Screen>
    );
  }

  // ---------------- LISTA (punto 68) ----------------
  return (
    <div className="screen">
      <header className="screen-head">
        <div className="screen-title">
          <h1>MÁQUINAS</h1>
          <p>Cómo se usa cada una y para qué sirve.</p>
        </div>
      </header>
      <div className="screen-body">
        <Field label="Buscar máquina o músculo">
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Pecho, dorsal, prensa…" />
        </Field>
        <div className="machine-grid">
          {list.map((m) => (
            <button className="machine-card" key={m.id} onClick={() => openMachine(m)}>
              <MachineArt art={m.art} />
              <div className="machine-card-text">
                <strong>{m.name}</strong>
                <span className="micro">{m.primary}</span>
              </div>
            </button>
          ))}
        </div>
        {list.length === 0 && <p className="muted center">Sin resultados.</p>}
      </div>
      <Coach state="explicacion" message="¿No sabes usar una máquina? Búscala aquí." />
    </div>
  );
}
