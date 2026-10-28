/**
 * BIAFYT — CLIENTE API
 * ---------------------------------------------------------------
 * Acceso al backend Laravel (Sanctum, tokens Bearer) con `fetch`
 * nativo — sin Axios ni otras dependencias nuevas.
 *
 * La URL base viene de `VITE_API_BASE_URL` (ver `.env.example`) e
 * incluye el prefijo de versión, p.ej. "http://localhost:8000/api/v1".
 * Los paths de este archivo son relativos a esa base ("/auth/login",
 * ...). Debe ser siempre una URL absoluta: en build nativo (Capacitor)
 * no hay servidor local sirviendo el bundle, así que una ruta relativa
 * apuntaría al propio dispositivo, no a la API.
 */

const BASE_URL = import.meta.env.VITE_API_BASE_URL || "";

/**
 * Error de API. `status` distingue los casos relevantes para la UI:
 * 401 = no autenticado / token inválido o revocado.
 * 422 = validación (conserva `errors` con el shape de Laravel).
 * 0   = error de red (el backend no respondió, p.ej. está caído).
 */
export class ApiError extends Error {
  constructor(message, { status = 0, errors = null } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.errors = errors;
  }
}

async function apiFetch(path, { method = "GET", body, token } = {}) {
  const headers = { "Content-Type": "application/json", Accept: "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  let response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError("No pudimos conectar con el servidor.", { status: 0 });
  }

  let data = null;
  try {
    data = await response.json();
  } catch {
    /* respuesta sin cuerpo JSON (p.ej. 204 o error sin payload) */
  }

  if (!response.ok) {
    throw new ApiError(data?.message ?? "Ocurrió un error inesperado.", {
      status: response.status,
      errors: data?.errors ?? null,
    });
  }

  return data;
}

/** Extrae un mensaje legible de un ApiError para mostrarlo en la UI. */
export function apiErrorMessage(error, fallback = "Ocurrió un error inesperado.") {
  if (!(error instanceof ApiError)) return fallback;
  if (error.status === 0) return "No pudimos conectar con el servidor.";
  if (error.errors) {
    const first = Object.values(error.errors)[0];
    if (Array.isArray(first) && first.length) return first[0];
  }
  return error.message || fallback;
}

// ------------------------------------------------------------------
// AUTENTICACIÓN (Fase 1 — Sanctum)
// ------------------------------------------------------------------

/** POST /auth/register → { user, token } (201). 422 si el correo ya existe o la validación falla. */
export function apiRegister({ name, email, password }) {
  return apiFetch("/auth/register", { method: "POST", body: { name, email, password } });
}

/** POST /auth/login → { user, token } (200). 422 (bajo `email`) si las credenciales son incorrectas. */
export function apiLogin({ email, password }) {
  return apiFetch("/auth/login", { method: "POST", body: { email, password } });
}

/** POST /auth/logout → { message } (200). Requiere token válido; 401 si no. */
export function apiLogout(token) {
  return apiFetch("/auth/logout", { method: "POST", token });
}

/** GET /auth/me → { user } (200). 401 si no hay token o es inválido/revocado. */
export function apiMe(token) {
  return apiFetch("/auth/me", { token });
}

// ------------------------------------------------------------------
// PERFIL (Fase 2 — datos físicos/nivel/enfoque, backend fuente de verdad)
// ------------------------------------------------------------------

/** GET /profile → { profile } (200). `profile` es `null` si el usuario aún no lo ha completado. */
export function apiGetProfile(token) {
  return apiFetch("/profile", { token });
}

/**
 * PATCH /profile → { profile } (200, upsert: clave omitida = se preserva,
 * clave con `null` = se borra). 422 si falla la validación; 401 sin auth.
 */
export function apiUpdateProfile(token, payload) {
  return apiFetch("/profile", { method: "PATCH", body: payload, token });
}

// ------------------------------------------------------------------
// CATÁLOGO DE EJERCICIOS (público, sin token — ver data/exerciseCatalog.js
// para la normalización hacia el shape local y el fallback a data/exercises.js)
// ------------------------------------------------------------------

