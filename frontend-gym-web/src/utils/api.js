/**
 * BIAFYT GYM WEB — CLIENTE API
 * ---------------------------------------------------------------
 * `fetch` nativo contra el backend Laravel/Sanctum, sin dependencias
 * nuevas. Mismo cliente base que frontend-usuario / frontend-couch.
 *
 * Cubre: autenticación (contrato `/auth/*` existente) y el slice Gym MVP
 * (D-GYM) — administración de member/coach y snapshot sombra de un miembro,
 * todo gateado en backend por un `GymAssignment(role=gym_admin)` activo en
 * el gym de la ruta (ver backend/app/Http/Controllers/Api/V1/GymAdminController.php).
 *
 * La URL base viene de `VITE_API_BASE_URL` (ver `.env.example`) e incluye
 * el prefijo de versión, p.ej. "http://localhost:8000/api/v1".
 */

const BASE_URL = import.meta.env.VITE_API_BASE_URL || "";

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
    /* respuesta sin cuerpo JSON (204 o error sin payload) */
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
// AUTENTICACIÓN (Sanctum) — contrato existente, sin cambios
// ------------------------------------------------------------------

/** POST /auth/register → { user, token } (201). */
export function apiRegister({ name, email, password }) {
  return apiFetch("/auth/register", { method: "POST", body: { name, email, password } });
}

/** POST /auth/login → { user, token } (200). 422 (bajo `email`) si las credenciales fallan. */
export function apiLogin({ email, password }) {
  return apiFetch("/auth/login", { method: "POST", body: { email, password } });
}

/** POST /auth/logout → { message } (200). Requiere token. */
export function apiLogout(token) {
  return apiFetch("/auth/logout", { method: "POST", token });
}

/** GET /auth/me → { user } (200). 401 si el token es inválido/revocado. */
export function apiMe(token) {
  return apiFetch("/auth/me", { token });
}

// ------------------------------------------------------------------
// GYM MVP (D-GYM) — administración de member/coach + snapshot de miembro
// ------------------------------------------------------------------
// Todos los endpoints `/me/gym/{gym}/...` responden 404 si el usuario
// autenticado NO es gym_admin activo de ese gym (mismo anti-IDOR que el
// resto de la API). El gym_id sale SIEMPRE de la ruta, nunca del body.

/** GET /me/gym-assignments → { gym_assignments: [{ id, role, gym{id,name}, branch{id,name}|null }] }. Solo las ACTIVAS del caller. */
export function apiGetGymAssignments(token) {
  return apiFetch("/me/gym-assignments", { token });
}

/** GET /gyms (público) → { gyms: [{ id, name, branches: [{id,name}] }] }. Catálogo completo — se usa para las sedes del gym administrado. */
export function apiGetGyms() {
  return apiFetch("/gyms");
}

/** GET /me/gym/{gymId}/members → { members: [{ id, user{id,name}, role, branch{id,name}|null, since }] }. Solo assignments `member` activos. */
export function apiGetGymMembers(token, gymId) {
  return apiFetch(`/me/gym/${gymId}/members`, { token });
}

/** GET /me/gym/{gymId}/coaches → { coaches: [...] }. Solo assignments `coach` activos. */
export function apiGetGymCoaches(token, gymId) {
  return apiFetch(`/me/gym/${gymId}/coaches`, { token });
}

/** GET /me/gym/{gymId}/user-lookup?email= → { user: { id, name } }. 404 si no hay match exacto. Nunca devuelve el email. */
export function apiLookupGymUser(token, gymId, email) {
  return apiFetch(`/me/gym/${gymId}/user-lookup?email=${encodeURIComponent(email)}`, { token });
}

/**
 * POST /me/gym/{gymId}/assignments → { assignment } (201 / 200 al reactivar).
 * Body `{ user_id, role: "member"|"coach", branch_id?: number|null }`.
 * 422 si role∉{member,coach}, branch de otro gym, member sin branch, o duplicado activo.
 */
export function apiCreateGymAssignment(token, gymId, payload) {
  return apiFetch(`/me/gym/${gymId}/assignments`, { method: "POST", body: payload, token });
}

