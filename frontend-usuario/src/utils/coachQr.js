/**
 * BIAFYT — QR de identidad del atleta (para vincular con un coach)
 * ---------------------------------------------------------------
 * El QR SOLO identifica al atleta por su `user.id` numérico del backend.
 * NO lleva token, secreto ni autorización: es equivalente a que el atleta
 * dicte su ID en voz alta. El coach lo escanea, confirma, y el backend
 * exige lo de siempre (coach autenticado con rol `coach` activo, atleta
 * existente, sin self-request, sin duplicado) + el atleta debe ACEPTAR.
 *
 * Formato canónico: `BIAFYT://athlete/{user_id}`
 * (no había convención previa de deep-links/QR en el repo — se define aquí
 * y se copia a mano a `frontend-couch/src/utils/coachQr.js`, sin monorepo).
 */

const SCHEME_RE = /^BIAFYT:\/\/athlete\/(\d{1,15})\/?$/i;

/** Contenido del QR para un atleta dado. */
export function buildAthleteQr(userId) {
  return `BIAFYT://athlete/${Number(userId)}`;
}

/**
 * Extrae el `athlete_user_id` de un texto escaneado.
 * Acepta el formato canónico o un QR que sea únicamente el número.
 * Devuelve `{ athleteId: number }` o `null` si no es reconocible.
 */
export function parseAthleteQr(text) {
  if (typeof text !== "string") return null;
  const trimmed = text.trim();

  const m = trimmed.match(SCHEME_RE);
  if (m) {
    const id = Number(m[1]);
    return Number.isInteger(id) && id > 0 ? { athleteId: id } : null;
  }

  // Tolerancia: un QR/texto que es solo el ID numérico.
  if (/^\d{1,15}$/.test(trimmed)) {
    const id = Number(trimmed);
    return Number.isInteger(id) && id > 0 ? { athleteId: id } : null;
  }

  return null;
}
