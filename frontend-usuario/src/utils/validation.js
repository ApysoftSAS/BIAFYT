/**
 * BIAFYT — VALIDACIÓN DE ACTIVIDAD (puntos 60, 61, 62, 91)
 * ---------------------------------------------------------------
 * Objetivo: detectar comportamiento claramente anómalo, NO castigar
 * entrenamientos reales. Las reglas son deliberadamente tolerantes.
 */

export const ACTIVITY_STATE = {
  VALID: "VALID",
  SUSPICIOUS: "SUSPICIOUS",
  INVALID: "INVALID",
  PENDING: "PENDING",
};

/** Umbrales razonables, no rígidos. */
export const THRESHOLDS = {
  minSetSeconds: 8, // una serie por debajo de esto es implausible
  minRestSeconds: 5, // descanso mínimo entre series
  minTransitionSeconds: 5, // cambio de ejercicio
  minSessionSeconds: 120, // sesión mínima creíble
  maxSessionSeconds: 4 * 60 * 60, // sesión abandonada abierta
};

/**
 * @param {object} session
 *  - durationSeconds: duración total real
 *  - setsCompleted: series registradas
 *  - exercisesCompleted: ejercicios registrados
 *  - setDurations: array de duraciones de serie (s)
 *  - restDurations: array de descansos (s)
 *  - gps: { required, granted, near, distance }
 */
export function validateActivity(session) {
  const reasons = [];
  let score = 100;

  const {
    durationSeconds = 0,
    setsCompleted = 0,
    exercisesCompleted = 0,
    setDurations = [],
    restDurations = [],
    gps = { required: false, granted: false, near: false },
  } = session;

  // --- Duración total (punto 61)
  const expectedMinimum =
    setsCompleted * THRESHOLDS.minSetSeconds +
    Math.max(0, setsCompleted - 1) * THRESHOLDS.minRestSeconds +
    Math.max(0, exercisesCompleted - 1) * THRESHOLDS.minTransitionSeconds;

  if (durationSeconds < THRESHOLDS.minSessionSeconds && setsCompleted > 2) {
    score -= 45;
    reasons.push("Sesión demasiado corta para el volumen registrado");
  }
  if (durationSeconds < expectedMinimum) {
    score -= 40;
    reasons.push("Los tiempos registrados no son físicamente razonables");
  }
  if (durationSeconds > THRESHOLDS.maxSessionSeconds) {
    score -= 20;
    reasons.push("Sesión abierta durante demasiado tiempo");
  }

  // --- Series individuales
  const impossibleSets = setDurations.filter((d) => d < THRESHOLDS.minSetSeconds).length;
  if (impossibleSets > 0) {
    score -= Math.min(35, impossibleSets * 12);
    reasons.push(`${impossibleSets} serie(s) con duración implausible`);
  }

  const noRest = restDurations.filter((d) => d < THRESHOLDS.minRestSeconds).length;
  if (noRest > Math.max(1, restDurations.length * 0.5)) {
    score -= 15;
    reasons.push("Descansos prácticamente inexistentes");
  }

  // --- GPS (puntos 59, 60, 88)
  let gpsOk = true;
  if (gps.required) {
    if (!gps.granted) {
      gpsOk = false;
      score -= 60;
      reasons.push("GPS no disponible para una actividad competitiva");
    } else if (!gps.near) {
      gpsOk = false;
      score -= 55;
      reasons.push("La ubicación no corresponde a tu sede");
    }
  }

  let state = ACTIVITY_STATE.VALID;
  if (score < 45) state = ACTIVITY_STATE.INVALID;
  else if (score < 80) state = ACTIVITY_STATE.SUSPICIOUS;

  return {
    state,
    score: Math.max(0, score),
    reasons,
    gpsOk,
    /**
     * Punto 62: la actividad SIEMPRE se registra, pero los puntos que
     * alimentan rankings, premios y duelos exigen ubicación validada.
     * Si el usuario desactivó el GPS competitivo, la sesión es válida
     * como actividad y no otorga beneficios competitivos.
     */
    competitiveEligible: state === ACTIVITY_STATE.VALID && gps.granted && gps.near,
  };
}

/** Etiqueta legible del estado. */
export const stateLabel = {
  VALID: "Actividad validada",
  SUSPICIOUS: "Actividad en revisión",
  INVALID: "Actividad no validada",
  PENDING: "Validación pendiente",
};

export const stateMessage = {
  VALID: "Tu entrenamiento fue validado correctamente.",
  SUSPICIOUS: "Detectamos datos poco habituales. Se registró tu actividad, pero revisaremos los puntos competitivos.",
  INVALID: "No pudimos validar este entrenamiento. Queda registrado como actividad, sin puntos competitivos.",
  PENDING: "Estamos validando tu entrenamiento.",
};

/**
 * ECONOMÍA DE PUNTOS (punto 91)
 * Devuelve puntos de actividad y puntos competitivos por separado (punto 62).
 */
export const POINT_RULES = {
  checkin: 20,
  perSet: 6,
  perExercise: 12,
  streakBonus: 10, // por día de racha, con tope
  streakCap: 100,
  challenge: 120,
  achievement: 80,
  referral: 200,
  duelWinBase: 60,
  dailyActivityCap: 600, // evita generación infinita
};

export function computeWorkoutPoints(session, validation, streak = 0) {
  const base =
    session.setsCompleted * POINT_RULES.perSet +
    session.exercisesCompleted * POINT_RULES.perExercise +
    Math.min(POINT_RULES.streakCap, streak * POINT_RULES.streakBonus);

  const activityPoints = Math.min(POINT_RULES.dailyActivityCap, Math.round(base));
  const competitivePoints = validation.competitiveEligible ? activityPoints : 0;

  return { activityPoints, competitivePoints };
}