/** GET /exercises → { exercises: [{ id, slug, name, type, machine_id }] } (200, público). */
export function apiGetExercises() {
  return apiFetch("/exercises");
}

/**
 * Único punto de mapeo backend→frontend para Profile: traduce `focus_id`
 * → `focusId` y normaliza `weight`/`height` (Eloquent los serializa como
 * string por ser `decimal:2`, p.ej. `"78.00"`) a `Number`.
 *
 * `focusId` viene como `undefined` cuando la API no informó un `focus_id`
 * (perfil `null`, o `focus_id: null` explícito) — el llamador NO debe
 * reemplazar el `focusId` local en ese caso (Training no tiene fallback
 * para `focusId: null`).
 */
export function mapProfileFromApi(apiProfile) {
  if (!apiProfile) return { profile: null, focusId: undefined };
  const { age, weight, height, months_training, level, focus_id } = apiProfile;
  return {
    profile: {
      age: age ?? null,
      weight: weight != null ? Number(weight) : null,
      height: height != null ? Number(height) : null,
      monthsTraining: months_training ?? null,
      level: level ?? null,
    },
    focusId: focus_id ?? undefined,
  };
}

/**
 * Arma el payload de PATCH /profile a partir de un objeto de "cambios" ya
 * resueltos por el formulario (Number, string, o `null` explícito para
 * borrar). Solo incluye las claves presentes en `changes`; traduce
 * `focusId` → `focus_id` para el backend.
 */
export function buildProfilePatchPayload(changes) {
  const payload = {};
  if ("age" in changes) payload.age = changes.age;
  if ("weight" in changes) payload.weight = changes.weight;
  if ("height" in changes) payload.height = changes.height;
  if ("monthsTraining" in changes) payload.months_training = changes.monthsTraining;
  if ("level" in changes) payload.level = changes.level;
  if ("focusId" in changes) payload.focus_id = changes.focusId;
  return payload;
}

// Mensaje canónico en español por campo de Profile. Las reglas de
// validación de estos 6 campos son fijas y conocidas (ver PATCH /profile
// en el backend), así que en vez de mostrar el string en inglés que
// devuelve Laravel ("The age field must be between 12 and 100.") se usa un
// mensaje fijo por campo — no un parseo del texto en inglés.
const PROFILE_FIELD_MESSAGES = {
  age: "La edad debe estar entre 12 y 100 años.",
  weight: "El peso debe estar entre 20 y 400 kg.",
  height: "La altura debe estar entre 100 y 250 cm.",
  months_training: "Los meses entrenando no pueden ser negativos.",
  level: "El texto no puede superar los 50 caracteres.",
  focus_id: "El texto no puede superar los 50 caracteres.",
};

/**
 * Traduce un ApiError de PATCH /profile a español. Si `errors` trae alguno
 * de los 6 campos de Profile, devuelve su mensaje canónico fijo; si no
 * (errors ausente, o campo no reconocido), cae al fallback genérico en
 * español de `apiErrorMessage`. Reutilizable desde EditProfile y el paso
 * final de Onboarding — no dupliques este mapeo en las pantallas.
 */
export function translateProfileError(error, fallback = "No pudimos guardar tu perfil.") {
  if (error instanceof ApiError && error.errors) {
    for (const field of Object.keys(PROFILE_FIELD_MESSAGES)) {
      if (field in error.errors) return PROFILE_FIELD_MESSAGES[field];
    }
  }
  return apiErrorMessage(error, fallback);
}

// ------------------------------------------------------------------
// ACTIVITY + POINTS — INTEGRACIÓN WRITE-THROUGH (COPIA SOMBRA)
// ------------------------------------------------------------------
// LocalStorage sigue siendo la fuente de verdad visible al usuario (puntos,
// historial, Analytics, Ranking). El backend recibe una copia de auditoría
// best-effort: cada actividad local se envía también a `POST /me/activities`,
// que crea la Activity y su crédito `workout_completed` en el ledger backend.
// El monto de puntos lo calcula SIEMPRE el backend (`PointRules`); el cliente
// jamás envía `points`/`amount`/`user_id`. Un fallo del POST no afecta al
// estado local — no hay reintento ni cola en esta fase.

