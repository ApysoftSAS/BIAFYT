import { Card, EmptyState, Field, Input, Tabs } from "./UI.jsx";
import { CATEGORY_ES, EQUIPMENT_ES, displayName, equipmentLabel, mediaUrls, muscleLabel } from "../utils/exerciseLibrary.js";

const CATEGORY_TABS = [{ id: "all", label: "Todos" }, ...Object.entries(CATEGORY_ES).map(([id, label]) => ({ id, label }))];
const EQUIPMENT_OPTIONS = Object.entries(EQUIPMENT_ES).sort((a, b) => a[1].localeCompare(b[1], "es"));

/**
 * Buscador + filtros + lista paginada de la biblioteca. Lo comparten la pantalla
 * Biblioteca (abre la ficha) y el selector de MyRoutines (añade a la rutina).
 * `search` es el resultado de `useLibrarySearch`.
 */
export default function LibraryBrowser({ search, onSelect }) {
  const { list, error, results, visible, remaining, query, category, equipment } = search;
  return (
    <div className="stack">
      <Field label="Buscar ejercicio, músculo o equipo">
        <Input value={query} onChange={(e) => search.setQuery(e.target.value)} placeholder="Pecho, mancuernas, sentadilla…" />
      </Field>
      <Tabs items={CATEGORY_TABS} value={category} onChange={search.setCategory} />
      <Field label="Equipo">
        <select className="input" value={equipment} onChange={(e) => search.setEquipment(e.target.value)}>
          <option value="all">Todo el equipo</option>
          {EQUIPMENT_OPTIONS.map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
      </Field>

      {error && <EmptyState title="No se pudo cargar la biblioteca" text="Cierra y vuelve a abrir esta pantalla para reintentar." />}
      {!error && !list && <p className="muted center">Cargando biblioteca…</p>}
      {list && results.length === 0 && <EmptyState title="Sin resultados" text="Prueba con otra palabra o quita algún filtro." />}

      {list && results.length > 0 && (
        <>
          <p className="micro">{results.length} EJERCICIOS</p>
          {visible.map((e) => (
            <Card key={e.id} onClick={() => onSelect(e)}>
              <div className="row-left">
                <img className="lib-thumb" src={mediaUrls(e).image} alt="" width={64} height={64} loading="lazy" />
                <div>
                  <strong>{displayName(e.n)}</strong>
                  <p className="muted">
                    {muscleLabel(e.t)} · {equipmentLabel(e.q)}
                  </p>
                </div>
              </div>
            </Card>
          ))}
          {remaining > 0 && (
            <button type="button" className="btn btn-ghost btn-full" onClick={search.showMore}>
              VER MÁS ({remaining})
            </button>
          )}
        </>
      )}
    </div>
  );
}
