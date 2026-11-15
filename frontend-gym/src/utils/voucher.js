/** Lógica pura de la pantalla Vouchers (con test en `voucher.test.js`). */

/** Cuánto dura un voucher. `valid_days` cuenta desde hoy hasta el FINAL del último día (lo calcula el backend). */
export const VALIDITY_OPTIONS = [
  { id: "none", label: "Sin vencimiento" },
  { id: "7", label: "7 días" },
  { id: "15", label: "15 días" },
  { id: "30", label: "30 días" },
  { id: "90", label: "90 días" },
  { id: "date", label: "Hasta una fecha" },
];

/** Opción de vigencia → campos del backend (`valid_days` o `expires_at`; nunca ambos). */
export function validityPayload(choice, date) {
  if (choice === "date") return date ? { expires_at: date } : {};
  const days = Number(choice);
  return Number.isInteger(days) && days > 0 ? { valid_days: days } : {};
}

export const needsValue = (type) => type !== "text";

/** Formulario común (título, beneficio, vigencia) → cuerpo para voucher, emisión masiva o campaña. */
export function templatePayload(form, validity, date) {
  return {
    title: form.title.trim(),
    benefit_type: form.type,
    benefit_value: needsValue(form.type) ? Number(form.value) : null,
    benefit_description: form.description.trim(),
    applies_to: form.appliesTo.trim() || null,
    ...validityPayload(validity, date),
  };
}

export function benefitText(v) {
  if (v.benefit_type === "percent") return `${v.benefit_value}% de descuento`;
  if (v.benefit_type === "fixed") return `Descuento de ${v.benefit_value}`;
  return v.benefit_description;
}

export const CAMPAIGN_STATUS = {
  active: { label: "Activo", tone: "success" },
  full: { label: "Cupo lleno", tone: "warning" },
  expired: { label: "Vencido", tone: "warning" },
  closed: { label: "Cerrado", tone: "error" },
};

/** "12 / 50" con cupo, "12 (sin límite)" sin él. */
export const claimsLabel = (c) => (c.max_claims == null ? `${c.claimed} (sin límite)` : `${c.claimed} / ${c.max_claims}`);

/** Cuántos destinatarios tendrá una emisión masiva según la audiencia elegida. */
export function audienceCount(audience, members, branchId, pickedCount) {
  if (audience === "all") return members.length;
  if (audience === "branch") return members.filter((m) => String(m.branch?.id) === String(branchId)).length;
  return pickedCount;
}