/**
 * Construye el payload de `POST /me/activities` a partir de un objeto de
 * actividad del frontend (el mismo shape que consume `AppContext#addActivity`,
 * p.ej. `{ routine, durationSeconds, sets, exercises, ... }`).
 *
 * - `finished_at` = `now` (por defecto el instante de la llamada).
 * - `started_at`  = `finished_at - durationSeconds` (el registro local no
 *   guarda una hora de inicio explícita — decisión aprobada de la fase).
 * - Campos numéricos: redondeados a entero y clampados a 0 (el backend exige
 *   `integer >= 0`; `durationSeconds` local puede venir como float).
 * - `workout_id` siempre `null`: una rutina del frontend NO es un `Workout`
 *   backend (dominios independientes, sin conversión).
 *
 * NO incluye `points`/`amount`/`user_id`: el backend deriva el monto y toma
 * el usuario del token. `streak` SÍ se envía como hecho de sesión (mismo
 * criterio de confianza que `sets`/`exercises`): es la racha local del
 * usuario en el momento de terminar el entreno, para que `PointRules`
 * pueda aplicar el mismo bono que `computeWorkoutPoints` en el frontend.
 */
export function buildActivityPayload(activity, now = new Date(), streak = 0) {
  const durationSeconds = Math.max(0, Math.round(Number(activity?.durationSeconds) || 0));
  const finishedAt = now instanceof Date ? now : new Date(now);
  const startedAt = new Date(finishedAt.getTime() - durationSeconds * 1000);
  return {
    workout_id: null,
    routine_label: activity?.routine ?? null,
    duration_seconds: durationSeconds,
    sets_completed: Math.max(0, Math.round(Number(activity?.sets) || 0)),
    exercises_completed: Math.max(0, Math.round(Number(activity?.exercises) || 0)),
    streak: Math.max(0, Math.round(Number(streak) || 0)),
    started_at: startedAt.toISOString(),
    finished_at: finishedAt.toISOString(),
  };
}

/** POST /me/activities → { activity } (201). Requiere token. 422 si la validación falla. */
export function apiCreateActivity(token, payload) {
  return apiFetch("/me/activities", { method: "POST", body: payload, token });
}

/** GET /me/activities → { activities: [...] } (200, más recientes primero). Requiere token. */
export function apiGetActivities(token) {
  return apiFetch("/me/activities", { token });
}

/**
 * GET /me/points → { balance, transactions, next_cursor, has_more } (200).
 * `balance` = saldo autoritativo (SUM de todo el ledger del usuario), NO la
 * suma de la página. `transactions` es una página del ledger (A2, orden
 * `created_at DESC, id DESC`). Pasar `{ cursor }` para la siguiente página
 * (el `next_cursor` de la respuesta anterior); opcional `{ limit }` (1..100).
 * Requiere token.
 */
export function apiGetPoints(token, { cursor, limit } = {}) {
  const qs = new URLSearchParams();
  if (cursor) qs.set("cursor", cursor);
  if (limit) qs.set("limit", String(limit));
  const suffix = qs.toString() ? `?${qs}` : "";
  return apiFetch(`/me/points${suffix}`, { token });
}

// ------------------------------------------------------------------
// CHECK-IN — WRITE-THROUGH (COPIA SOMBRA)
// ------------------------------------------------------------------
// Igual que las actividades: LocalStorage sigue siendo la fuente visible
// (puntos, racha, `checkins[]`). El backend registra el check-in del día y
// acredita un `checkin` (+20, monto fijo calculado por el backend) en el
// mismo ledger. El cliente no envía cuerpo: `user_id` sale del token, el
// monto de `PointRules::CHECKIN`. Un fallo del POST/PATCH no afecta nada
// local — sin reintento ni cola. La racha NO se toca en el backend.

/** POST /me/check-ins → { check_in } (201). Requiere token. 422 si ya hay check-in hoy. */
export function apiCheckIn(token) {
  return apiFetch("/me/check-ins", { method: "POST", token });
}

