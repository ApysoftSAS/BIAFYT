import { useCallback, useEffect, useMemo, useState } from "react";
import { useCoach } from "../state/CoachContext.jsx";
import { Badge, Button, Card, Field, Input, Modal, Screen } from "../components/UI.jsx";
import { apiErrorMessage } from "../utils/api.js";

/**
 * EDITOR DE RUTINA DEL COACH (slice D-COACH-PROGRAMS)
 *
 * El coach construye/mejora una rutina PARA el atleta. Reglas:
 *  - Los ejercicios salen del catálogo GLOBAL de BIAFYT (siempre
 *    disponible, con o sin gym).
 *  - El "gimnasio de referencia" es OPCIONAL y solo puede ser un gym del
 *    propio coach; el atleta no necesita pertenecer a él.
 *  - Con gym de referencia, el editor marca qué ejercicios usan equipo no
 *    disponible allí; el backend rechaza el guardado si se deja alguno
 *    (validación real, no solo aviso).
 */

let keySeq = 0;
const nextKey = () => `k-${++keySeq}`;

function dayFromProgram(day) {
  return {
    key: nextKey(),
    name: day.name,
    exercises: day.exercises.map((e) => ({ key: nextKey(), exerciseId: e.exercise.id })),
  };
}

const emptyDay = () => ({ key: nextKey(), name: "Día 1", exercises: [] });

