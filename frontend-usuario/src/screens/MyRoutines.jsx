import { useCallback, useEffect, useMemo, useState } from "react";
import { useApp } from "../state/AppContext.jsx";
import { Badge, Button, Card, Field, Input, Modal, Screen } from "../components/UI.jsx";
import Coach from "../components/Coach.jsx";
import { focuses, buildRoutine, findFocus } from "../data/training.js";
import { typeOf, setsFor } from "../utils/exercisePrescription.js";
import { apiGetPrograms, apiImportProgram, apiGetGymAssignments, apiGetGymEquipment } from "../utils/api.js";

const emptyExercise = () => ({ id: `ex-${Math.random().toString(36).slice(2, 9)}`, name: "", sets: 4, reps: 12, rest: 60 });

/**
 * Convierte una rutina del coach (shape backend Program→Day→Exercise) en una
 * `customRoutine` local. Las rutinas locales son de un solo bloque, así que
 * los días del programa se aplanan en una sola lista (se conserva el orden).
 * La prescripción por `type` sigue el mismo contrato que `exerciseFromCatalog`.
 */
function routineFromCoachProgram(program, focusId) {
  const exercises = program.days.flatMap((day) =>
    day.exercises.map((pe) => {
      const ex = pe.exercise;
      const base = { id: `ex-${Math.random().toString(36).slice(2, 9)}`, exerciseId: ex.id, name: ex.name, type: ex.type, rest: 60 };
      if (ex.type === "cardio") return { ...base, duration: null };
      if (ex.type === "isométrico") return { ...base, sets: 4, seconds: 20 };
      return { ...base, sets: 4, reps: 12 };
    })
  );
  return { name: program.name, focusId: focusId ?? "hypertrophy", exercises };
}

/**
 * Fila nueva a partir de un ejercicio real del catálogo: respeta el mismo
 * contrato de campos por `type` que ya usa `training.js#buildRoutine` (única
 * fuente de verdad de prescripción — no se reinterpreta aquí). `20` segundos
 * es solo un valor inicial editable de UI (mismo criterio que 4/12/60 para
 * fuerza), no una prescripción fitness.
 */
const exerciseFromCatalog = (ex) => {
  const base = { id: `ex-${Math.random().toString(36).slice(2, 9)}`, exerciseId: ex.id, name: ex.name, type: ex.type, rest: 60 };
  if (ex.type === "cardio") return { ...base, duration: null };
  if (ex.type === "isométrico") return { ...base, sets: 4, seconds: 20 };
  return { ...base, sets: 4, reps: 12 };
};

/**
 * MIS RUTINAS
 * El usuario puede crear sus propias rutinas, elegir ejercicios de la
 * biblioteca o escribirlos, y marcar una como activa. La rutina activa
 * es la que se ejecuta en Entrenamiento y en los duelos.
 */