/** PATCH /me/check-ins/today/check-out → { check_in } (200). Requiere token. 404 si no hay check-in hoy; 422 si ya hizo check-out. */
export function apiCheckOut(token) {
  return apiFetch("/me/check-ins/today/check-out", { method: "PATCH", token });
}

/** GET /me/check-ins → { check_ins: [...] } (200, más recientes primero). Requiere token. */
export function apiGetCheckIns(token) {
  return apiFetch("/me/check-ins", { token });
}

// ------------------------------------------------------------------
// RETOS DIARIOS — WRITE-THROUGH (COPIA SOMBRA)
// ------------------------------------------------------------------
// El cliente solo envía `challenge_id` + `challenge_date` (el día local que
// usa `Challenges.jsx`). El backend calcula el `reward` desde sus propias
// reglas (`ChallengeRules`) y valida que el reto es uno de los 3 del día;
// NO verifica que el reto se completó (eso sigue en el frontend). Nunca se
// envía `reward`/`points`/`amount`/`user_id`. Un fallo no afecta nada local.

/** POST /me/challenge-claims → { challenge_claim } (201). Requiere token. 422 si no es reto del día, ya reclamado o fecha futura. */
export function apiClaimChallenge(token, challengeId, challengeDate) {
  return apiFetch("/me/challenge-claims", {
    method: "POST",
    body: { challenge_id: challengeId, challenge_date: challengeDate },
    token,
  });
}

/** GET /me/challenge-claims → { challenge_claims: [...] } (200, más recientes primero). Requiere token. */
export function apiGetChallengeClaims(token) {
  return apiFetch("/me/challenge-claims", { token });
}

// ------------------------------------------------------------------
// PREMIOS — WRITE-THROUGH (COPIA SOMBRA)
// ------------------------------------------------------------------
// El cliente envía `prize_id` + `reward_uid` (el `uid` local del reward ya
// creado, usado solo como clave de idempotencia ante un reintento — NUNCA
// para impedir canjear el mismo premio otra vez). El backend calcula el
// `cost` desde sus propias reglas (`RewardRules`) y valida el saldo contra
// SU PROPIO ledger; NO verifica la condición de desbloqueo (rango, puntos,
// duelos) — eso sigue en el frontend. Nunca se envía `cost`/`points`/
// `amount`/`user_id`. Un fallo (incluido 422 por saldo insuficiente en el
// ledger backend, p.ej. por puntos de duelos que el backend no conoce) no
// afecta nada local — mismo criterio best-effort que Activity/CheckIn/Challenge.

/** POST /me/reward-claims → { reward_claim } (201). Requiere token. 422 si prize_id no existe, ya se canjeó ese reward_uid, o el saldo backend no alcanza. */
export function apiClaimReward(token, prizeId, rewardUid) {
  return apiFetch("/me/reward-claims", {
    method: "POST",
    body: { prize_id: prizeId, reward_uid: rewardUid },
    token,
  });
}

/** GET /me/reward-claims → { reward_claims: [...] } (200, más recientes primero). Requiere token. */
export function apiGetRewardClaims(token) {
  return apiFetch("/me/reward-claims", { token });
}

// ------------------------------------------------------------------
// RACHA (STREAK) — LECTURA AUTORITATIVA DEL BACKEND
// ------------------------------------------------------------------
// El backend calcula la racha SOLO desde `check_ins` (día calendario;
// consecutivos incrementan, un día perdido rompe). Solo lectura: NO
// reemplaza todavía el `streak` local del frontend — queda disponible
// para el futuro flip de autoridad.

/** GET /me/streak → { current_streak, longest_streak } (200). Requiere token. */
export function apiGetStreak(token) {
  return apiFetch("/me/streak", { token });
}

