/**
 * BIAFYT GYM — CLIENTE API (foundation)
 * ---------------------------------------------------------------
 * `fetch` nativo contra el backend Laravel/Sanctum, sin dependencias
 * nuevas. Mismo cliente base que frontend-usuario / frontend-couch,
 * recortado a lo ÚNICO que la foundation usa: autenticación.
 *
 * Reutiliza el contrato `/auth/*` que YA existe (ver backend/routes/api.php).
 * NO define endpoints Gym: el dominio Gym está diferido a la fase
 * Coach/Gym (BIAFYT_BUSINESS_CORE.md §46 D8, §47 Fase 5).
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
