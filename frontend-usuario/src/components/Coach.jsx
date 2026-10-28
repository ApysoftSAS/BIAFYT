/**
 * BIAFYT COACH — AVATAR INTERACTIVO
 * ---------------------------------------------------------------
 * - Flota sobre cualquier pantalla, por defecto abajo a la derecha.
 * - Se puede ARRASTRAR a cualquier punto de la pantalla (ratón o dedo).
 * - Tiene una X pequeña para cerrarlo; queda un botón discreto para
 *   traerlo de vuelta.
 * - La posición y el estado cerrado se recuerdan entre sesiones.
 *
 * El arrastre usa Pointer Events, así que funciona igual en web,
 * Android e iOS. Solo se considera arrastre si el dedo se mueve más
 * de 6 px: por debajo de eso se trata como toque.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import coachImage from "../assets/motivacional.png";
import { COACH_STATES } from "./coachStates.js";
import { useApp } from "../state/AppContext.jsx";

const AVATAR = 76;
const MARGIN = 12;
const DRAG_THRESHOLD = 6;

export default function Coach({ state = "normal", message, visible = true, compact = false, onClick }) {
  const { state: appState, actions } = useApp();
  const stored = appState.coach ?? {};
  const hidden = stored.hidden ?? false;

  const [pos, setPos] = useState(stored.position ?? null); // null = ancla por defecto
  const [dragging, setDragging] = useState(false);
  const drag = useRef({ active: false, moved: false, dx: 0, dy: 0 });
  const nodeRef = useRef(null);

  // Mantiene el avatar dentro de la pantalla si cambia el tamaño/orientación.
  useEffect(() => {
    if (!pos) return;
    const clamp = () => {
      setPos((p) => (p ? clampToViewport(p) : p));
    };
    window.addEventListener("resize", clamp);
    window.addEventListener("orientationchange", clamp);
    return () => {
      window.removeEventListener("resize", clamp);
      window.removeEventListener("orientationchange", clamp);
    };
  }, [pos]);

  const onPointerDown = useCallback(
    (e) => {
      const rect = nodeRef.current?.getBoundingClientRect();
      if (!rect) return;
      drag.current = {
        active: true,
        moved: false,
        dx: e.clientX - rect.left,
        dy: e.clientY - rect.top,
      };
      e.currentTarget.setPointerCapture?.(e.pointerId);
    },
    []
  );

  const onPointerMove = useCallback((e) => {
    if (!drag.current.active) return;
    const next = clampToViewport({ x: e.clientX - drag.current.dx, y: e.clientY - drag.current.dy });
    if (!drag.current.moved) {
      const rect = nodeRef.current?.getBoundingClientRect();
      const movedEnough =
        rect && (Math.abs(e.clientX - (rect.left + drag.current.dx)) > DRAG_THRESHOLD || Math.abs(e.clientY - (rect.top + drag.current.dy)) > DRAG_THRESHOLD);
      if (movedEnough) {
        drag.current.moved = true;
        setDragging(true);
      }
    }
    if (drag.current.moved) setPos(next);
  }, []);

  const onPointerUp = useCallback(
    (e) => {
      const wasDrag = drag.current.moved;
      drag.current.active = false;
      drag.current.moved = false;
      setDragging(false);
      e.currentTarget.releasePointerCapture?.(e.pointerId);

      if (wasDrag) {
        setPos((p) => {
          if (p) actions.setCoach({ position: p });
          return p;
        });
      } else {
        onClick?.();
      }
    },
    [actions, onClick]
  );

  const config = COACH_STATES[state] ?? COACH_STATES.normal;

  // Cerrado: solo queda el botón para recuperarlo.
  if (hidden) {
    return (
      <button
        className="coach-restore glass"
        onClick={() => actions.setCoach({ hidden: false })}
        aria-label="Mostrar el coach"
        title="Mostrar el coach"
      >
        <img src={coachImage} alt="" />
      </button>
    );
  }

  const style = pos ? { left: pos.x, top: pos.y, right: "auto", bottom: "auto" } : undefined;

  return (
    <div
      ref={nodeRef}
      className={[
        "coach",
        visible ? "coach-enter" : "coach-exit",
        compact ? "coach-compact" : "",
        dragging ? "coach-dragging" : "",
        pos ? "coach-free" : "",
      ].join(" ")}
      style={style}
      aria-hidden={!visible}
    >
      {message && !dragging && (
        <div className="coach-bubble glass">
          {config.emoji && <span className="coach-emoji">{config.emoji}</span>}
          <span>{message}</span>
        </div>
      )}

      <div className="coach-avatar-wrap">
        <button
          className="coach-close"
          onClick={() => actions.setCoach({ hidden: true })}
          aria-label="Cerrar el coach"
          title="Cerrar"
        >
          ✕
        </button>

        <button
          className="coach-avatar"
          style={{ borderColor: config.ring }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          aria-label="BIAFYT Coach — mantén pulsado para moverlo"
          tabIndex={visible ? 0 : -1}
        >
          <img src={coachImage} alt="BIAFYT Coach" draggable="false" />
          <span className={`coach-state coach-state-${config.tone}`} />
        </button>
      </div>
    </div>
  );
}

function clampToViewport({ x, y }) {
  const maxX = window.innerWidth - AVATAR - MARGIN;
  const maxY = window.innerHeight - AVATAR - MARGIN;
  return {
    x: Math.min(Math.max(MARGIN, x), Math.max(MARGIN, maxX)),
    y: Math.min(Math.max(MARGIN, y), Math.max(MARGIN, maxY)),
  };
}