// ------------------------------------------------------------------
// REGISTRAR MI GIMNASIO (onboarding B2B)
// ------------------------------------------------------------------
// El usuario solicita registrar un gimnasio; un Admin BIAFYT aprueba o
// rechaza. Al aprobar, el backend crea Gym + sede principal + un
// `GymAssignment(role=gym_admin, active)` para el solicitante — que la app
// Gym Web (`gym.<dominio>`) deriva de `GET /me/gym-assignments`, sin que
// esta app tenga que hacer nada más. El solicitante NUNCA decide el
// resultado ni se autoasigna un rol: solo envía `gym_name` / `branch_name` /
// `applicant_message`.

/**
 * POST /me/gym-registration-request → { gym_registration_request } (201).
 * 422 si falta gym_name/branch_name o ya hay una solicitud `pending`.
 */
export function apiCreateGymRegistrationRequest(token, { gymName, branchName, applicantMessage }) {
  return apiFetch("/me/gym-registration-request", {
    method: "POST",
    body: { gym_name: gymName, branch_name: branchName, applicant_message: applicantMessage || null },
    token,
  });
}

/** GET /me/gym-registration-request → { gym_registration_requests: [...] } (200, más recientes primero). */
export function apiGetGymRegistrationRequests(token) {
  return apiFetch("/me/gym-registration-request", { token });
}

// ------------------------------------------------------------------
// RELACIÓN COACH ↔ ATLETA — lado del atleta (slice D-CLIENT-COACH)
// ------------------------------------------------------------------
// El coach envía la solicitud desde su propia app (`frontend-couch`); esa
// operación (POST) NO se expone aquí. En esta app el atleta solo ve las
// solicitudes entrantes, las acepta o las rechaza, y ve de forma pasiva
// el/los coach(es) que ya lo entrenan. Endpoints ya existentes en
// `backend/routes/api.php` — ninguno nuevo.

/** GET /me/coach-relationships → { coach_relationships: [...] } (200). Cada fila trae `viewer_role` ("coach"|"athlete") y `status`. */
export function apiGetCoachRelationships(token) {
  return apiFetch("/me/coach-relationships", { token });
}

/** POST /me/coach-relationships/{id}/accept → { coach_relationship } (200). Solo el atleta objetivo; 422 si no está `pending`. */
export function apiAcceptCoachRelationship(token, id) {
  return apiFetch(`/me/coach-relationships/${id}/accept`, { method: "POST", token });
}

/** DELETE /me/coach-relationships/{id} → 204. El atleta rechaza una `pending` o termina una `active`; 422 si la transición no es válida. */
export function apiRevokeCoachRelationship(token, id) {
  return apiFetch(`/me/coach-relationships/${id}`, { method: "DELETE", token });
}

/**
 * GET /me/programs → { programs: [{ id, name, reference_gym, created_by, imported_at, days: [...] }] } (200).
 * Incluye las rutinas que un coach creó para este atleta: son las que traen
 * `created_by` != null. LocalStorage sigue siendo la fuente de verdad de las
 * rutinas PROPIAS del atleta; esto es solo lectura de lo que envía el coach.
 * `imported_at` != null = el atleta ya la copió a sus rutinas locales (deja
 * de aparecer en "DE MI COACH").
 */
export function apiGetPrograms(token) {
  return apiFetch("/me/programs", { token });
}

/**
 * POST /me/programs/{id}/import → { program } (200). Marca una rutina del
 * coach como copiada a las rutinas locales del atleta: persistente y por
 * atleta (`imported_at`), sin borrar la rutina del coach. Idempotente.
 * 422 si el programa no es del coach; 404 si no es del atleta.
 */
export function apiImportProgram(token, id) {
  return apiFetch(`/me/programs/${id}/import`, { method: "POST", token });
}

/**
 * GET /me/gym-assignments → { gym_assignments: [{ id, role, gym:{id,name}, branch }] } (200).
 * Solo lectura, aditiva: sirve para saber el gym de backend del atleta y
 * PRIORIZAR el equipamiento disponible en el picker de rutinas. NO sustituye
 * al `gymId` mock de LocalStorage (check-in / GPS / onboarding lo siguen usando).
 */
export function apiGetGymAssignments(token) {
  return apiFetch("/me/gym-assignments", { token });
}

