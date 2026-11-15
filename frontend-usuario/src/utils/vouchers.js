/** Lógica pura de la pantalla Vouchers del atleta (test en `vouchers.test.js`). */

export const STATUS = {
  issued: { label: "Vigente", tone: "success" },
  redeemed: { label: "Usado", tone: "accent" },
  revoked: { label: "Anulado", tone: "error" },
  expired: { label: "Vencido", tone: "warning" },
};

export function benefitText(v) {
  if (v.benefit_type === "percent") return `${v.benefit_value}% de descuento`;
  if (v.benefit_type === "fixed") return `Descuento de ${v.benefit_value}`;
  return v.benefit_description;
}

/** Quién da el beneficio: el gimnasio, el coach o (por defecto) BIAFYT. */
export const issuerName = (v) => v.gym?.name ?? v.coach?.name ?? "BIAFYT";

/** "2026-11-21T04:59:59Z" → "20 nov 2026" en la zona del dispositivo (el voucher vence al final del día del gimnasio). */
export function validUntil(iso) {
  try {
    return new Date(iso).toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" }).replaceAll(".", "");
  } catch {
    return "";
  }
}

/** Errores del backend al canjear un código → mensaje en español. */
const CLAIM_ERRORS = {
  "This code is not valid for you.": "Ese código no es válido para ti. Revisa que lo hayas escrito bien y que sea de tu gimnasio.",
  "You already claimed this code.": "Ya canjeaste este código.",
  "This code has no claims left.": "Este código ya no tiene cupos disponibles.",
  "This code has expired.": "Este código ya venció.",
  "This code is no longer available.": "Este código ya no está disponible.",
};

export function claimErrorMessage(error, fallback = "No se pudo canjear el código.") {
  const first = Object.values(error?.errors ?? {})[0]?.[0];
  if (first && CLAIM_ERRORS[first]) return CLAIM_ERRORS[first];
  if (error?.status === 429) return "Demasiados intentos. Espera un minuto e inténtalo de nuevo.";
  if (error?.status === 0) return "No pudimos conectar con el servidor.";
  return first || fallback;
}
