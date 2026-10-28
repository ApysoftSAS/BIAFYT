/**
 * BIAFYT COACH — ESTADOS Y MENSAJES (punto 66)
 * Separado del componente para no romper fast refresh.
 */

export const COACH_STATES = {
  normal: { tone: "neutral", ring: "var(--c-border-strong)", emoji: "" },
  motivacion: { tone: "accent", ring: "var(--c-primary)", emoji: "💪" },
  felicitacion: { tone: "success", ring: "var(--c-success)", emoji: "👏" },
  celebracion: { tone: "accent", ring: "var(--c-primary)", emoji: "🎉" },
  descanso: { tone: "neutral", ring: "var(--c-info)", emoji: "🫁" },
  alerta: { tone: "warning", ring: "var(--c-warning)", emoji: "⚠️" },
  explicacion: { tone: "neutral", ring: "var(--c-text-secondary)", emoji: "💡" },
  competitivo: { tone: "accent", ring: "var(--c-primary)", emoji: "🔥" },
  victoria: { tone: "success", ring: "var(--c-success)", emoji: "🏆" },
  derrota: { tone: "error", ring: "var(--c-error)", emoji: "🥊" },
  ranking: { tone: "accent", ring: "var(--c-primary)", emoji: "📈" },
  challenge: { tone: "accent", ring: "var(--c-primary)", emoji: "🎯" },
};

export const coachLines = {
  normal: ["Aquí estoy cuando lo necesites.", "¿Entrenamos hoy?"],
  motivacion: ["¡Vamos! Una serie más.", "El límite está en tu mente.", "Cada repetición cuenta."],
  felicitacion: ["Buena serie. Así se hace.", "Ese control es progreso."],
  celebracion: ["¡Entrenamiento completado!", "Hoy sumaste. Mañana se nota."],
  descanso: ["Respira. Recupera.", "Baja pulsaciones y vuelve con todo."],
  alerta: ["Revisa la técnica antes de subir carga.", "Necesitamos GPS para que esto puntúe."],
  explicacion: ["Te explico cómo funciona.", "Un dato que te sirve:"],
  competitivo: ["Tienes un duelo esperando.", "Es tu momento de demostrarlo."],
  victoria: ["¡Ganaste tu duelo!", "Bien jugado. Sigue así."],
  derrota: ["Perdiste el duelo, no el progreso.", "La revancha se entrena."],
  ranking: ["Estás subiendo en el ranking.", "Mira tu posición en tu gimnasio."],
  challenge: ["Tienes un reto activo.", "Te falta poco para completarlo."],
};

export function pickLine(state) {
  const list = coachLines[state] ?? coachLines.normal;
  return list[Math.floor(Math.random() * list.length)];
}
