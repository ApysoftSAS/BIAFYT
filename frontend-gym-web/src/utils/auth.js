/**
 * BIAFYT COUCH — VALIDACIÓN DE FORMULARIO DE ACCESO
 * ---------------------------------------------------------------
 * Solo validación del lado cliente (formato de correo / requisitos de
 * contraseña). La verificación real de credenciales vive en el backend
 * Laravel/Sanctum (`POST /auth/register`, `POST /auth/login`, ver
 * `utils/api.js`). La app Couch no usa biometría (a diferencia de
 * `frontend-usuario`).
 */

export function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
}

export function passwordIssues(password) {
  const issues = [];
  if (password.length < 8) issues.push("Al menos 8 caracteres");
  if (!/[a-zA-Z]/.test(password)) issues.push("Al menos una letra");
  if (!/[0-9]/.test(password)) issues.push("Al menos un número");
  return issues;
}
