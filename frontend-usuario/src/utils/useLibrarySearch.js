import { useEffect, useMemo, useState } from "react";
import { filterLibrary, loadExerciseLibrary } from "./exerciseLibrary.js";

const PAGE = 40;

/**
 * Estado de búsqueda de la biblioteca (carga diferida + filtros + paginación),
 * compartido por la pantalla Biblioteca y el selector de MyRoutines.
 * `enabled=false` no carga el chunk de 0,9 MB hasta que haga falta.
 */
export function useLibrarySearch(enabled = true) {
  const [list, setList] = useState(null); // null = cargando
  const [error, setError] = useState(false);
  const [query, setQueryRaw] = useState("");
  const [category, setCategoryRaw] = useState("all");
  const [equipment, setEquipmentRaw] = useState("all");
  const [shown, setShown] = useState(PAGE);

  useEffect(() => {
    if (!enabled) return undefined;
    let alive = true;
    loadExerciseLibrary()
      .then((l) => alive && setList(l))
      .catch(() => alive && setError(true));
    return () => {
      alive = false;
    };
  }, [enabled]);

  const results = useMemo(() => (list ? filterLibrary(list, { query, category, equipment }) : []), [list, query, category, equipment]);

  // Cualquier cambio de filtro vuelve a la primera página.
  const withReset = (set) => (v) => {
    set(v);
    setShown(PAGE);
  };

  return {
    list,
    error,
    results,
    visible: results.slice(0, shown),
    remaining: Math.max(0, results.length - shown),
    query,
    category,
    equipment,
    setQuery: withReset(setQueryRaw),
    setCategory: withReset(setCategoryRaw),
    setEquipment: withReset(setEquipmentRaw),
    showMore: () => setShown((n) => n + PAGE),
  };
}
