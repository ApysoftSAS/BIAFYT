/**
 * BIAFYT — CÓDIGOS DE DESCUENTO (Fase 2)
 * Catálogo estático de códigos de descuento aplicables a la adquisición
 * simulada de un plan (data/plans.js). Entidad independiente de los
 * códigos de canje de premios (reward.redemptionCode, ver
 * state/AppContext.jsx) — no comparten catálogo ni lógica.
 *
 * planIds: [] aplica a cualquier plan; ["plan-premium"] restringe el
 * código a ese plan únicamente.
 */

export const DISCOUNT_TYPE = {
  PERCENT: "percent",
  FIXED: "fixed",
};

export const discountCodes = [
  {
    code: "SOMA20",
    type: DISCOUNT_TYPE.PERCENT,
    value: 20,
    active: true,
    expiresAt: null,
    maxUses: null,
    usedCount: 0,
    planIds: [],
  },
  {
    code: "PREMIUM15",
    type: DISCOUNT_TYPE.PERCENT,
    value: 15,
    active: true,
    expiresAt: null,
    maxUses: null,
    usedCount: 0,
    planIds: ["plan-premium"],
  },
  {
    code: "SOMA15000",
    type: DISCOUNT_TYPE.FIXED,
    value: 15000,
    active: true,
    expiresAt: null,
    maxUses: null,
    usedCount: 0,
    planIds: [],
  },
  {
    code: "EXPIRADO10",
    type: DISCOUNT_TYPE.PERCENT,
    value: 10,
    active: true,
    expiresAt: "2024-01-01T00:00:00.000Z",
    maxUses: null,
    usedCount: 0,
    planIds: [],
  },
  {
    code: "INACTIVO10",
    type: DISCOUNT_TYPE.PERCENT,
    value: 10,
    active: false,
    expiresAt: null,
    maxUses: null,
    usedCount: 0,
    planIds: [],
  },
  {
    code: "AGOTADO5000",
    type: DISCOUNT_TYPE.FIXED,
    value: 5000,
    active: true,
    expiresAt: null,
    maxUses: 3,
    usedCount: 3,
    planIds: [],
  },
];

export function findDiscountCode(code) {
  if (!code) return null;
  const normalized = code.trim().toUpperCase();
  return discountCodes.find((d) => d.code.toUpperCase() === normalized) || null;
}