/** DELETE /me/gym/{gymId}/assignments/{assignmentId} → 204. Solo assignments member|coach del gym; revocar = status inactive. 404 si ajeno/gym_admin/ya inactivo. */
export function apiRevokeGymAssignment(token, gymId, assignmentId) {
  return apiFetch(`/me/gym/${gymId}/assignments/${assignmentId}`, { method: "DELETE", token });
}

/**
 * GET /me/gym/{gymId}/members/{userId} → { athlete, profile|null, activity_summary, streak, points }.
 * Doble gate: caller = gym_admin del gym Y target = member activo del gym. 404 si falla cualquiera.
 * Datos de calidad SOMBRA (mismo snapshot que Coach MVP). No expone email.
 */
export function apiGetGymMemberDetail(token, gymId, userId) {
  return apiFetch(`/me/gym/${gymId}/members/${userId}`, { token });
}

// ------------------------------------------------------------------
// INVENTARIO DE GYM (slice D-GYM-INVENTORY) — solo gym_admin del gym
// ------------------------------------------------------------------
// El catálogo de equipamiento es GLOBAL (`GET /equipment`); el gym_admin
// solo marca qué items del catálogo existen en su gym y si están
// disponibles. No crea items nuevos.

/**
 * GET /me/gym/{gymId}/equipment → { equipment: [{ id, slug, name, in_inventory, available }] }.
 * Todo el catálogo global anotado con el estado en ESE gym (gate gym_admin activo → 404 si no).
 */
export function apiGetGymEquipment(token, gymId) {
  return apiFetch(`/me/gym/${gymId}/equipment`, { token });
}

/**
 * PUT /me/gym/{gymId}/equipment/{equipmentId} → { equipment } (201 al añadir / 200 al actualizar).
 * Body `{ available: boolean }` (por defecto true = "lo tenemos"). Idempotente.
 */
export function apiSetGymEquipment(token, gymId, equipmentId, available) {
  return apiFetch(`/me/gym/${gymId}/equipment/${equipmentId}`, {
    method: "PUT",
    body: { available },
    token,
  });
}

/** DELETE /me/gym/{gymId}/equipment/{equipmentId} → 204. Quita el item del inventario del gym (no toca el catálogo global). */
export function apiRemoveGymEquipment(token, gymId, equipmentId) {
  return apiFetch(`/me/gym/${gymId}/equipment/${equipmentId}`, { method: "DELETE", token });
}

// ------------------------------------------------------------------
// SOLICITUDES DE EQUIPAMIENTO AL CATÁLOGO GLOBAL (slice D-GYM-EQUIPMENT-REQUEST)
// ------------------------------------------------------------------
// El gym NO puede tocar el catálogo global `equipment`. Si necesita una
// máquina que no existe, la solicita; un BIAFYT Admin la revisa. El gym
// puede editar y reenviar mientras esté `pending`/`changes_requested`.

/** GET /me/gym/{gymId}/equipment-requests → { equipment_requests: [{ id, status, name, ..., review_note, events, resulting_equipment }] }. */
export function apiGetGymEquipmentRequests(token, gymId) {
  return apiFetch(`/me/gym/${gymId}/equipment-requests`, { token });
}

/**
 * POST /me/gym/{gymId}/equipment-requests → { equipment_request } (201). Estado `pending`.
 * Body `{ name, brand?, model?, description?, category?, photo_urls?: string[] }`.
 */
export function apiCreateGymEquipmentRequest(token, gymId, payload) {
  return apiFetch(`/me/gym/${gymId}/equipment-requests`, { method: "POST", body: payload, token });
}

/**
 * PUT /me/gym/{gymId}/equipment-requests/{id} → { equipment_request } (200).
 * Solo si está `pending`/`changes_requested`. Si estaba `changes_requested`,
 * vuelve a `pending` (reenvío). 422 en cualquier otro estado.
 */
export function apiUpdateGymEquipmentRequest(token, gymId, id, payload) {
  return apiFetch(`/me/gym/${gymId}/equipment-requests/${id}`, { method: "PUT", body: payload, token });
}
