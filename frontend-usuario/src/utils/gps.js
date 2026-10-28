/**
 * BIAFYT — CAPA GPS (puntos 59, 60, 88)
 * ---------------------------------------------------------------
 * El GPS NO es obligatorio para usar la app. Solo se solicita para
 * actividades que generan puntos competitivos.
 */

export const GPS_STATE = {
  IDLE: "IDLE",
  REQUESTING: "REQUESTING",
  GRANTED: "GRANTED",
  DENIED: "DENIED",
  UNAVAILABLE: "UNAVAILABLE",
};

/** Radio de tolerancia alrededor de la sede, en metros. */
export const GYM_RADIUS_M = 250;

export function haversineMeters(a, b) {
  if (!a || !b) return Infinity;
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Pide la ubicación al dispositivo. En navegador de escritorio o si el
 * usuario deniega, devolvemos un estado explícito en vez de romper el flujo.
 * `simulateAt` permite la demo sin GPS real (punto 98).
 */
export function requestPosition({ timeout = 8000, simulateAt = null } = {}) {
  return new Promise((resolve) => {
    if (simulateAt) {
      resolve({ state: GPS_STATE.GRANTED, coords: simulateAt, simulated: true, accuracy: 12 });
      return;
    }
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      resolve({ state: GPS_STATE.UNAVAILABLE, coords: null });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          state: GPS_STATE.GRANTED,
          coords: { lat: pos.coords.latitude, lng: pos.coords.longitude },
          accuracy: pos.coords.accuracy,
          simulated: false,
        }),
      (err) => resolve({ state: err.code === 1 ? GPS_STATE.DENIED : GPS_STATE.UNAVAILABLE, coords: null, error: err.message }),
      { enableHighAccuracy: true, timeout, maximumAge: 60000 }
    );
  });
}

/** Evalúa la cercanía a la sede seleccionada. */
export function evaluateProximity(coords, branch) {
  if (!coords || !branch) return { near: false, distance: null, reason: "Sin ubicación" };
  const distance = haversineMeters(coords, { lat: branch.lat, lng: branch.lng });
  return {
    near: distance <= GYM_RADIUS_M,
    distance,
    reason: distance <= GYM_RADIUS_M ? "Dentro del gimnasio" : "Fuera del radio del gimnasio",
  };
}
