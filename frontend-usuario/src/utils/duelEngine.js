/**
 * BIAFYT — MOTOR DE DUELOS (puntos 77, 78, 79, 80, 81, 82, 83)
 */

export const DUEL_STATUS = {
  PENDING: "Pendiente",
  ACCEPTED: "Aceptado",
  IN_PROGRESS: "En progreso",
  FINISHED: "Terminado",
  REJECTED: "Rechazado",
  UNVALIDATED: "No validado",
};

export const POINT_STATE = {
  AVAILABLE: "Disponible",
  LOCKED: "Bloqueado",
  WON: "Ganado",
  LOST: "Perdido",
};

/** Modalidades (punto 80). Pesos configurables por modalidad (punto 81). */
export const modalities = [
  {
    id: "speed",
    name: "VELOCIDAD",
    description: "Gana quien termina primero cumpliendo las condiciones.",
    weights: { time: 0.45, exercises: 0.25, reps: 0.15, consistency: 0.05, penalties: 0.1 },
    maxBet: 300,
  },
  {
    id: "endurance",
    name: "RESISTENCIA",
    description: "Gana quien obtiene mayor rendimiento en el tiempo establecido.",
    weights: { time: 0.15, exercises: 0.25, reps: 0.4, consistency: 0.1, penalties: 0.1 },
    maxBet: 300,
  },
  {
    id: "strength",
    name: "FUERZA",
    description: "Compara el rendimiento relativo según la modalidad.",
    weights: { time: 0.15, exercises: 0.3, reps: 0.35, consistency: 0.1, penalties: 0.1 },
    maxBet: 400,
  },
  {
    id: "consistency",
    name: "CONSTANCIA",
    description: "Compara el cumplimiento durante un periodo.",
    weights: { time: 0.05, exercises: 0.2, reps: 0.15, consistency: 0.5, penalties: 0.1 },
    maxBet: 200,
  },
  {
    id: "routine",
    name: "COMPLETAR RUTINA",
    description: "Gana quien termina correctamente todos los ejercicios.",
    weights: { time: 0.25, exercises: 0.4, reps: 0.15, consistency: 0.1, penalties: 0.1 },
    maxBet: 300,
  },
];

export function findModality(id) {
  return modalities.find((m) => m.id === id) || modalities[0];
}

/**
 * MATCH SCORE (punto 78) + DUELO JUSTO (punto 79)
 * Normaliza fuerza por peso corporal para no premiar solo la masa.
 */
export function buildMatchScore(a, b) {
  const relative = (u) => {
    const w = u.profile?.weight || 70;
    return Math.min(100, Math.round((u.stats.strength * 75) / w));
  };
  const dims = [
    { key: "strength", label: "FUERZA", a: relative(a), b: relative(b) },
    { key: "endurance", label: "RESISTENCIA", a: a.stats.endurance, b: b.stats.endurance },
    { key: "consistency", label: "CONSTANCIA", a: a.stats.consistency, b: b.stats.consistency },
    { key: "experience", label: "EXPERIENCIA", a: a.stats.experience, b: b.stats.experience },
  ];
  return dims;
}

/** PROBABILIDAD ESTIMADA (punto 77). Nunca se presenta como certeza. */
export function estimateProbability(a, b) {
  const dims = buildMatchScore(a, b);
  const sumA = dims.reduce((t, d) => t + d.a, 0);
  const sumB = dims.reduce((t, d) => t + d.b, 0);

  // Historial de duelos como ajuste menor.
  const rateA = winRate(a);
  const rateB = winRate(b);
  const scoreA = sumA * 0.85 + rateA * 100 * 0.15;
  const scoreB = sumB * 0.85 + rateB * 100 * 0.15;

  const total = scoreA + scoreB || 1;
  let pA = Math.round((scoreA / total) * 100);
  pA = Math.min(85, Math.max(15, pA)); // evita falsas certezas
  return { a: pA, b: 100 - pA, dims };
}

export function winRate(u) {
  const w = u.duels?.wins ?? 0;
  const l = u.duels?.losses ?? 0;
  if (w + l === 0) return 0.5;
  return w / (w + l);
}

/** LÍMITE DE APUESTA (puntos 82, 83). */
export function maxBetFor(user, modality, opponent) {
  const byModality = findModality(modality.id ?? modality).maxBet;
  const byBalance = user.points;
  const byOpponent = opponent ? opponent.points : Infinity;
  return Math.max(0, Math.min(byModality, byBalance, byOpponent));
}

/** CRITERIOS DE GANADOR (punto 81). */
export function scoreRun(run, reference, weights) {
  // run: { durationSeconds, exercisesCompleted, setsCompleted, validReps, consistency, penalties }
  const timeScore = clamp01(reference.durationSeconds / Math.max(1, run.durationSeconds)) * 100;
  const exerciseScore = clamp01(run.exercisesCompleted / Math.max(1, reference.exercisesCompleted)) * 100;
  const repsScore = clamp01(run.validReps / Math.max(1, reference.validReps)) * 100;
  const consistencyScore = clamp01(run.consistency / 100) * 100;
  const penaltyScore = 100 - Math.min(100, run.penalties * 10);

  const total =
    timeScore * weights.time +
    exerciseScore * weights.exercises +
    repsScore * weights.reps +
    consistencyScore * weights.consistency +
    penaltyScore * weights.penalties;

  return {
    total: Math.round(total),
    breakdown: {
      Tiempo: Math.round(timeScore),
      Ejercicios: Math.round(exerciseScore),
      Repeticiones: Math.round(repsScore),
      Consistencia: Math.round(consistencyScore),
      Penalizaciones: Math.round(penaltyScore),
    },
  };
}

function clamp01(v) {
  return Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0));
}

/** Simula la ejecución del rival sobre la misma rutina (demo). */
export function simulateRivalRun(rival, reference, probabilityForRival) {
  const skill = 0.75 + (probabilityForRival / 100) * 0.5; // 0.75 - 1.25
  const noise = 0.9 + Math.random() * 0.25;
  const factor = skill * noise;

  return {
    durationSeconds: Math.round(reference.durationSeconds / factor),
    exercisesCompleted: Math.min(reference.exercisesCompleted, Math.round(reference.exercisesCompleted * Math.min(1, factor))),
    setsCompleted: Math.min(reference.setsCompleted, Math.round(reference.setsCompleted * Math.min(1, factor))),
    validReps: Math.round(reference.validReps * Math.min(1.1, factor)),
    consistency: Math.round(Math.min(100, rival.stats.consistency * noise)),
    penalties: Math.random() < 0.2 ? 1 : 0,
  };
}

/** Resuelve el duelo completo. */
export function resolveDuel({ modalityId, userRun, rivalRun, reference }) {
  const modality = findModality(modalityId);
  const user = scoreRun(userRun, reference, modality.weights);
  const rival = scoreRun(rivalRun, reference, modality.weights);
  const winner = user.total === rival.total ? "draw" : user.total > rival.total ? "user" : "rival";
  return { modality, user, rival, winner };
}
