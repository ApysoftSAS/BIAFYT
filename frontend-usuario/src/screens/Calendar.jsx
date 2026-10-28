import { useMemo, useState } from "react";
import { useApp } from "../state/AppContext.jsx";
import { Badge, Button, Card, Field, Input, Screen, Stat, Toggle } from "../components/UI.jsx";
import Coach from "../components/Coach.jsx";
import { formatTime, formatPoints } from "../utils/format.js";
import { SLOTS, DAY_LABELS, WEEKDAY_NAMES, WEEK_ORDER, MONTHS, dayKey, validateSchedule } from "../data/schedule.js";

/** Referencia temporal fija al cargar el módulo: el render se mantiene puro. */
const TODAY = new Date();


export default function Calendar({ onBack }) {
  const { state, actions } = useApp();
  const [offset, setOffset] = useState(0); // meses respecto al actual
  const [selected, setSelected] = useState(dayKey(TODAY));
  // Borrador de la jornada semanal: se edita aquí y solo se confirma al
  // guardar (con validación); al reabrir la pantalla vuelve a partir de
  // lo último guardado en AppContext.
  const [draft, setDraft] = useState(() => ({
    days: state.identity.user.schedule.days,
    startTime: state.identity.user.schedule.startTime,
    endTime: state.identity.user.schedule.endTime,
  }));
  const [scheduleError, setScheduleError] = useState("");

  const cursor = useMemo(() => new Date(TODAY.getFullYear(), TODAY.getMonth() + offset, 1), [offset]);

  // Días entrenados y planificados, indexados por fecha
  const trained = useMemo(() => {
    const map = {};
    state.identity.activities.forEach((a) => {
      const k = dayKey(new Date(a.date));
      map[k] = map[k] ? { ...map[k], count: map[k].count + 1, points: map[k].points + a.activityPoints } : { count: 1, points: a.activityPoints, validation: a.validation };
    });
    return map;
  }, [state.identity.activities]);

  const planned = useMemo(() => Object.fromEntries(state.identity.agenda.map((a) => [a.date, a])), [state.identity.agenda]);

  const cells = useMemo(() => {
    const firstDay = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
    const lead = firstDay.getDay();
    const list = Array.from({ length: lead }, () => null);
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(cursor.getFullYear(), cursor.getMonth(), d);
      list.push({ day: d, key: dayKey(date), weekday: date.getDay(), isToday: dayKey(date) === dayKey(TODAY) });
    }
    return list;
  }, [cursor]);

  const monthActivities = useMemo(
    () => state.identity.activities.filter((a) => a.date.startsWith(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`)),
    [state.identity.activities, cursor]
  );

  const selectedTraining = state.identity.activities.filter((a) => dayKey(new Date(a.date)) === selected);
  const selectedPlan = planned[selected];
  const schedule = state.identity.user.schedule;

  const scheduledDayNames = WEEK_ORDER.filter((d) => schedule.days.includes(d)).map((d) => WEEKDAY_NAMES[d]);

  const toggleDraftDay = (index) => {
    setDraft((d) => ({
      ...d,
      days: d.days.includes(index) ? d.days.filter((v) => v !== index) : [...d.days, index].sort(),
    }));
  };

  const saveSchedule = () => {
    const error = validateSchedule(draft);
    if (error) {
      setScheduleError(error);
      return;
    }
    setScheduleError("");
    actions.updateUser({ schedule: { ...schedule, ...draft } });
    actions.notify({ channel: "training", title: "Horario actualizado", body: "Guardamos tu jornada de entrenamiento.", tone: "success" });
  };

  return (
    <Screen title="MI CALENDARIO" onBack={onBack}>
      <div className="stack">
        {/* Resumen del mes */}
        <Card accent>
          <div className="row-around">
            <Stat label="Entrenamientos" value={monthActivities.length} />
            <Stat label="Series" value={monthActivities.reduce((t, a) => t + a.sets, 0)} />
            <Stat label="Puntos" value={formatPoints(monthActivities.reduce((t, a) => t + a.activityPoints, 0))} />
          </div>
        </Card>

        {/* Navegación del mes */}
        <Card>
          <div className="row-between">
            <button className="icon-btn" onClick={() => setOffset((o) => o - 1)} aria-label="Mes anterior">
              ‹
            </button>
            <strong>
              {MONTHS[cursor.getMonth()]} {cursor.getFullYear()}
            </strong>
            <button className="icon-btn" onClick={() => setOffset((o) => o + 1)} aria-label="Mes siguiente">
              ›
            </button>
          </div>

          <div className="cal-grid cal-head">
            {DAY_LABELS.map((d, i) => (
              <span key={i} className="cal-weekday">
                {d}
              </span>
            ))}
          </div>

          <div className="cal-grid">
            {cells.map((cell, i) =>
              cell === null ? (
                <span key={`e-${i}`} />
              ) : (
                <button
                  key={cell.key}
                  className={[
                    "cal-day",
                    trained[cell.key] ? "cal-trained" : "",
                    planned[cell.key] && !trained[cell.key] ? "cal-planned" : "",
                    schedule.days.includes(cell.weekday) ? "cal-preferred" : "",
                    cell.isToday ? "cal-today" : "",
                    selected === cell.key ? "cal-selected" : "",
                  ].join(" ")}
                  onClick={() => setSelected(cell.key)}
                >
                  {cell.day}
                </button>
              )
            )}
          </div>

          <div className="cal-legend">
            <span>
              <i className="dot-trained" /> Entrenado
            </span>
            <span>
              <i className="dot-planned" /> Planificado
            </span>
            <span>
              <i className="dot-preferred" /> Mi jornada
            </span>
          </div>
        </Card>

        {/* Día seleccionado */}
        <Card>
          <p className="micro">DÍA SELECCIONADO — {selected}</p>
          {selectedTraining.length > 0 ? (
            <div className="stack-xs">
              {selectedTraining.map((a) => (
                <div className="row-between activity-row" key={a.id}>
                  <div>
                    <strong>{a.routine}</strong>
                    <p className="micro">
                      {formatTime(a.durationSeconds)} · {a.sets} series
                    </p>
                  </div>
                  <Badge tone={a.validation === "VALID" ? "success" : a.validation === "SUSPICIOUS" ? "warning" : "error"}>
                    +{formatPoints(a.activityPoints)}
                  </Badge>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted">Sin entrenamientos registrados este día.</p>
          )}

          {selectedPlan ? (
            <>
              <p className="muted">
                Planificado: {SLOTS.find((s) => s.id === selectedPlan.slot)?.label ?? selectedPlan.slot}
              </p>
              <Button variant="ghost" full onClick={() => actions.unscheduleSession(selected)}>
                QUITAR DE MI AGENDA
              </Button>
            </>
          ) : (
            <Button variant="ghost" full onClick={() => actions.scheduleSession({ date: selected, slot: schedule.slot })}>
              PLANIFICAR ENTRENAMIENTO
            </Button>
          )}
        </Card>

        {/* Jornada preferida */}
        <Card>
          <p className="micro">MI JORNADA HABITUAL</p>
          <p className="muted">Usamos esto para recordarte entrenar a la hora que te funciona.</p>

          <div className="stack-xs">
            <p className="micro">TU HORARIO</p>
            <p>
              <strong>{schedule.startTime}</strong> — <strong>{schedule.endTime}</strong>
            </p>
            <p className="muted">{scheduledDayNames.length > 0 ? scheduledDayNames.join(" · ") : "Sin días seleccionados."}</p>
          </div>

          <p className="micro">HORA DE ENTRENAMIENTO</p>
          <div className="field-row">
            <Field label="Inicio">
              <Input type="time" value={draft.startTime} onChange={(e) => setDraft((d) => ({ ...d, startTime: e.target.value }))} />
            </Field>
            <Field label="Fin">
              <Input type="time" value={draft.endTime} onChange={(e) => setDraft((d) => ({ ...d, endTime: e.target.value }))} />
            </Field>
          </div>

          <p className="micro">DÍAS QUE ENTRENO</p>
          <div className="day-picker">
            {DAY_LABELS.map((label, index) => {
              const on = draft.days.includes(index);
              return (
                <button key={index} className={`day-chip ${on ? "day-chip-on" : ""}`} onClick={() => toggleDraftDay(index)}>
                  {label}
                </button>
              );
            })}
          </div>

          {scheduleError && <p className="text-error micro">{scheduleError}</p>}

          <Button full onClick={saveSchedule}>
            GUARDAR HORARIO
          </Button>

          <Toggle
            label="Recordatorio de entrenamiento"
            description="Aviso en tu jornada los días que entrenas."
            checked={schedule.reminder}
            onChange={(v) => actions.updateUser({ schedule: { ...schedule, reminder: v } })}
          />
        </Card>
      </div>

      <Coach state="ranking" message="Los días marcados son los que decidiste entrenar." />
    </Screen>
  );
}