export default function MyRoutines({ onBack, onTrain }) {
  const { state, actions, exerciseCatalog } = useApp();
  const [editing, setEditing] = useState(null);
  const [picker, setPicker] = useState(false);

  // Rutinas creadas por un coach para este atleta (solo lectura). LocalStorage
  // sigue siendo la fuente de verdad de las rutinas propias; esto es la
  // "bandeja de entrada" de lo que envía el coach. Sin coach → lista vacía,
  // sin cambios para el atleta independiente.
  //
  // Solo se muestran las que el coach creó (`created_by`) y el atleta AÚN NO
  // ha importado (`imported_at == null`). La importación es persistente por
  // atleta + programa en el backend (`POST /me/programs/{id}/import` →
  // `programs.imported_at`), así que una rutina copiada NO reaparece al
  // recargar, ni cuando el coach la edita después.
  const token = state.auth?.token;
  const [coachRoutines, setCoachRoutines] = useState([]);
  const [importing, setImporting] = useState(null); // id del programa en curso

  const loadCoachRoutines = useCallback(() => {
    if (!token) return;
    apiGetPrograms(token)
      .then(({ programs }) => setCoachRoutines((programs ?? []).filter((p) => p.created_by && !p.imported_at)))
      .catch(() => {
        /* best-effort: si falla, el atleta sigue con sus rutinas locales */
      });
  }, [token]);

  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(() => {
      if (!cancelled) loadCoachRoutines();
    });
    return () => {
      cancelled = true;
    };
  }, [loadCoachRoutines]);

  // Copiar = registrar primero la importación en el backend (persistente,
  // por atleta) y SOLO entonces crear la rutina local. Así nunca queda una
  // copia local sin su marca de importación (que la haría reaparecer como
  // pendiente al recargar). Si el registro falla, no se copia.
  const copyCoachRoutine = async (program) => {
    if (importing) return;
    setImporting(program.id);
    try {
      await apiImportProgram(token, program.id);
    } catch {
      actions.notify({ channel: "training", title: "No se pudo copiar la rutina", body: "Inténtalo de nuevo.", tone: "alert" });
      setImporting(null);
      return;
    }
    const draft = routineFromCoachProgram(program, state.identity.user.focusId);
    const id = actions.saveRoutine(draft);
    actions.setActiveRoutine(id);
    // Desaparece de "DE MI COACH" al instante; el reload confirma con el backend.
    setCoachRoutines((prev) => prev.filter((p) => p.id !== program.id));
    loadCoachRoutines();
    setImporting(null);
    actions.notify({ channel: "training", title: "Rutina copiada", body: `${program.name} — ahora es tuya y puedes editarla`, tone: "success" });
  };

  // Integración de SOLO LECTURA y ADITIVA: si el atleta tiene un
  // GymAssignment activo de backend, se usa el inventario de ese gym para
  // PRIORIZAR (nunca filtrar) el equipamiento en el picker. No toca el
  // `gymId` mock de LocalStorage ni check-in/GPS/onboarding. Sin gym o sin
  // inventario → `gymEquip` queda en null y el picker no cambia.
  const [gymEquip, setGymEquip] = useState(null); // { gymName, slugs: Set } | null

  const loadGymEquipment = useCallback(() => {
    if (!token) return;
    apiGetGymAssignments(token)
      .then(({ gym_assignments: assignments }) => {
        const list = assignments ?? [];
        const chosen = list.find((a) => a.role === "member") ?? list[0];
        if (!chosen?.gym?.id) return null;
        return apiGetGymEquipment(chosen.gym.id).then(({ equipment }) => {
          const slugs = new Set((equipment ?? []).filter((e) => e.available).map((e) => e.slug));
          return slugs.size ? { gymName: chosen.gym.name, slugs } : null;
        });
      })
      .then((result) => setGymEquip(result ?? null))
      .catch(() => {
        /* best-effort: sin priorización, el catálogo global sigue intacto */
      });
  }, [token]);

  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(() => {
      if (!cancelled) loadGymEquipment();
    });
    return () => {
      cancelled = true;
    };
  }, [loadGymEquipment]);

  // El catálogo local usa `machineId` (camelCase); el inventario del backend
  // usa el mismo espacio de slugs (`m-prensa`, …).
  const inGym = useCallback(
    (ex) => Boolean(gymEquip && ex.machineId && gymEquip.slugs.has(ex.machineId)),
    [gymEquip]
  );

  // El picker muestra SIEMPRE todo el catálogo global; si hay gym, los
  // ejercicios disponibles allí se ordenan primero (sort estable → conserva
  // el orden original dentro de cada grupo).
  const pickerExercises = useMemo(() => {
    if (!gymEquip) return exerciseCatalog;
    return [...exerciseCatalog].sort((a, b) => Number(inGym(b)) - Number(inGym(a)));
  }, [exerciseCatalog, gymEquip, inGym]);

  const auto = buildRoutine(state.identity.user.focusId);

  // ---------------- EDITOR ----------------
  if (editing) {
    const valid = editing.name.trim() && editing.exercises.length > 0 && editing.exercises.every((e) => e.name.trim());

    const updateExercise = (id, changes) =>
      setEditing((r) => ({ ...r, exercises: r.exercises.map((e) => (e.id === id ? { ...e, ...changes } : e)) }));

    return (
      <Screen title={editing.id ? "EDITAR RUTINA" : "NUEVA RUTINA"} onBack={() => setEditing(null)}>
        <div className="stack">
          <Field label="Nombre de la rutina">
            <Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="Empuje — Lunes" />
          </Field>

          <Field label="Enfoque">
            <select className="input" value={editing.focusId} onChange={(e) => setEditing({ ...editing, focusId: e.target.value })}>
              {focuses.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
            </select>
          </Field>

          <div className="row-between">
            <h3 className="section-title">EJERCICIOS ({editing.exercises.length})</h3>
            <Button variant="ghost" onClick={() => setPicker(true)}>
              + DE LA BIBLIOTECA
            </Button>
          </div>

          <div className="stack-sm">
            {editing.exercises.map((ex, i) => (
              <Card key={ex.id}>
                <div className="row-between">
                  <span className="micro">EJERCICIO {i + 1}</span>
                  <button
                    className="link-button danger"
                    onClick={() => setEditing({ ...editing, exercises: editing.exercises.filter((e) => e.id !== ex.id) })}
                  >
                    Eliminar
                  </button>
                </div>
                <Input value={ex.name} onChange={(e) => updateExercise(ex.id, { name: e.target.value })} placeholder="Nombre del ejercicio" />
                {typeOf(ex) === "cardio" ? (
                  <Field label="Descanso (s)">
                    <Input type="number" min="10" step="5" value={ex.rest} onChange={(e) => updateExercise(ex.id, { rest: Number(e.target.value) })} />
                  </Field>
                ) : typeOf(ex) === "isométrico" ? (
                  <div className="grid-3">
                    <Field label="Series">
                      <Input type="number" min="1" max="10" value={ex.sets} onChange={(e) => updateExercise(ex.id, { sets: Number(e.target.value) })} />
                    </Field>
                    <Field label="Segundos">
                      <Input type="number" min="1" max="600" value={ex.seconds} onChange={(e) => updateExercise(ex.id, { seconds: Number(e.target.value) })} />
                    </Field>
                    <Field label="Descanso (s)">
                      <Input type="number" min="10" step="5" value={ex.rest} onChange={(e) => updateExercise(ex.id, { rest: Number(e.target.value) })} />
                    </Field>
                  </div>
                ) : (
                  <div className="grid-3">
                    <Field label="Series">
                      <Input type="number" min="1" max="10" value={ex.sets} onChange={(e) => updateExercise(ex.id, { sets: Number(e.target.value) })} />
                    </Field>
                    <Field label="Reps">
                      <Input type="number" min="1" max="100" value={ex.reps} onChange={(e) => updateExercise(ex.id, { reps: Number(e.target.value) })} />
                    </Field>
                    <Field label="Descanso (s)">
                      <Input type="number" min="10" step="5" value={ex.rest} onChange={(e) => updateExercise(ex.id, { rest: Number(e.target.value) })} />
                    </Field>
                  </div>
                )}
              </Card>
            ))}
          </div>

          <Button variant="ghost" full onClick={() => setEditing({ ...editing, exercises: [...editing.exercises, emptyExercise()] })}>
            + AÑADIR EJERCICIO
          </Button>

          <Button
            full
            disabled={!valid}
            onClick={() => {
              const id = actions.saveRoutine(editing);
              actions.setActiveRoutine(id);
              actions.notify({ channel: "training", title: "Rutina guardada", body: editing.name, tone: "success" });
              setEditing(null);
            }}
          >
            GUARDAR Y ACTIVAR
          </Button>
        </div>

        <Modal open={picker} title="BIBLIOTECA DE EJERCICIOS" onClose={() => setPicker(false)}>
          <div className="stack-sm">
            {gymEquip && (
              <p className="micro muted">
                Los ejercicios disponibles en {gymEquip.gymName} aparecen primero. Puedes elegir cualquiera del catálogo.
              </p>
            )}
            {pickerExercises.map((ex) => (
              <Card
                key={ex.id}
                onClick={() => {
                  setEditing((r) => ({ ...r, exercises: [...r.exercises, exerciseFromCatalog(ex)] }));
                  setPicker(false);
                }}
              >
                <div className="row-between">
                  <div>
                    <strong>{ex.name}</strong>
                    <p className="muted">{ex.type}</p>
                  </div>
                  {inGym(ex) && <Badge tone="success">Disponible en tu gym</Badge>}
                </div>
              </Card>
            ))}
          </div>
        </Modal>
      </Screen>
    );
  }

  // ---------------- LISTA ----------------
  return (
    <Screen title="MIS RUTINAS" onBack={onBack}>
      <div className="stack">
        <Button full onClick={() => setEditing({ name: "", focusId: state.identity.user.focusId, exercises: [emptyExercise()] })}>
          + CREAR RUTINA
        </Button>

        {/* Rutina automática siempre disponible */}
        <Card className={state.identity.activeRoutineId === null ? "card-selected" : ""}>
          <div className="row-between">
            <div>
              <p className="micro">AUTOMÁTICA</p>
              <strong>{auto.name}</strong>
              <p className="muted">
                {auto.exercises.length} ejercicios · generada desde tu objetivo
              </p>
            </div>
            {state.identity.activeRoutineId === null && <Badge tone="accent">Activa</Badge>}
          </div>
          {state.identity.activeRoutineId !== null && (
            <Button variant="ghost" full onClick={() => actions.setActiveRoutine(null)}>
              USAR ESTA
            </Button>
          )}
        </Card>

        {coachRoutines.length > 0 && (
          <>
            <h3 className="section-title">DE MI COACH</h3>
            <div className="stack-sm">
              {coachRoutines.map((p) => (
                <Card key={p.id}>
                  <div className="row-between">
                    <div>
                      <p className="micro">
                        {p.created_by?.name ? `${p.created_by.name}` : "Tu coach"}
                        {p.reference_gym ? ` · ${p.reference_gym.name}` : ""}
                      </p>
                      <strong>{p.name}</strong>
                      <p className="muted">
                        {p.days.length} día(s) · {p.days.reduce((t, d) => t + d.exercises.length, 0)} ejercicios
                      </p>
                    </div>
                    <Badge tone="accent">Coach</Badge>
                  </div>
                  <Button variant="ghost" full disabled={importing === p.id} onClick={() => copyCoachRoutine(p)}>
                    {importing === p.id ? "COPIANDO…" : "COPIAR A MIS RUTINAS"}
                  </Button>
                </Card>
              ))}
            </div>
          </>
        )}

        {state.identity.customRoutines.length === 0 ? (
          <p className="muted center">Todavía no has creado rutinas propias.</p>
        ) : (
          <div className="stack-sm">
            {state.identity.customRoutines.map((r) => {
              const active = state.identity.activeRoutineId === r.id;
              return (
                <Card key={r.id} className={active ? "card-selected" : ""}>
                  <div className="row-between">
                    <div>
                      <p className="micro">{findFocus(r.focusId).label}</p>
                      <strong>{r.name}</strong>
                      <p className="muted">
                        {r.exercises.length} ejercicios · {r.exercises.reduce((t, e) => t + setsFor(e), 0)} series
                      </p>
                    </div>
                    {active && <Badge tone="accent">Activa</Badge>}
                  </div>
                  <div className="row-gap">
                    {!active && (
                      <Button variant="ghost" full onClick={() => actions.setActiveRoutine(r.id)}>
                        ACTIVAR
                      </Button>
                    )}
                    <Button variant="ghost" full onClick={() => setEditing(r)}>
                      EDITAR
                    </Button>
                    <Button variant="danger" full onClick={() => actions.deleteRoutine(r.id)}>
                      BORRAR
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        <Button variant="ghost" full onClick={onTrain}>
          ▶ ENTRENAR CON LA RUTINA ACTIVA
        </Button>
      </div>

      <Coach state="explicacion" message="La rutina activa es la que usarás al entrenar y en los duelos." />
    </Screen>
  );
}
