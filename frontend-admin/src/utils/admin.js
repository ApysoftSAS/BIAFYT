/**
 * BIAFYT ADMIN — LÓGICA PURA
 * ---------------------------------------------------------------
 * Sin estado, sin fetch. Formateos y agrupaciones sobre las respuestas de
 * `/admin/*`.
 */

/** Etiqueta + tono para un estado de solicitud. */
export function statusLabel(status) {
  switch (status) {
    case "pending":
      return { text: "Pendiente", tone: "warning" };
    case "approved":
      return { text: "Aprobada", tone: "success" };
    case "rejected":
      return { text: "Rechazada", tone: "error" };
    default:
      return { text: status ?? "—", tone: "default" };
  }
}

/** Cuenta de solicitudes por estado. */
export function countByStatus(requests = []) {
  return (requests ?? []).reduce(
    (acc, r) => {
      if (r && acc[r.status] !== undefined) acc[r.status] += 1;
      return acc;
    },
    { pending: 0, approved: 0, rejected: 0 }
  );
}

/** Fecha corta es-CO ("14 sept") o "" si la entrada no es válida. */
export function formatDate(iso) {
  try {
    if (!iso) return "";
    return new Date(iso).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return "";
  }
}

/** Etiqueta legible para el `benefit_type` de una promoción/voucher. */
export function benefitTypeLabel(type) {
  switch (type) {
    case "percent":
      return "Porcentaje";
    case "fixed":
      return "Monto fijo";
    case "text":
      return "Texto libre";
    default:
      return type ?? "—";
  }
}