/** GET /gyms/{gymId}/equipment → { equipment: [{ id, slug, name, ...campos educativos, available }] } (200, público). Inventario de un gym. */
export function apiGetGymEquipment(gymId) {
  return apiFetch(`/gyms/${gymId}/equipment`);
}

// ------------------------------------------------------------------
// DUELOS REALES (roadmap 3b)
// ------------------------------------------------------------------
// Los participantes son User reales del backend. El retador crea, el rival
// acepta, ambos ejecutan la MISMA rutina y el backend resuelve el ganador
// cara a cara (`DuelRules`). `stake` refleja la apuesta local de puntos:
// el backend escribe una copia sombra en el ledger (`duel_won`/`duel_lost`,
// 5ª fuente) al finalizar, pero el saldo VISIBLE sigue siendo LocalStorage
// (sin flip 3c). `challenger_user_id`/`winner_user_id`/`status` nunca se
// envían desde el cliente.

/** GET /me/duels → { duels: [...] } (200, más recientes primero). Requiere token. */
export function apiGetDuels(token) {
  return apiFetch("/me/duels", { token });
}

/** GET /me/duels/opponents → { opponents: [{ id, name, duels_won, duels_lost }] } (200). Rivales reales del mismo gym. */
export function apiGetDuelOpponents(token) {
  return apiFetch("/me/duels/opponents", { token });
}

/** POST /me/duels → { duel } (201). 422 si rival inválido, sin gym común, modalidad/apuesta inválida o ya hay un duelo abierto con ese usuario. */
export function apiCreateDuel(token, { opponentUserId, modality, stake }) {
  return apiFetch("/me/duels", {
    method: "POST",
    body: { opponent_user_id: opponentUserId, modality, stake },
    token,
  });
}

/** GET /me/duels/{id} → { duel } (200). 404 si no participas. */
export function apiGetDuel(token, id) {
  return apiFetch(`/me/duels/${id}`, { token });
}

/** POST /me/duels/{id}/accept → { duel } (200). Solo el rival, solo si está pendiente. */
export function apiAcceptDuel(token, id) {
  return apiFetch(`/me/duels/${id}/accept`, { method: "POST", token });
}

/** POST /me/duels/{id}/reject → { duel } (200). Solo el rival, solo si está pendiente. */
export function apiRejectDuel(token, id) {
  return apiFetch(`/me/duels/${id}/reject`, { method: "POST", token });
}

/** POST /me/duels/{id}/cancel → { duel } (200). Solo el retador, mientras no haya terminado. */
export function apiCancelDuel(token, id) {
  return apiFetch(`/me/duels/${id}/cancel`, { method: "POST", token });
}

/**
 * POST /me/duels/{id}/run → { duel } (200). Envía la ejecución del participante
 * autenticado. Cuando ambos han enviado, el backend resuelve (finished con
 * ganador, o unvalidated si alguna ejecución no fue competitiva).
 */
export function apiSubmitDuelRun(token, id, run) {
  return apiFetch(`/me/duels/${id}/run`, {
    method: "POST",
    body: {
      duration_seconds: Math.max(0, Math.round(run.durationSeconds ?? 0)),
      exercises_completed: Math.max(0, Math.round(run.exercisesCompleted ?? 0)),
      sets_completed: Math.max(0, Math.round(run.setsCompleted ?? 0)),
      valid_reps: Math.max(0, Math.round(run.validReps ?? 0)),
      consistency: Math.min(100, Math.max(0, Math.round(run.consistency ?? 0))),
      penalties: Math.max(0, Math.round(run.penalties ?? 0)),
      competitive_eligible: Boolean(run.competitiveEligible),
    },
    token,
  });
}

/**
 * GET /equipment → { equipment: [{ id, slug, name, purpose, primary_muscle,
 * secondary_muscles, movement, level, tips, mistakes, related, art, ... }] }
 * (200, público). Catálogo global de máquinas — solo items activos. Fuente
 * de verdad de `screens/Machines.jsx` y `utils/analytics.js`; ver
 * `data/equipmentCatalog.js`. `data/machines.js` es solo el fallback offline.
 */
export function apiGetEquipment() {
  return apiFetch("/equipment");
}
