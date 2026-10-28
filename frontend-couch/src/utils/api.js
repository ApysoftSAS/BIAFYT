/**
 * BIAFYT COUCH — CLIENTE API
 * ---------------------------------------------------------------
 * Acceso al backend Laravel (Sanctum, tokens Bearer) con `fetch`
 * nativo — sin dependencias nuevas. Mismo cliente base que
 * `frontend-usuario/src/utils/api.js`, recortado a lo que la app
 * Couch usa (Auth + relaciones coach↔atleta).
 *
 * La URL base viene de `VITE_API_BASE_URL` (ver `.env.example`) e
 * incluye el prefijo de versión, p.ej. "http://localhost:8000/api/v1".
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
  if (error.status === 401) return "Tu sesión expiró. Vuelve a iniciar sesión.";
  if (error.errors) {
    const first = Object.values(error.errors)[0];
    if (Array.isArray(first) && first.length) return first[0];
  }
  return error.message || fallback;
}

// ------------------------------------------------------------------
// AUTENTICACIÓN (Sanctum)
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
// RELACIONES COACH ↔ ATLETA (consentimiento)
// ------------------------------------------------------------------
// El backend (CoachAthleteRelationshipController) es hoy la ÚNICA
// superficie del rol coach: request/accept/revoke de una relación de
// consentimiento. No existe endpoint para leer el entrenamiento de un
// atleta ni para auto-asignarse el rol `coach` (esto último se concede
// hoy directamente en la BD). Cada relación trae `viewer_role`
// ("coach" | "athlete") para saber de qué lado está el usuario.

/** GET /me/coach-relationships → { coach_relationships: [...] } (200). Requiere token. */
export function apiGetCoachRelationships(token) {
  return apiFetch("/me/coach-relationships", { token });
}

/**
 * POST /me/coach-relationships → { coach_relationship } (201). Requiere token.
 * El usuario autenticado es siempre el coach. 422 si: no tiene rol coach
 * activo, `athlete_user_id` es él mismo, o ya existe una relación
 * pending/active con ese atleta.
 */
export function apiRequestAthlete(token, athleteUserId) {
  return apiFetch("/me/coach-relationships", {
    method: "POST",
    body: { athlete_user_id: athleteUserId },
    token,
  });
}

/** POST /me/coach-relationships/{id}/accept → { coach_relationship } (200). Solo el atleta objetivo; 422 si no está pending. */
export function apiAcceptCoachRelationship(token, id) {
  return apiFetch(`/me/coach-relationships/${id}/accept`, { method: "POST", token });
}

/** DELETE /me/coach-relationships/{id} → 204. Coach o atleta según la transición válida; 422 si no se puede revocar en su estado actual. */
export function apiRevokeCoachRelationship(token, id) {
  return apiFetch(`/me/coach-relationships/${id}`, { method: "DELETE", token });
}

// ------------------------------------------------------------------
// COACH MVP — INFORMACIÓN DEL ATLETA + NOTAS
// ------------------------------------------------------------------
// Solo accesible mientras exista una relación coach↔atleta ACTIVA
// (el backend responde 404 si no la hay). Los datos del atleta son de
// calidad "sombra": el perfil es autoritativo, pero actividad/puntos/
// racha se llenan por el write-through best-effort de la app de usuario
// y pueden tener huecos. No hay autoridad nueva de puntos.

/** GET /me/coach/athletes → { athletes: [{ athlete:{id,name}, since }] } (200). */
export function apiGetCoachAthletes(token) {
  return apiFetch("/me/coach/athletes", { token });
}

/**
 * GET /me/coach/athletes/{id} → { athlete, profile|null, activity_summary,
 * streak, points } (200). 404 si no hay relación activa con ese atleta.
 */
export function apiGetAthleteDetail(token, athleteUserId) {
  return apiFetch(`/me/coach/athletes/${athleteUserId}`, { token });
}

/** GET /me/coach/athletes/{id}/notes → { notes: [{id,body,created_at,updated_at}] } (200). */
export function apiGetAthleteNotes(token, athleteUserId) {
  return apiFetch(`/me/coach/athletes/${athleteUserId}/notes`, { token });
}

/** POST /me/coach/athletes/{id}/notes → { note } (201). Body `{ body }`; 422 si está vacío. */
export function apiCreateAthleteNote(token, athleteUserId, body) {
  return apiFetch(`/me/coach/athletes/${athleteUserId}/notes`, { method: "POST", body: { body }, token });
}

/** DELETE /me/coach/notes/{id} → 204. Solo el coach autor; 404 si no es suya. */
export function apiDeleteAthleteNote(token, noteId) {
  return apiFetch(`/me/coach/notes/${noteId}`, { method: "DELETE", token });
}

// ------------------------------------------------------------------
// COACH — RUTINAS DEL ATLETA (slice D-COACH-PROGRAMS)
// ------------------------------------------------------------------
// El coach crea/edita programas PARA un atleta con relación ACTIVA. Las
// filas son del atleta (`user_id`), la autoría es del coach. El gym de
// referencia es opcional y debe ser un gym del COACH; el atleta no
// necesita pertenecer a él. GymAssignment NO autoriza esto: la relación
// coach↔atleta es la única puerta.

/** GET /me/coach/athletes/{id}/programs → { programs: [...] } (200). 404 sin relación activa. */
export function apiGetAthletePrograms(token, athleteUserId) {
  return apiFetch(`/me/coach/athletes/${athleteUserId}/programs`, { token });
}

/**
 * POST /me/coach/athletes/{id}/programs → { program } (201).
 * Body `{ name, reference_gym_id?, days: [{ name, position, exercises: [{ exercise_id, position }] }] }`.
 * 422 si un ejercicio usa equipo no disponible en el gym de referencia, o si el gym no es del coach.
 */
export function apiCreateAthleteProgram(token, athleteUserId, payload) {
  return apiFetch(`/me/coach/athletes/${athleteUserId}/programs`, { method: "POST", body: payload, token });
}

/** PUT /me/coach/athletes/{id}/programs/{programId} → { program } (200). Reemplaza el contenido completo. */
export function apiUpdateAthleteProgram(token, athleteUserId, programId, payload) {
  return apiFetch(`/me/coach/athletes/${athleteUserId}/programs/${programId}`, { method: "PUT", body: payload, token });
}

/** DELETE /me/coach/athletes/{id}/programs/{programId} → 204. 404 si no es de autoría del coach. */
export function apiDeleteAthleteProgram(token, athleteUserId, programId) {
  return apiFetch(`/me/coach/athletes/${athleteUserId}/programs/${programId}`, { method: "DELETE", token });
}

// --- Catálogo global + inventario de gym (lectura pública) ---

/** GET /exercises → { exercises: [{ id, slug, name, type, machine_id }] }. Catálogo global. */
export function apiGetExerciseCatalog() {
  return apiFetch("/exercises");
}

/** GET /me/gym-assignments → { gym_assignments: [{ id, role, gym{id,name}, branch }] }. Gyms del coach (para el gym de referencia). */
export function apiGetGymAssignments(token) {
  return apiFetch("/me/gym-assignments", { token });
}

/** GET /gyms/{gymId}/equipment → { equipment: [{ id, slug, name, available }] }. Inventario disponible de un gym (público). */
export function apiGetGymEquipment(gymId) {
  return apiFetch(`/gyms/${gymId}/equipment`);
}