export default function RoutineBuilder({ athlete, program, onBack, onSaved }) {
  const { actions } = useCoach();
  const editing = Boolean(program);

  const [name, setName] = useState(program?.name ?? "");
  const [referenceGymId, setReferenceGymId] = useState(
    program?.reference_gym ? String(program.reference_gym.id) : ""
  );
  const [days, setDays] = useState(() =>
    program?.days?.length ? program.days.map(dayFromProgram) : [emptyDay()]
  );

  const [catalog, setCatalog] = useState([]);
  const [coachGyms, setCoachGyms] = useState([]);
  const [availableSlugs, setAvailableSlugs] = useState(null); // Set | null (sin gym de referencia)
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [picker, setPicker] = useState(null); // { dayKey } | null
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [cat, gyms] = await Promise.all([actions.getExerciseCatalog(), actions.getCoachGyms()]);
        if (cancelled) return;
        setCatalog(cat.exercises ?? []);
        // Dedup por gym: un coach puede tener varias asignaciones en el mismo gym.
        const seen = new Set();
        const list = [];
        for (const a of gyms.gym_assignments ?? []) {
          if (!seen.has(a.gym.id)) {
            seen.add(a.gym.id);
            list.push(a.gym);
          }
        }
        setCoachGyms(list);
      } catch (e) {
        if (!cancelled) setLoadError(apiErrorMessage(e, "No pudimos cargar el catálogo."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [actions]);

  // Inventario del gym de referencia (para marcar disponibilidad). Todo el
  // setState se difiere a un microtask (mismo patrón que el resto de la app).
  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(async () => {
      if (!referenceGymId) {
        if (!cancelled) setAvailableSlugs(null);
        return;
      }
      try {
        const { equipment } = await actions.getGymEquipment(Number(referenceGymId));
        if (!cancelled) {
          setAvailableSlugs(new Set((equipment ?? []).filter((e) => e.available).map((e) => e.slug)));
        }
      } catch {
        if (!cancelled) setAvailableSlugs(new Set());
      }
    });
    return () => {
      cancelled = true;
    };
  }, [referenceGymId, actions]);

  const catalogById = useMemo(() => new Map(catalog.map((e) => [e.id, e])), [catalog]);

  const availabilityOf = useCallback(
    (exercise) => {
      if (!exercise?.machine_id) return "free"; // sin máquina → siempre válido
      if (availableSlugs === null) return "unknown"; // sin gym de referencia
      return availableSlugs.has(exercise.machine_id) ? "in" : "out";
    },
    [availableSlugs]
  );

  const setDay = (key, patch) => setDays((ds) => ds.map((d) => (d.key === key ? { ...d, ...patch } : d)));
  const addExercise = (dayKey, exerciseId) =>
    setDays((ds) =>
      ds.map((d) =>
        d.key === dayKey ? { ...d, exercises: [...d.exercises, { key: nextKey(), exerciseId }] } : d
      )
    );
  const removeExercise = (dayKey, exKey) =>
    setDays((ds) =>
      ds.map((d) => (d.key === dayKey ? { ...d, exercises: d.exercises.filter((e) => e.key !== exKey) } : d))
    );

  const outOfGymCount = useMemo(() => {
    if (availableSlugs === null) return 0;
    let n = 0;
    for (const d of days) {
      for (const e of d.exercises) {
        if (availabilityOf(catalogById.get(e.exerciseId)) === "out") n += 1;
      }
    }
    return n;
  }, [days, availableSlugs, availabilityOf, catalogById]);

  const valid =
    name.trim() &&
    days.length > 0 &&
    days.every((d) => d.name.trim()) &&
    days.some((d) => d.exercises.length > 0) &&
    outOfGymCount === 0;

  const save = async () => {
    setSaveError("");
    setBusy(true);
    const payload = {
      name: name.trim(),
      reference_gym_id: referenceGymId ? Number(referenceGymId) : null,
      days: days.map((d, i) => ({
        name: d.name.trim(),
        position: i + 1,
        exercises: d.exercises.map((e, j) => ({ exercise_id: e.exerciseId, position: j + 1 })),
      })),
    };
    try {
      if (editing) await actions.updateAthleteProgram(athlete.id, program.id, payload);
      else await actions.createAthleteProgram(athlete.id, payload);
      onSaved();
    } catch (e) {
      setSaveError(apiErrorMessage(e, "No se pudo guardar la rutina."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen title={editing ? "EDITAR RUTINA" : "NUEVA RUTINA"} subtitle={athlete.name} onBack={onBack}>
      <div className="stack">
        {loadError && (
          <Card>
            <p className="text-warning">{loadError}</p>
          </Card>
        )}

        <Card>
          <Field label="Nombre de la rutina">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Fuerza — bloque 1" />
          </Field>

          <Field
            label="Gimnasio de referencia (opcional)"
            hint="Solo tus gimnasios. El atleta no necesita pertenecer a él. Sin gym, se usa el catálogo global sin restricción."
          >
            <select
              className="input"
              value={referenceGymId}
              onChange={(e) => setReferenceGymId(e.target.value)}
            >
              <option value="">— sin gimnasio de referencia —</option>
              {coachGyms.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </Field>
        </Card>

        {days.map((day, di) => (
          <Card key={day.key}>
            <div className="row-between">
              <span className="micro">DÍA {di + 1}</span>
              {days.length > 1 && (
                <button
                  className="link-button danger"
                  onClick={() => setDays((ds) => ds.filter((d) => d.key !== day.key))}
                >
                  Eliminar día
                </button>
              )}
            </div>
            <Input value={day.name} onChange={(e) => setDay(day.key, { name: e.target.value })} placeholder="Nombre del día" />

            <div className="stack-sm" style={{ marginTop: 10 }}>
              {day.exercises.length === 0 && <p className="muted">Sin ejercicios todavía.</p>}
              {day.exercises.map((ex) => {
                const cat = catalogById.get(ex.exerciseId);
                const avail = availabilityOf(cat);
                return (
                  <div className="row-between" key={ex.key}>
                    <span>
                      {cat?.name ?? `#${ex.exerciseId}`}
                      {avail === "out" && (
                        <>
                          {" "}
                          <Badge tone="warning">No disponible en el gym</Badge>
                        </>
                      )}
                      {avail === "in" && (
                        <>
                          {" "}
                          <Badge tone="success">En el gym</Badge>
                        </>
                      )}
                    </span>
                    <button className="link-button danger" onClick={() => removeExercise(day.key, ex.key)}>
                      Quitar
                    </button>
                  </div>
                );
              })}
            </div>

            <Button variant="ghost" full onClick={() => setPicker({ dayKey: day.key })}>
              ＋ AÑADIR EJERCICIO
            </Button>
          </Card>
        ))}

        <Button
          variant="ghost"
          full
          onClick={() => setDays((ds) => [...ds, { key: nextKey(), name: `Día ${ds.length + 1}`, exercises: [] }])}
        >
          ＋ AÑADIR DÍA
        </Button>

        {outOfGymCount > 0 && (
          <Card>
            <p className="text-warning">
              {outOfGymCount} ejercicio(s) usan equipo no disponible en el gimnasio de referencia.
              Cámbialos o quita el gimnasio de referencia.
            </p>
          </Card>
        )}
        {saveError && (
          <Card>
            <p className="text-warning">{saveError}</p>
          </Card>
        )}

        <Button full disabled={!valid || busy || loading} onClick={save}>
          {busy ? "GUARDANDO…" : editing ? "GUARDAR CAMBIOS" : "CREAR RUTINA"}
        </Button>
      </div>

      <Modal open={Boolean(picker)} title="Catálogo de ejercicios" onClose={() => setPicker(null)}>
        <div className="stack-sm">
          {catalog.map((ex) => {
            const avail = availabilityOf(ex);
            return (
              <Card
                key={ex.id}
                onClick={() => {
                  addExercise(picker.dayKey, ex.id);
                  setPicker(null);
                }}
              >
                <div className="row-between">
                  <div>
                    <strong>{ex.name}</strong>
                    <p className="muted">{ex.type}</p>
                  </div>
                  {avail === "out" && <Badge tone="warning">No en el gym</Badge>}
                  {avail === "in" && <Badge tone="success">En el gym</Badge>}
                  {avail === "free" && <Badge>Sin máquina</Badge>}
                </div>
              </Card>
            );
          })}
        </div>
      </Modal>
    </Screen>
  );
}
