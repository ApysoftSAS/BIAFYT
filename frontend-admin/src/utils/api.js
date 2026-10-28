/**
 * BIAFYT ADMIN — CLIENTE API
 * ---------------------------------------------------------------
 * `fetch` nativo contra el backend Laravel/Sanctum (tokens Bearer), sin
 * dependencias nuevas. Mismo cliente base que las demás apps.
 *
 * Cubre: autenticación (contrato `/auth/*` existente) y la administración de
 * plataforma (`/admin/*`). Todos los endpoints `/admin/*` están gateados en
 * el backend por `User::is_platform_admin` (404 para cualquier otro — la
 * superficie no es descubrible).
 *
 * La URL base viene de `VITE_API_BASE_URL` (ver `.env.example`) e incluye el
 * prefijo de versión, p.ej. "http://localhost:8000/api/v1".
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
  if (error.status === 404) return "No encontrado o sin permiso.";
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

/** GET /auth/me → { user } (200). `user.is_platform_admin` decide el acceso. */
export function apiMe(token) {
  return apiFetch("/auth/me", { token });
}

// ------------------------------------------------------------------
// ADMINISTRACIÓN DE PLATAFORMA (BIAFYT Admin)
// ------------------------------------------------------------------

/** GET /admin/gym-registration-requests?status= → { gym_registration_requests: [...] } (200). 404 si no eres platform admin. */
export function apiGetGymRegistrationRequests(token, status) {
  const q = status ? `?status=${encodeURIComponent(status)}` : "";
  return apiFetch(`/admin/gym-registration-requests${q}`, { token });
}

/** GET /admin/gym-registration-requests/{id} → { gym_registration_request } (200). */
export function apiGetGymRegistrationRequest(token, id) {
  return apiFetch(`/admin/gym-registration-requests/${id}`, { token });
}

/** POST /admin/gym-registration-requests/{id}/approve → { gym_registration_request } (200, idempotente). Body `{ review_note? }`. */
export function apiApproveGymRegistrationRequest(token, id, reviewNote) {
  return apiFetch(`/admin/gym-registration-requests/${id}/approve`, {
    method: "POST",
    body: { review_note: reviewNote || null },
    token,
  });
}

/** POST /admin/gym-registration-requests/{id}/reject → { gym_registration_request } (200, idempotente). Body `{ review_note? }`. */
export function apiRejectGymRegistrationRequest(token, id, reviewNote) {
  return apiFetch(`/admin/gym-registration-requests/${id}/reject`, {
    method: "POST",
    body: { review_note: reviewNote || null },
    token,
  });
}

/** GET /admin/gyms → { gyms: [{ id, name, branches, gym_admin_count, coach_count, member_count, created_at }] } (200). */
export function apiGetAdminGyms(token) {
  return apiFetch("/admin/gyms", { token });
}

// ------------------------------------------------------------------
// CATÁLOGO GLOBAL DE EQUIPAMIENTO (BIAFYT Admin)
// ------------------------------------------------------------------
// El único lugar donde se escribe `equipment`. Un gym nunca lo toca.

/** GET /admin/equipment?active= → { equipment: [{ id, slug, name, description, brand, model, category, photo_urls, is_active, gym_count, created_at }] }. */
export function apiAdminListEquipment(token, active) {
  const q = active === undefined ? "" : `?active=${active ? 1 : 0}`;
  return apiFetch(`/admin/equipment${q}`, { token });
}

/** POST /admin/equipment → { equipment } (201). Body `{ name, description?, brand?, model?, category?, photo_urls?, is_active? }`. El slug lo deriva el backend. */
export function apiAdminCreateEquipment(token, payload) {
  return apiFetch("/admin/equipment", { method: "POST", body: payload, token });
}

/** PATCH /admin/equipment/{id} → { equipment } (200). El slug NO es editable. */
export function apiAdminUpdateEquipment(token, id, payload) {
  return apiFetch(`/admin/equipment/${id}`, { method: "PATCH", body: payload, token });
}

