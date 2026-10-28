/**
 * BIAFYT — VALIDACIÓN Y CÁLCULO DE DESCUENTOS (Fase 2)
 * Lógica pura sobre el catálogo de data/discountCodes.js. No toca
 * AppContext ni LocalStorage — el registro de usos (usedCount local)
 * vive en state.identity.discountUsage (ver AppContext.selectPlan()).
 */
import { findDiscountCode, DISCOUNT_TYPE } from "../data/discountCodes.js";

export const DISCOUNT_ERROR = {
  NOT_FOUND: "not_found",
  INACTIVE: "inactive",
  EXPIRED: "expired",
  EXHAUSTED: "exhausted",
  PLAN_MISMATCH: "plan_mismatch",
};

const ERROR_MESSAGES = {
  [DISCOUNT_ERROR.NOT_FOUND]: "Ese código no existe.",
  [DISCOUNT_ERROR.INACTIVE]: "Ese código ya no está activo.",
  [DISCOUNT_ERROR.EXPIRED]: "Ese código expiró.",
  [DISCOUNT_ERROR.EXHAUSTED]: "Ese código agotó sus usos disponibles.",
  [DISCOUNT_ERROR.PLAN_MISMATCH]: "Ese código no aplica a este plan.",
};

export function discountErrorMessage(reason) {
  return ERROR_MESSAGES[reason] || "Código no válido.";
}

/**
 * Valida un código contra un plan y los usos registrados localmente
 * (usageByCode = state.identity.discountUsage). Sin backend, esto es únicamente
 * una demo local — no impide que el mismo código se reutilice entre
 * distintos usuarios/dispositivos.
 */
export function validateDiscountCode(code, planId, usageByCode = {}) {
  const discount = findDiscountCode(code);
  if (!discount) return { valid: false, reason: DISCOUNT_ERROR.NOT_FOUND };
  if (!discount.active) return { valid: false, reason: DISCOUNT_ERROR.INACTIVE };
  if (discount.expiresAt && new Date(discount.expiresAt).getTime() < Date.now()) {
    return { valid: false, reason: DISCOUNT_ERROR.EXPIRED };
  }
  const usedLocally = usageByCode[discount.code] || 0;
  const totalUses = discount.usedCount + usedLocally;
  if (discount.maxUses != null && totalUses >= discount.maxUses) {
    return { valid: false, reason: DISCOUNT_ERROR.EXHAUSTED };
  }
  if (discount.planIds.length > 0 && !discount.planIds.includes(planId)) {
    return { valid: false, reason: DISCOUNT_ERROR.PLAN_MISMATCH };
  }
  return { valid: true, discount };
}

/** El precio final nunca es negativo (se limita a 0). */
export function calculateFinalPrice(price, discount) {
  if (!discount) return { originalPrice: price, discountAmount: 0, finalPrice: price };
  const rawDiscount = discount.type === DISCOUNT_TYPE.PERCENT ? (price * discount.value) / 100 : discount.value;
  const finalPrice = Math.max(0, Math.round(price - rawDiscount));
  return { originalPrice: price, discountAmount: price - finalPrice, finalPrice };
}
