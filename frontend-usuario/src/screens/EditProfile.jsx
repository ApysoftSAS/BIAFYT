import { useState } from "react";
import { useApp } from "../state/AppContext.jsx";
import { Button, Card, Field, Input, Screen } from "../components/UI.jsx";
import { focuses } from "../data/training.js";
import { translateProfileError } from "../utils/api.js";

const toFieldString = (value) => (value === null || value === undefined ? "" : String(value));
const NUMERIC_FIELDS = ["age", "weight", "height", "monthsTraining"];

/**
 * EDITAR PERFIL — datos físicos, nivel y enfoque de entrenamiento,
 * sincronizados con el backend (GET/PATCH /profile vía AppContext).
 *
 * Cada campo se maneja como string mientras se edita. Al guardar, se
 * compara contra el valor con el que se abrió la pantalla: si no cambió
 * se omite del payload; si cambió y quedó vacío se envía `null`
 * (borra esa clave en el backend); si cambió y tiene contenido se
 * parsea recién aquí (Number para los campos físicos, texto libre para
 * `level`, el id de catálogo para `focusId`).
 */
export default function EditProfile({ onBack }) {
  const { state, actions } = useApp();
  const profile = state.identity.user.profile;

  // Valores al abrir la pantalla — referencia estable para el diff de guardado.
  const [initial] = useState(() => ({
    age: toFieldString(profile?.age),
    weight: toFieldString(profile?.weight),
    height: toFieldString(profile?.height),
    monthsTraining: toFieldString(profile?.monthsTraining),
    level: toFieldString(profile?.level),
    focusId: state.identity.user.focusId,
  }));
  const [form, setForm] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const update = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const save = async () => {
    setError("");
    const changes = {};
    for (const key of Object.keys(initial)) {
      const current = form[key];
      if (current === initial[key]) continue; // no tocado → se omite del payload
      if (key === "focusId") {
        changes.focusId = current; // siempre un id de catálogo, nunca vacío
        continue;
      }
      const trimmed = current.trim();
      if (trimmed === "") {
        changes[key] = null; // vaciado explícito → el backend borra esa clave
      } else if (key === "level") {
        changes[key] = trimmed; // texto libre, sin catálogo cerrado
      } else if (NUMERIC_FIELDS.includes(key)) {
        changes[key] = Number(trimmed);
      }
    }

    if (Object.keys(changes).length === 0) {
      onBack();
      return;
    }

    setBusy(true);
    try {
      await actions.updateProfile(changes);
      onBack();
    } catch (e) {
      setError(translateProfileError(e, "No pudimos guardar tu perfil."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen title="EDITAR PERFIL" subtitle="Datos físicos, nivel y enfoque de entrenamiento." onBack={onBack}>
      <div className="stack">
        <Card>
          <p className="micro">DATOS FÍSICOS</p>
          <div className="grid-3">
            <Field label="Edad">
              <Input type="number" min="12" value={form.age} onChange={update("age")} placeholder="Ej. 29" />
            </Field>
            <Field label="Peso (kg)">
              <Input type="number" min="30" value={form.weight} onChange={update("weight")} placeholder="Ej. 78" />
            </Field>
            <Field label="Altura (cm)">
              <Input type="number" min="120" value={form.height} onChange={update("height")} placeholder="Ej. 178" />
            </Field>
          </div>
        </Card>

        <Card>
          <p className="micro">NIVEL Y ENFOQUE</p>
          <Field label="Meses entrenando">
            <Input type="number" min="0" value={form.monthsTraining} onChange={update("monthsTraining")} placeholder="Ej. 34" />
          </Field>
          <Field label="Nivel" hint="Texto libre, p. ej. Principiante, Intermedio, Avanzado.">
            <Input list="level-suggestions" value={form.level} onChange={update("level")} placeholder="Ej. Intermedio" />
          </Field>
          <datalist id="level-suggestions">
            <option value="Principiante" />
            <option value="Intermedio" />
            <option value="Avanzado" />
          </datalist>
          <div className="divider" />
          <p className="micro">ENFOQUE DE ENTRENAMIENTO</p>
          <select className="input" value={form.focusId} onChange={update("focusId")}>
            {focuses.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
        </Card>

        {error && <p className="auth-error">{error}</p>}

        <Button full disabled={busy} onClick={save}>
          {busy ? "GUARDANDO…" : "GUARDAR"}
        </Button>
      </div>
    </Screen>
  );
}