// ------------------------------------------------------------------
// SOLICITUDES DE EQUIPAMIENTO DE LOS GYMS (BIAFYT Admin)
// ------------------------------------------------------------------

/** GET /admin/equipment-requests?status=&gym_id= → { equipment_requests: [...] }. */
export function apiAdminListEquipmentRequests(token, { status, gymId } = {}) {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (gymId) params.set("gym_id", gymId);
  const q = params.toString() ? `?${params}` : "";
  return apiFetch(`/admin/equipment-requests${q}`, { token });
}

/** GET /admin/equipment-requests/{id} → { equipment_request } (incluye gym, requester, events con actor). */
export function apiAdminGetEquipmentRequest(token, id) {
  return apiFetch(`/admin/equipment-requests/${id}`, { token });
}

/** POST /admin/equipment-requests/{id}/start-review → { equipment_request }. pending → in_review. */
export function apiAdminStartEquipmentReview(token, id) {
  return apiFetch(`/admin/equipment-requests/${id}/start-review`, { method: "POST", token });
}

/** POST /admin/equipment-requests/{id}/request-changes → { equipment_request }. Body `{ review_note }` (obligatorio). in_review → changes_requested. */
export function apiAdminRequestEquipmentChanges(token, id, reviewNote) {
  return apiFetch(`/admin/equipment-requests/${id}/request-changes`, {
    method: "POST",
    body: { review_note: reviewNote },
    token,
  });
}

/** PATCH /admin/equipment-requests/{id} → { equipment_request }. Corrige la info en sitio (solo in_review). */
export function apiAdminCorrectEquipmentRequest(token, id, payload) {
  return apiFetch(`/admin/equipment-requests/${id}`, { method: "PATCH", body: payload, token });
}

/** POST /admin/equipment-requests/{id}/reject → { equipment_request }. Body `{ review_note? }`. in_review → rejected. */
export function apiAdminRejectEquipmentRequest(token, id, reviewNote) {
  return apiFetch(`/admin/equipment-requests/${id}/reject`, {
    method: "POST",
    body: { review_note: reviewNote || null },
    token,
  });
}

/**
 * POST /admin/equipment-requests/{id}/approve → { equipment_request }. in_review → approved.
 * Body: exactamente uno de `{ equipment_id }` (asociar a uno existente) o
 * `{ create_equipment: true }` (crear uno nuevo). Opcional `review_note`.
 */
export function apiAdminApproveEquipmentRequest(token, id, { equipmentId, createEquipment, reviewNote } = {}) {
  const body = { review_note: reviewNote || null };
  if (equipmentId) body.equipment_id = equipmentId;
  else if (createEquipment) body.create_equipment = true;
  return apiFetch(`/admin/equipment-requests/${id}/approve`, { method: "POST", body, token });
}

// ------------------------------------------------------------------
// PROMOCIONES DE PLATAFORMA (Promotion V1 — descuentos sobre membresías
// Premium de Athlete/Coach/Gym)
// ------------------------------------------------------------------
// Solo lista + creación. Sin edición, eliminación ni agregar reglas después
// de creada: el backend V1 no los soporta.

/** GET /admin/promotions → { promotions: [{ id, code, active, valid_from, valid_until, created_at, rules: [{ id, audience, duration_months, benefit_type, benefit_value }] }] }, más recientes primero. */
export function apiAdminListPromotions(token) {
  return apiFetch("/admin/promotions", { token });
}

/** POST /admin/promotions → { promotion } (201). Body `{ code, active?, valid_from?, valid_until?, rules: [{ audience, duration_months, benefit_type, benefit_value }] }`. El backend normaliza `code` (trim + mayúsculas), exige al menos una regla y rechaza reglas duplicadas para la misma combinación audiencia+duración. */
export function apiAdminCreatePromotion(token, payload) {
  return apiFetch("/admin/promotions", { method: "POST", body: payload, token });
}
