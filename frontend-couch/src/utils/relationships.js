/**
 * BIAFYT COUCH — RELACIONES COACH ↔ ATLETA
 * ---------------------------------------------------------------
 * Lógica pura sobre la respuesta de `GET /me/coach-relationships`.
 * Cada fila trae `viewer_role` ("coach" | "athlete") — el lado del
 * usuario autenticado — y `status` ("pending" | "active" | "revoked").
 * Las revocadas se ignoran en todas las vistas.
 */
export function groupRelationships(relationships = []) {
  const live = relationships.filter((r) => r.status === "pending" || r.status === "active");
  return {
    // El usuario es coach de estos atletas.
    activeAthletes: live.filter((r) => r.viewer_role === "coach" && r.status === "active"),
    // Solicitudes que el usuario (como coach) envió y siguen pendientes.
    pendingSent: live.filter((r) => r.viewer_role === "coach" && r.status === "pending"),
    // Coaches que ya entrenan al usuario.
    activeCoaches: live.filter((r) => r.viewer_role === "athlete" && r.status === "active"),
    // Solicitudes que otros coaches enviaron al usuario y esperan respuesta.
    pendingReceived: live.filter((r) => r.viewer_role === "athlete" && r.status === "pending"),
  };
}
