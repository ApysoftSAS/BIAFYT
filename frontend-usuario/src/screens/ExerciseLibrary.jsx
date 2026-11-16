import { useState } from "react";
import { useApp } from "../state/AppContext.jsx";
import { Badge, Button, Card, Modal, Screen } from "../components/UI.jsx";
import LibraryBrowser from "../components/LibraryBrowser.jsx";
import { useLibrarySearch } from "../utils/useLibrarySearch.js";
import { ATTRIBUTION, categoryLabel, displayName, equipmentLabel, mediaUrls, muscleLabel, routineRowFromLibrary } from "../utils/exerciseLibrary.js";

/** Biblioteca de consulta (1.324 ejercicios). Desde la ficha se puede añadir el ejercicio a una rutina propia. */
export default function ExerciseLibrary({ onBack }) {
  const { state, actions } = useApp();
  const search = useLibrarySearch();
  const [selected, setSelected] = useState(null);
  const [gifFailed, setGifFailed] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  const routines = state.identity.customRoutines;

  // Añade el ejercicio a una rutina existente (`routine`) o crea una nueva (`null`).
  // `saveRoutine` activa la rutina si no había ninguna activa; aquí NO debe cambiar
  // la rutina activa del usuario, así que se restaura la que había.
  const addToRoutine = (routine) => {
    const e = selected;
    const row = routineRowFromLibrary(e);
    const previousActive = state.identity.activeRoutineId;
    const name = routine ? routine.name : `Rutina ${routines.length + 1}`;
    const id = actions.saveRoutine(
      routine
        ? { ...routine, exercises: [...routine.exercises, row] }
        : { name, focusId: state.identity.user.focusId, exercises: [row] }
    );
    if (previousActive !== id) actions.setActiveRoutine(previousActive);
    actions.notify({ channel: "training", title: "Ejercicio añadido", body: `${displayName(e.n)} → ${name}`, tone: "success" });
    setAddOpen(false);
  };

  // ---------------- FICHA ----------------
  if (selected) {
    const e = selected;
    const media = mediaUrls(e);
    const useGif = media.gif && !gifFailed;
    return (
      <Screen
        title={displayName(e.n)}
        subtitle={`${categoryLabel(e.c)} · ${equipmentLabel(e.q)}`}
        onBack={() => {
          setSelected(null);
          setGifFailed(false);
        }}
      >
        <div className="stack">
          <div className="lib-media">
            <img src={useGif ? media.gif : media.image} alt={`Demostración: ${displayName(e.n)}`} width={180} height={180} onError={() => setGifFailed(true)} />
          </div>

          <Button full onClick={() => setAddOpen(true)}>
            + AGREGAR A UNA RUTINA
          </Button>

          <Card>
            <p className="micro">MÚSCULO OBJETIVO</p>
            <h3>{muscleLabel(e.t)}</h3>
            <p className="micro">GRUPO MUSCULAR</p>
            <div className="chips">
              {[...new Set([e.m, ...e.s])].map((m) => (
                <span className="chip" key={m}>
                  {muscleLabel(m)}
                </span>
              ))}
            </div>
            <Badge>{equipmentLabel(e.q)}</Badge>
          </Card>

          <Card>
            <p className="micro">CÓMO SE HACE</p>
            <ol className="lib-steps">
              {e.st.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ol>
          </Card>

          <p className="micro center">
            Imágenes y animaciones:{" "}
            <a href="https://gymvisual.com/" target="_blank" rel="noopener noreferrer">
              {ATTRIBUTION}
            </a>
          </p>
        </div>

        <Modal open={addOpen} title="AGREGAR A UNA RUTINA" onClose={() => setAddOpen(false)}>
          <div className="stack-sm">
            <Button full onClick={() => addToRoutine(null)}>
              + NUEVA RUTINA
            </Button>
            {routines.map((r) => (
              <Card key={r.id} onClick={() => addToRoutine(r)}>
                <strong>{r.name}</strong>
                <p className="muted">{r.exercises.length} ejercicios</p>
              </Card>
            ))}
            <p className="micro muted">No cambia tu rutina activa. Puedes ajustar series y repeticiones en Mis rutinas.</p>
          </div>
        </Modal>
      </Screen>
    );
  }

  // ---------------- LISTA ----------------
  return (
    <Screen title="BIBLIOTECA" subtitle="Cómo se hace cada ejercicio." onBack={onBack}>
      <LibraryBrowser search={search} onSelect={setSelected} />
    </Screen>
  );
}
