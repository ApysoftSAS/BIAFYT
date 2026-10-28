/**
 * BIAFYT — ESQUEMA ESTÁTICO DE `state` (AppContext)
 * ---------------------------------------------------------------
 * Lista de claves conocidas/permitidas en cada nivel del árbol de
 * estado, escrita a mano y a propósito NO derivada de `defaultState`
 * (ver `state/AppContext.test.jsx`, test de forma estática): si se
 * derivara de `defaultState`, el test siempre pasaría aunque alguien
 * añadiera un campo nuevo sin decidir su scope (device vs identity),
 * que es exactamente la fuga que este archivo existe para atrapar.
 *
 * Al añadir un campo nuevo a `state`, DEBE decidirse explícitamente:
 * - ¿Sobrevive a un cambio de cuenta en este dispositivo? → `device`.
 * - ¿Es parte de la sesión (token/biometría/bloqueo)? → `auth`.
 * - ¿Pertenece a la cuenta activa? → `identity` (y añadirse aquí).
 * Nunca se añade directamente a `defaultState` sin actualizar este
 * archivo — si no, el test de forma estática falla a propósito.
 */

// Claves top-level de `state`.
export const STATE_KEYS = ["schemaVersion", "device", "auth", "identitySnapshots", "identity"];

// `device`: sobrevive a cualquier cambio de identidad en este dispositivo.
export const DEVICE_KEYS = ["coach", "settings", "rememberedEmail", "gyms", "prospects"];
export const DEVICE_SETTINGS_KEYS = ["sound", "vibration", "gpsCompetitive"];
export const DEVICE_COACH_KEYS = ["hidden", "position"];

// `auth`: sesión (token Sanctum + biometría + App Lock). No es identidad.
export const AUTH_KEYS = ["token", "signedIn", "biometric", "locked"];
export const AUTH_BIOMETRIC_KEYS = ["enabled", "credentialId", "provider"];

// `identity`: todo lo que pertenece a la cuenta activa. Esta es la lista
// que `switchIdentity` aísla completa por `user.id` vía `identitySnapshots`.
export const IDENTITY_KEYS = [
  "onboarded",
  "user",
  "settings",
  "discountUsage",
  "activities",
  "duels",
  "rewards",
  "notifications",
  "checkins",
  "customRoutines",
  "activeRoutineId",
  "challengeProgress",
  "readPosts",
  "agenda",
  "lastCheckIn",
  "lastCheckOut",
  "pointsLog",
];

export const IDENTITY_USER_KEYS = [
  "id",
  "name",
  "initials",
  "email",
  "focusId",
  "gymId",
  "branchId",
  "city",
  "country",
  "points",
  "lockedPoints",
  "streak",
  "profile",
  "profileSynced",
  "stats",
  "duels",
  "plan",
  "schedule",
];

export const IDENTITY_SETTINGS_KEYS = ["rankingOptIn", "publicProfile", "visibleData", "notifications"];
