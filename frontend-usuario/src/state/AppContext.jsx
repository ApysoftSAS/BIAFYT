/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { STORAGE_KEY } from "../config/appConfig.js";
import { gyms as seedGyms, GYM_STATUS, findGym, findBranch } from "../data/gyms.js";
import { communityUsers } from "../data/users.js";
import { buildRoutine } from "../data/training.js";
import { exercises as localExercises } from "../data/exercises.js";
import { loadExerciseCatalog } from "../data/exerciseCatalog.js";
import { machines as localMachines } from "../data/machines.js";
import { loadEquipmentCatalog } from "../data/equipmentCatalog.js";
import { findPlan } from "../data/plans.js";
import { validateDiscountCode, calculateFinalPrice } from "../utils/discounts.js";
import { POINT_RULES } from "../utils/validation.js";
import { feedback } from "../utils/feedback.js";
import {
  apiRegister,
  apiLogin,
  apiLogout,
  apiMe,
  ApiError,
  apiGetProfile,
  apiUpdateProfile,
  mapProfileFromApi,
  buildProfilePatchPayload,
  apiErrorMessage,
  apiCreateActivity,
  buildActivityPayload,
  apiCheckIn,
  apiCheckOut,
  apiClaimChallenge,
  apiClaimReward,
  apiGetStreak,
  apiGetPoints,
  apiGetDuels,
  apiCreateDuel,
  apiAcceptDuel,
  apiRejectDuel,
  apiCancelDuel,
  apiSubmitDuelRun,
} from "../utils/api.js";
import { initialsOf } from "../utils/format.js";

const AppContext = createContext(null);

const SCHEMA_VERSION = 2;

// Código de canje de un reward (p.ej. "SOMA-X8K29"). Sin caracteres
// ambiguos (0/O, 1/I). Pertenece al reward — no hay catálogo aparte.
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function generateRedemptionCode() {
  let suffix = "";
  for (let i = 0; i < 5; i++) suffix += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return `SOMA-${suffix}`;
}

// "Nadie": sentinel para logout/401 y para el placeholder antes del primer
// login. Nunca corresponde a un id real de backend, así que nunca puede
// colisionar con `identitySnapshots` de una cuenta real (ver switchIdentity).
export const ANONYMOUS_ID = "anon";
const ANONYMOUS_USER = { id: ANONYMOUS_ID, name: "", email: "" };

// ------------------------------------------------------------------
// SHAPE POR DEFECTO
// ------------------------------------------------------------------
// `device`: sobrevive a CUALQUIER cambio de identidad en este dispositivo
// (nunca se resetea al cambiar de cuenta, nunca se guarda en identitySnapshots).
export const DEFAULT_DEVICE_STATE = {
  coach: { hidden: false, position: null }, // posición libre del avatar flotante
  settings: { sound: true, vibration: true, gpsCompetitive: true },
  rememberedEmail: null, // solo UX de "recordar correo" — nunca representa sesión
  gyms: seedGyms,
  prospects: [],
};

// `auth`: sesión (backend Laravel/Sanctum + biometría + App Lock). Ya
// estaba bien aislado antes de este refactor (invariante signedIn⇔token) —
// se mantiene igual, solo se le quita `account` (→ device.rememberedEmail).
export const DEFAULT_AUTH_STATE = {
  token: null, // token Sanctum devuelto por /auth/register y /auth/login
  signedIn: false,
  biometric: { enabled: false, credentialId: null, provider: null },
  // App Lock: bloqueo temporal, independiente de signedIn (nunca se persiste como sesión).
  locked: false,
};

/**
 * `identity`: TODO lo que pertenece a la cuenta activa. Esta es la única
 * lista que importa para que una cuenta nunca vea datos de otra: cualquier
 * campo nuevo con datos de usuario se añade AQUÍ (y en stateSchema.js) y
 * queda aislado automáticamente por `switchIdentity`, sin tocar ninguna
 * allowlist de reseteo.
 *
 * Representa tanto la identidad activa (`state.identity`) como la forma de
 * cada foto guardada en `state.identitySnapshots[userId]`, y es también el
 * valor de arranque para una cuenta que este dispositivo nunca vio antes.
 */
export const DEFAULT_IDENTITY_STATE = {
  onboarded: false,
  user: {
    id: ANONYMOUS_ID,
    name: "",
    initials: "",
    email: "",
    // Training/buildRoutine siempre necesita un focusId utilizable, incluso
    // antes de que el backend confirme un Profile real.
    focusId: "hypertrophy",
    gymId: null,
    branchId: null,
    city: null,
    country: null,
    points: 0,
    lockedPoints: 0,
    streak: 0,
    profile: null,
    // true = este Profile fue confirmado por el backend en esta sesión de datos.
    profileSynced: false,
    // Estático hoy: ninguna acción de AppContext escribe `stats` todavía
    // (candidato a backend, ver informe). Se conserva el valor de demo
    // como placeholder visual, ahora correctamente aislado por identidad.
    stats: { strength: 78, endurance: 66, consistency: 82, experience: 72, frequency: 4.2 },
    duels: { wins: 0, losses: 0 },
    // Todo usuario arranca en el plan gratuito del catálogo (data/plans.js).
    plan: { id: "plan-free", status: "active", startedAt: null, expiresAt: null },
    schedule: {
      slot: "tarde", // franja por defecto al planificar un día puntual (agenda)
      days: [1, 2, 4, 5], // 0 = domingo (convención Date#getDay())
      startTime: "06:00",
      endTime: "07:00",
      reminder: true,
    },
  },
  settings: {
    rankingOptIn: true,
    publicProfile: true,
    visibleData: { level: true, streak: true, physical: false },
    notifications: { training: true, rankings: true, challenges: true, duels: true, promos: false },
  },
  // Usos locales de códigos de descuento (Fase 2), por code (mayúsculas).
  // Demo/local — no hay backend que garantice unicidad real entre usuarios.
  discountUsage: {},
  activities: [],
  duels: [],
  rewards: [],
  notifications: [],
  checkins: [],
  customRoutines: [],
  activeRoutineId: null,
  challengeProgress: {}, // { "2026-08-23": { sets: 8, workouts: 1, claimed: ["dc-sets"] } }
  readPosts: [],
  agenda: [], // sesiones planificadas en el calendario
  lastCheckIn: null,
  lastCheckOut: null,
  pointsLog: [],
};

export const defaultState = {
  schemaVersion: SCHEMA_VERSION,
  device: DEFAULT_DEVICE_STATE,
  auth: DEFAULT_AUTH_STATE,
  // Foto COMPLETA de IdentityState por user.id — no una allowlist parcial.
  identitySnapshots: {},
  identity: DEFAULT_IDENTITY_STATE,
};

/**
 * Único punto de transición de identidad en este dispositivo: logout,
 * 401, login y registro pasan todos por aquí (con `nextUser` real o con
 * `ANONYMOUS_USER` para "nadie"). Guarda una foto COMPLETA de la identidad
 * saliente (todo `state.identity` tal cual estaba) y restaura la foto de
 * quien llega si este dispositivo ya la vio antes, o arranca en
 * `DEFAULT_IDENTITY_STATE` (nunca en el seed de demo) si es la primera vez.
 *
 * No enumera campos: como guarda/restaura el objeto `identity` completo,
 * un campo nuevo dentro de `identity` queda aislado por construcción, sin
 * tocar esta función. Esto también resuelve A→B→A correctamente: cuando A
 * vuelve, su propia foto (guardada cuando B llegó) se restaura completa.
 */
export function switchIdentity(prev, nextUser) {
  const snapshots =
    prev.identity.user.id !== ANONYMOUS_ID
      ? { ...prev.identitySnapshots, [prev.identity.user.id]: prev.identity }
      : prev.identitySnapshots;

  const restored = snapshots[nextUser.id] ?? DEFAULT_IDENTITY_STATE;

  return {
    identitySnapshots: snapshots,
    identity: {
      ...restored,
      user: {
        ...restored.user,
        id: nextUser.id,
        name: nextUser.name,
        email: nextUser.email,
        initials: initialsOf(nextUser.name),
      },
    },
  };
}

/**
 * Termina la sesión en este dispositivo (logout explícito o 401 de
 * servidor): limpia `auth` (token/signedIn/biometric — el enrolamiento
 * biométrico está ligado a la identidad que lo activó, no debe sobrevivir
 * a quién lo enroló) y hace `switchIdentity` a "nadie", lo que además
 * guarda la foto de quien se va y limpia Profile/focusId/todo lo demás
 * de `identity` por construcción (nunca queda nada de la cuenta anterior
 * visible para la siguiente sesión en este dispositivo).
 */
function endSession(prev) {
  return {
    auth: { ...prev.auth, token: null, signedIn: false, biometric: { enabled: false, credentialId: null, provider: null } },
    ...switchIdentity(prev, ANONYMOUS_USER),
  };
}

/**
 * Aplica una concesión de puntos a un IdentityState: suma a `user.points`
 * (nunca negativo) y registra la entrada correspondiente en `pointsLog`.
 * Único punto de "otorgar puntos + loguearlo" — lo comparten `addPoints`
 * y `checkIn` para que ninguna concesión de puntos quede fuera de
 * `pointsLog` y para no duplicar la lógica de logging en dos sitios.
 */
function grantPoints(identity, amount, reason) {
  return {
    ...identity,
    user: { ...identity.user, points: Math.max(0, identity.user.points + amount) },
    pointsLog: [{ amount, reason, date: new Date().toISOString() }, ...identity.pointsLog].slice(0, 60),
  };
}

// ------------------------------------------------------------------
// NORMALIZACIÓN / CARGA DESDE LOCALSTORAGE
// ------------------------------------------------------------------

function normalizeAuth(rawAuth) {
  const auth = {
    ...DEFAULT_AUTH_STATE,
    ...rawAuth,
    biometric: { ...DEFAULT_AUTH_STATE.biometric, ...(rawAuth?.biometric || {}) },
  };
  // Invariante: `signedIn: true` sin `token` es imposible (nunca lo escribe
  // este código), pero una instalación previa a esa corrección pudo haber
  // persistido exactamente eso — se normaliza aquí para no confiar en ese
  // estado legado. Un `token` sin `signedIn` se resuelve solo: el efecto de
  // arranque siempre revalida cualquier `token` presente contra /auth/me.
  if (!auth.token) auth.signedIn = false;
  // El bloqueo nunca se confía del almacenamiento: se recalcula.
  auth.locked = Boolean(auth.signedIn && auth.biometric.enabled);
  return auth;
}

function normalizeDevice(rawDevice) {
  return {
    ...DEFAULT_DEVICE_STATE,
    ...rawDevice,
    coach: { ...DEFAULT_DEVICE_STATE.coach, ...(rawDevice?.coach || {}) },
    settings: { ...DEFAULT_DEVICE_STATE.settings, ...(rawDevice?.settings || {}) },
    // Los gimnasios semilla siempre se recargan; se conservan los registrados por el usuario.
    gyms: [...seedGyms, ...(rawDevice?.gyms || []).filter((g) => g.userRegistered)],
    prospects: rawDevice?.prospects || [],
  };
}

/** Rellena un IdentityState parcial/legado contra DEFAULT_IDENTITY_STATE. */
function normalizeIdentity(rawIdentity) {
  const src = rawIdentity || {};
  const srcUser = src.user || {};
  const srcSettings = src.settings || {};
  return {
    ...DEFAULT_IDENTITY_STATE,
    ...src,
    user: {
      ...DEFAULT_IDENTITY_STATE.user,
      ...srcUser,
      plan: { ...DEFAULT_IDENTITY_STATE.user.plan, ...(srcUser.plan || {}) },
      schedule: { ...DEFAULT_IDENTITY_STATE.user.schedule, ...(srcUser.schedule || {}) },
      stats: { ...DEFAULT_IDENTITY_STATE.user.stats, ...(srcUser.stats || {}) },
      duels: { ...DEFAULT_IDENTITY_STATE.user.duels, ...(srcUser.duels || {}) },
    },
    settings: {
      ...DEFAULT_IDENTITY_STATE.settings,
      ...srcSettings,
      visibleData: { ...DEFAULT_IDENTITY_STATE.settings.visibleData, ...(srcSettings.visibleData || {}) },
      notifications: { ...DEFAULT_IDENTITY_STATE.settings.notifications, ...(srcSettings.notifications || {}) },
    },
  };
}

function normalizeSnapshots(rawSnapshots) {
  if (!rawSnapshots || typeof rawSnapshots !== "object") return {};
  const out = {};
  for (const [id, snap] of Object.entries(rawSnapshots)) {
    out[id] = normalizeIdentity(snap);
  }
  return out;
}

/**
 * Migra un blob de LocalStorage con el shape PLANO anterior (sin
 * `schemaVersion`, o `< SCHEMA_VERSION`) al shape nuevo. Arma un
 * IdentityState con los campos que correspondían al usuario legado y un
 * `device` con coach/gyms/settings de dispositivo/etc. — pero NO promueve
 * ese IdentityState extraído a `identity` activa: lo guarda en
 * `identitySnapshots[legacyUserId]` y arranca con `identity` en blanco.
 *
 * El flujo normal de arranque (authChecking → refreshSession →
 * applyMeResponse → switchIdentity) reconecta al usuario real con su
 * propio snapshot si el token legacy sigue siendo válido, sin lógica de
 * migración especial adicional. Si el token ya no es válido, el usuario ve
 * <Auth/> con `identity` en blanco, nunca datos del blob viejo.
 *
 * Principio explícito: ante ambigüedad, preferir perder cache antes que
 * mostrar datos de otra cuenta.
 */
export function migrateLegacyState(parsed) {
  const legacyUser = parsed.user || {};
  const legacySettings = parsed.settings || {};
  const legacyId = legacyUser.id && legacyUser.id !== "me" ? legacyUser.id : ANONYMOUS_ID;

  const legacyIdentity = normalizeIdentity({
    onboarded: Boolean(parsed.onboarded),
    user: {
      id: legacyId,
      name: legacyUser.name,
      initials: legacyUser.initials,
      email: legacyUser.email,
      focusId: legacyUser.focusId,
      gymId: legacyUser.gymId,
      branchId: legacyUser.branchId,
      city: legacyUser.city,
      country: legacyUser.country,
      points: legacyUser.points,
      lockedPoints: legacyUser.lockedPoints,
      streak: legacyUser.streak,
      profile: legacyUser.profile,
      profileSynced: legacyUser.profileSynced,
      stats: legacyUser.stats,
      duels: legacyUser.duels,
      plan: legacyUser.plan,
      schedule: legacyUser.schedule,
    },
    settings: {
      rankingOptIn: legacySettings.rankingOptIn,
      publicProfile: legacySettings.publicProfile,
      visibleData: legacySettings.visibleData,
      notifications: legacySettings.notifications,
    },
    discountUsage: parsed.discountUsage,
    activities: parsed.activities,
    duels: parsed.duels,
    rewards: parsed.rewards,
    notifications: parsed.notifications,
    checkins: parsed.checkins,
    customRoutines: parsed.customRoutines,
    activeRoutineId: parsed.activeRoutineId,
    challengeProgress: parsed.challengeProgress,
    readPosts: parsed.readPosts,
    agenda: parsed.agenda,
    lastCheckIn: parsed.lastCheckIn,
    lastCheckOut: parsed.lastCheckOut,
    pointsLog: parsed.pointsLog,
  });

  const device = normalizeDevice({
    coach: parsed.coach,
    settings: {
      sound: legacySettings.sound,
      vibration: legacySettings.vibration,
      gpsCompetitive: legacySettings.gpsCompetitive,
    },
    rememberedEmail: parsed.auth?.account?.email ?? null,
    gyms: parsed.gyms,
    prospects: parsed.prospects,
  });

  return {
    schemaVersion: SCHEMA_VERSION,
    device,
    auth: normalizeAuth(parsed.auth),
    // El shape legado de identitySnapshots (allowlist parcial de 6 campos)
    // se descarta: no es un IdentityState completo y rellenar lo que falta
    // sería inventar datos. Solo se conserva la identidad activa legada.
    identitySnapshots: legacyId !== ANONYMOUS_ID ? { [legacyId]: legacyIdentity } : {},
    identity: DEFAULT_IDENTITY_STATE,
  };
}

export function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState;
    const parsed = JSON.parse(raw);
    if (!parsed.schemaVersion || parsed.schemaVersion < SCHEMA_VERSION) {
      return migrateLegacyState(parsed);
    }
    return {
      schemaVersion: SCHEMA_VERSION,
      device: normalizeDevice(parsed.device),
      auth: normalizeAuth(parsed.auth),
      identitySnapshots: normalizeSnapshots(parsed.identitySnapshots),
      identity: normalizeIdentity(parsed.identity),
    };
  } catch {
    return defaultState;
  }
}

export function AppProvider({ children }) {
  const [state, setState] = useState(load);
  // Arranque: si había un token persistido, lo revalidamos contra /me
  // antes de confiar en `signedIn` (ver efecto más abajo). Mientras esto
  // se resuelve, `authChecking` deja a App.jsx en un estado transitorio
  // para no parpadear entre <Auth/> y la app ya cargada.
  const [authChecking, setAuthChecking] = useState(() => Boolean(state.auth.token));
  // Estado transitorio de Profile (Fase 2): no se persiste, mismo patrón que `authChecking`.
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState("");

  // Catálogo de ejercicios (no se persiste): arranca con el local
  // (`data/exercises.js`) para que la app funcione igual sin esperar
  // red, y se reemplaza si el backend responde con un catálogo válido.
  // Ver `data/exerciseCatalog.js` — nunca lanza, siempre cae al local.
  const [exerciseCatalog, setExerciseCatalog] = useState(localExercises);
  useEffect(() => {
    let cancelled = false;
    loadExerciseCatalog().then((catalog) => {
      if (!cancelled) setExerciseCatalog(catalog);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Catálogo de MÁQUINAS: mismo patrón. Fuente de verdad = backend
  // (`GET /equipment`), `data/machines.js` es solo el fallback offline.
  // Ver `data/equipmentCatalog.js` — nunca lanza.
  const [machineCatalog, setMachineCatalog] = useState(localMachines);
  useEffect(() => {
    let cancelled = false;
    loadEquipmentCatalog().then((catalog) => {
      if (!cancelled) setMachineCatalog(catalog);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // RACHA CANÓNICA (D2 / roadmap 3a): la racha VISIBLE viene EXCLUSIVAMENTE
  // de `GET /me/streak` (backend, derivada de `check_ins` vía `StreakRules`).
  // `current` = racha actual (rompe con un día perdido); `longest` = récord.
  // NO se mezcla con `identity.user.streak`, que se conserva SOLO como hecho
  // de sesión para el cálculo de puntos hasta el flip (3c). En memoria, sin
  // persistir (mismo criterio que los catálogos): se recarga en cada
  // arranque con sesión y tras cada check-in. Sin fallback a valores
  // locales — si el backend no responde, `status` != "ok" y la UI muestra
  // "—". `status`: "idle" | "loading" | "ok" | "error".
  const [streak, setStreak] = useState({ current: null, longest: null, status: "idle" });

  const loadStreak = useCallback((token) => {
    if (!token) {
      setStreak({ current: null, longest: null, status: "idle" });
      return;
    }
    const toCount = (v) => {
      const n = Math.floor(Number(v));
      return Number.isFinite(n) && n >= 0 ? n : 0;
    };
    setStreak((s) => ({ ...s, status: "loading" }));
    apiGetStreak(token)
      .then((d) => setStreak({ current: toCount(d?.current_streak), longest: toCount(d?.longest_streak), status: "ok" }))
      .catch(() => setStreak((s) => ({ ...s, status: "error" })));
  }, []);

  useEffect(() => {
    let cancelled = false;
    // Todo el setState diferido a un microtask (mismo criterio que el resto
    // de cargas de arranque). `loadStreak(null)` deja `status: "idle"`.
    Promise.resolve().then(() => {
      if (!cancelled) loadStreak(state.auth.signedIn ? state.auth.token : null);
    });
    return () => {
      cancelled = true;
    };
  }, [state.auth.signedIn, state.auth.token, loadStreak]);

  // SALDO E HISTORIAL AUTORITATIVOS (roadmap 3c / B1-B2): el saldo VISIBLE de
  // puntos y el historial de movimientos vienen EXCLUSIVAMENTE de
  // `GET /me/points` (backend: `balance` = SUM de TODO el ledger del usuario;
  // `transactions` = una página del ledger, paginación por cursor de A2). El
  // frontend NO reconstruye el saldo sumando/restando eventos: tras cada
  // operación que mueva puntos se revalida con `loadPoints`. `identity.user.
  // points` y `pointsLog` se conservan como valor LEGADO local (siguen
  // alimentando la copia sombra y los tests de write-through) pero ya NO se
  // muestran ni se usan como gate — mismo trato que `identity.user.streak`
  // tras 3a. En memoria, sin persistir. `status`: idle|loading|ok|error;
  // `loadingMore` mientras se pide una página adicional del historial.
  const [points, setPoints] = useState({
    balance: null,
    transactions: [],
    nextCursor: null,
    hasMore: false,
    status: "idle",
  });

  const applyPointsPage = useCallback((data, append = false) => {
    const balance = Number.isFinite(Number(data?.balance)) ? Math.trunc(Number(data.balance)) : null;
    const rows = Array.isArray(data?.transactions) ? data.transactions : [];
    setPoints((prev) => ({
      balance: balance ?? prev.balance,
      transactions: append ? [...prev.transactions, ...rows] : rows,
      nextCursor: data?.next_cursor ?? null,
      hasMore: Boolean(data?.has_more),
      status: "ok",
    }));
  }, []);

  const loadPoints = useCallback(
    (token) => {
      if (!token) {
        setPoints({ balance: null, transactions: [], nextCursor: null, hasMore: false, status: "idle" });
        return;
      }
      setPoints((p) => ({ ...p, status: p.status === "ok" ? "ok" : "loading" }));
      apiGetPoints(token)
        .then((d) => applyPointsPage(d))
        .catch(() => setPoints((p) => ({ ...p, status: "error" })));
    },
    [applyPointsPage]
  );

  const loadMorePoints = useCallback(() => {
    const token = state.auth.token;
    if (!token || !points.hasMore || !points.nextCursor || points.status === "loadingMore") return;
    setPoints((p) => ({ ...p, status: "loadingMore" }));
    apiGetPoints(token, { cursor: points.nextCursor })
      .then((d) => applyPointsPage(d, true))
      .catch(() => setPoints((p) => ({ ...p, status: "error" })));
  }, [state.auth.token, points.hasMore, points.nextCursor, points.status, applyPointsPage]);

  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(() => {
      if (!cancelled) loadPoints(state.auth.signedIn ? state.auth.token : null);
    });
    return () => {
      cancelled = true;
    };
  }, [state.auth.signedIn, state.auth.token, loadPoints]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* almacenamiento no disponible */
    }
  }, [state]);

  // MULTI-PESTAÑA: el evento nativo `storage` solo dispara en las OTRAS
  // pestañas que comparten este mismo origen — nunca en la que hizo el
  // `setItem` (comportamiento nativo esperado, no se trabaja en contra).
  // Al detectarlo para STORAGE_KEY, se relee y normaliza el valor
  // COMPLETO de LocalStorage con `load()` (misma función que en el
  // arranque, con su propio `catch` defensivo ante JSON corrupto) y se
  // reemplaza el `state` en memoria de esta instancia, para que converja
  // al último valor escrito en STORAGE_KEY sin importar en qué pestaña
  // ocurrió el cambio (login/logout/switchIdentity en otra pestaña).
  // El reemplazo dispara de nuevo el efecto de persistencia de arriba,
  // que vuelve a escribir ese mismo valor ya presente en LocalStorage —
  // inofensivo (mismo valor, no corrompe nada) y se deja así a propósito
  // en vez de complicar el mecanismo con una comparación previa.
  useEffect(() => {
    const handleStorage = (event) => {
      if (event.key !== STORAGE_KEY) return;
      setState(load());
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  const patch = useCallback((updater) => {
    setState((prev) => (typeof updater === "function" ? { ...prev, ...updater(prev) } : { ...prev, ...updater }));
  }, []);

  // ------------------------------------------------------------------
  // NOTIFICACIONES (puntos 72, 87)
  // ------------------------------------------------------------------
  const notify = useCallback((notification) => {
    setState((prev) => {
      const channel = notification.channel ?? "training";
      if (prev.identity.settings.notifications[channel] === false) return prev;
      feedback(notification.tone ?? "start", {
        sound: prev.device.settings.sound,
        vibration: prev.device.settings.vibration,
      });
      return {
        ...prev,
        identity: {
          ...prev.identity,
          notifications: [
            { id: `n-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, date: new Date().toISOString(), read: false, ...notification },
            ...prev.identity.notifications,
          ].slice(0, 40),
        },
      };
    });
  }, []);

  const markNotificationsRead = useCallback(() => {
    patch((prev) => ({
      identity: { ...prev.identity, notifications: prev.identity.notifications.map((n) => ({ ...n, read: true })) },
    }));
  }, [patch]);

  // ------------------------------------------------------------------
  // ONBOARDING / GIMNASIO (puntos 54, 55, 56)
  // ------------------------------------------------------------------
  const updateUser = useCallback(
    (changes) => patch((prev) => ({ identity: { ...prev.identity, user: { ...prev.identity.user, ...changes } } })),
    [patch]
  );

  const selectGym = useCallback((gymId, branchId) => {
    setState((prev) => {
      const gym = findGym(prev.device.gyms, gymId);
      return {
        ...prev,
        identity: {
          ...prev.identity,
          user: { ...prev.identity.user, gymId, branchId, city: gym?.city ?? null, country: gym?.country ?? null },
        },
      };
    });
  }, []);

  /** Registro de un gimnasio inexistente → queda como PROSPECTO (puntos 55, 56). */
  const registerGym = useCallback((form) => {
    const gymId = `gym-user-${Date.now()}`;
    const branchId = `${gymId}-b1`;
    const gym = {
      id: gymId,
      name: form.name.toUpperCase(),
      country: form.country,
      city: form.city,
      address: form.address,
      phone: form.phone,
      website: form.website || "",
      instagram: form.instagram || "",
      notes: form.notes || "",
      status: GYM_STATUS.PROSPECT,
      official: false,
      userRegistered: true,
      members: 1,
      branches: [{ id: branchId, name: form.branchName || "Principal", address: form.address, lat: null, lng: null, members: 1 }],
    };
    setState((prev) => ({
      ...prev,
      device: {
        ...prev.device,
        gyms: [...prev.device.gyms, gym],
        prospects: [
          ...prev.device.prospects,
          {
            gymId,
            name: gym.name,
            country: gym.country,
            city: gym.city,
            address: gym.address,
            contact: gym.phone,
            branchName: gym.branches[0].name,
            registeredBy: prev.identity.user.id,
            registeredByName: prev.identity.user.name,
            associatedUsers: 1,
            createdAt: new Date().toISOString(),
            status: GYM_STATUS.PROSPECT,
          },
        ],
      },
    }));
    return { gymId, branchId };
  }, []);

  const completeOnboarding = useCallback(
    () => patch((prev) => ({ identity: { ...prev.identity, onboarded: true } })),
    [patch]
  );

  // ------------------------------------------------------------------
  // CONFIGURACIÓN (puntos 58, 73, 96)
  // ------------------------------------------------------------------
  /** Ajustes de DISPOSITIVO: sonido, vibración, GPS competitivo. */
  const updateDeviceSettings = useCallback(
    (changes) => patch((prev) => ({ device: { ...prev.device, settings: { ...prev.device.settings, ...changes } } })),
    [patch]
  );

  /** Ajustes de IDENTIDAD: privacidad/ranking y notificaciones. */
  const updateIdentitySettings = useCallback(
    (changes) =>
      patch((prev) => ({
        identity: {
          ...prev.identity,
          settings: {
            ...prev.identity.settings,
            ...changes,
            visibleData: { ...prev.identity.settings.visibleData, ...(changes.visibleData || {}) },
            notifications: { ...prev.identity.settings.notifications, ...(changes.notifications || {}) },
          },
        },
      })),
    [patch]
  );

  // ------------------------------------------------------------------
  // PUNTOS (puntos 62, 84, 91)
  // ------------------------------------------------------------------
  const addPoints = useCallback(
    (amount, reason) => {
      if (!amount) return;
      patch((prev) => ({ identity: grantPoints(prev.identity, amount, reason) }));
    },
    [patch]
  );

  const lockPoints = useCallback(
    (amount) =>
      patch((prev) => ({
        identity: {
          ...prev.identity,
          user: {
            ...prev.identity.user,
            points: prev.identity.user.points - amount,
            lockedPoints: prev.identity.user.lockedPoints + amount,
          },
        },
      })),
    [patch]
  );

  const releasePoints = useCallback(
    (amount, won) =>
      patch((prev) => ({
        identity: {
          ...prev.identity,
          user: {
            ...prev.identity.user,
            lockedPoints: Math.max(0, prev.identity.user.lockedPoints - amount),
            points: prev.identity.user.points + (won ? amount * 2 : 0),
          },
        },
      })),
    [patch]
  );

  // ------------------------------------------------------------------
  // ACTIVIDADES / CHECK-IN
  // ------------------------------------------------------------------
  const addActivity = useCallback(
    (activity) => {
      // Fuente de verdad visible: LocalStorage (sin cambios).
      patch((prev) => ({
        identity: {
          ...prev.identity,
          activities: [{ id: `a-${Date.now()}`, date: new Date().toISOString(), ...activity }, ...prev.identity.activities].slice(0, 60),
        },
      }));
      // Copia sombra best-effort en el backend (auditoría). NUNCA afecta al
      // estado local ni al flujo de Workout.jsx: si falla, se traga en
      // silencio, sin reintento ni cola. El monto de puntos lo calcula el
      // backend; aquí no se envía points/amount/user_id.
      const token = state.auth.token;
      if (token) {
        // Tras el POST (que acredita `workout_completed` en el ledger), se
        // revalida el saldo autoritativo — no se suma el monto localmente.
        apiCreateActivity(token, buildActivityPayload(activity, new Date(), state.identity.user.streak))
          .then(() => loadPoints(token))
          .catch(() => {});
      }
    },
    [patch, state.auth.token, state.identity.user.streak, loadPoints]
  );

  const checkIn = useCallback((info) => {
    const today = new Date().toDateString();
    // Chequeo síncrono desde el `state` actual, SOLO para decidir si disparar
    // la copia sombra (el `setState` de abajo mantiene su propio guard, que
    // es la fuente de verdad del comportamiento local, sin cambios).
    const alreadyCheckedInToday =
      state.identity.lastCheckIn && new Date(state.identity.lastCheckIn).toDateString() === today;
    let already = false;
    setState((prev) => {
      const lastCheckIn = prev.identity.lastCheckIn;
      already = lastCheckIn && new Date(lastCheckIn).toDateString() === today;
      if (already) return prev;
      // Misma concesión+registro que addPoints (ver grantPoints): el
      // check-in queda en pointsLog igual que cualquier otro punto ganado.
      const granted = grantPoints(prev.identity, POINT_RULES.checkin, "Check-in");
      return {
        ...prev,
        identity: {
          ...granted,
          lastCheckIn: new Date().toISOString(),
          checkins: [{ date: new Date().toISOString(), ...info }, ...prev.identity.checkins].slice(0, 40),
          user: { ...granted.user, streak: prev.identity.user.streak + 1 },
        },
      };
    });
    // Copia sombra best-effort: solo si HOY no había check-in y hay sesión.
    // El backend acredita el `checkin` (+20) en su ledger; la racha NO se
    // envía. Un fallo se traga en silencio (sin reintento ni cola).
    // Tras registrar el check-in, se refresca la racha canónica (el backend
    // pudo haberla incrementado); si el POST o el GET fallan, la UI muestra
    // "—" — nunca el valor local.
    if (!alreadyCheckedInToday && state.auth.token) {
      apiCheckIn(state.auth.token)
        .then(() => {
          loadStreak(state.auth.token);
          loadPoints(state.auth.token); // el `checkin` (+20) ya está en el ledger
        })
        .catch(() => {});
    }
    return !already;
  }, [state.identity.lastCheckIn, state.auth.token, loadStreak, loadPoints]);

  // El check-out usa la misma fuente de verdad que el check-in
  // (lastCheckIn/lastCheckOut): solo puede salir quien ya entró hoy y
  // aún no ha registrado su salida.
  const checkOut = useCallback(() => {
    // Chequeo síncrono desde el `state` actual, SOLO para decidir si disparar
    // la copia sombra (el `setState` de abajo mantiene su propio guard, sin
    // cambios — es la fuente de verdad del comportamiento local).
    const canCheckOutNow = (() => {
      const now = new Date().toDateString();
      const lastCheckIn = state.identity.lastCheckIn;
      const lastCheckOut = state.identity.lastCheckOut;
      const checkedInToday = lastCheckIn && new Date(lastCheckIn).toDateString() === now;
      const alreadyOut = lastCheckOut && new Date(lastCheckOut) >= new Date(lastCheckIn);
      return Boolean(checkedInToday && !alreadyOut);
    })();
    let didCheckOut = false;
    setState((prev) => {
      const today = new Date().toDateString();
      const { lastCheckIn, lastCheckOut } = prev.identity;
      const checkedInToday = lastCheckIn && new Date(lastCheckIn).toDateString() === today;
      const alreadyOut = lastCheckOut && new Date(lastCheckOut) >= new Date(lastCheckIn);
      if (!checkedInToday || alreadyOut) return prev;
      didCheckOut = true;
      return { ...prev, identity: { ...prev.identity, lastCheckOut: new Date().toISOString() } };
    });
    // Copia sombra best-effort: solo si el check-out local procede y hay sesión.
    if (canCheckOutNow && state.auth.token) {
      apiCheckOut(state.auth.token).catch(() => {});
    }
    return didCheckOut;
  }, [state.identity.lastCheckIn, state.identity.lastCheckOut, state.auth.token]);

  // ------------------------------------------------------------------
  // PLANES (Fase 1 — adquisición simulada, sin pagos reales)
  // Fase 2 añade un código de descuento opcional: se revalida aquí
  // contra identity.discountUsage (no solo en la UI) y, si es válido, el
  // uso local se registra en el mismo paso que activa el plan.
  // ------------------------------------------------------------------
  const selectPlan = useCallback((planId, discountCode) => {
    let result = { ok: false };
    setState((prev) => {
      const plan = findPlan(planId);
      if (!plan || !plan.active) return prev;
      if (prev.identity.user.plan?.id === planId && prev.identity.user.plan?.status === "active") return prev;

      let discount = null;
      if (discountCode) {
        const validation = validateDiscountCode(discountCode, planId, prev.identity.discountUsage);
        if (!validation.valid) {
          result = { ok: false, reason: validation.reason };
          return prev;
        }
        discount = validation.discount;
      }

      const { finalPrice } = calculateFinalPrice(plan.price, discount);
      const now = new Date();
      const expiresAt = plan.price > 0 ? new Date(now.getFullYear(), now.getMonth() + 1, now.getDate()).toISOString() : null;
      result = { ok: true, finalPrice };
      return {
        ...prev,
        identity: {
          ...prev.identity,
          user: { ...prev.identity.user, plan: { id: plan.id, status: "active", startedAt: now.toISOString(), expiresAt } },
          discountUsage: discount
            ? { ...prev.identity.discountUsage, [discount.code]: (prev.identity.discountUsage[discount.code] || 0) + 1 }
            : prev.identity.discountUsage,
        },
      };
    });
    return result;
  }, []);

  // ------------------------------------------------------------------
  // DUELOS REALES (roadmap 3b) — puntos 74-88
  // ------------------------------------------------------------------
  // El ESTADO del duelo (participantes reales, aceptación, progreso,
  // ganador) vive en el backend (`GET /me/duels`). LocalStorage solo
  // concilia la APUESTA de puntos visible: `identity.duels` pasa a ser un
  // registro de conciliación por duelo — { id, stake, locked, settled } —
  // NO la lista de duelos. Al crear/aceptar se BLOQUEAN `stake` puntos
  // (mismo mecanismo que antes: `lockPoints`); cuando el backend marca el
  // duelo como terminal, `reconcileDuels` libera el bloqueo una sola vez:
  //   finished + gano yo  → +stake (releasePoints won)
  //   finished + pierdo    → -stake (el bloqueo ya descontó al crear)
  //   draw / unvalidated / rejected / cancelled → devolución íntegra
  // El backend además escribe su copia sombra en el ledger
  // (`duel_won`/`duel_lost`), pero el saldo visible sigue siendo local.
  const [duels, setDuels] = useState({ list: [], status: "idle" });

  const reconcileDuels = useCallback((apiDuels) => {
    const TERMINAL = ["finished", "unvalidated", "rejected", "cancelled"];
    setState((prev) => {
      const meId = prev.identity.user.id;
      const records = prev.identity.duels.map((r) => ({ ...r }));
      let user = prev.identity.user;
      let wins = 0;
      let losses = 0;
      let touched = false;

      for (const d of apiDuels) {
        const rec = records.find((r) => r.id === d.id);
        if (!rec || rec.settled || !TERMINAL.includes(d.status)) continue;

        if (rec.locked) {
          const won = d.status === "finished" && d.winner_user_id === meId;
          const lost = d.status === "finished" && d.winner_user_id != null && d.winner_user_id !== meId;
          user = {
            ...user,
            lockedPoints: Math.max(0, user.lockedPoints - rec.stake),
            // won → devuelve el doble (net +stake); lost → nada (net -stake);
            // resto (empate/no validado/rechazo/cancelación) → devolución.
            points: user.points + (won ? rec.stake * 2 : lost ? 0 : rec.stake),
          };
          if (won) wins += 1;
          if (lost) losses += 1;
        }
        rec.locked = false;
        rec.settled = true;
        touched = true;
      }

      if (!touched) return prev;

      return {
        ...prev,
        identity: {
          ...prev.identity,
          user: { ...user, duels: { wins: user.duels.wins + wins, losses: user.duels.losses + losses } },
          duels: records,
        },
      };
    });
  }, []);

  const loadDuels = useCallback(
    async (token) => {
      if (!token) {
        setDuels({ list: [], status: "idle" });
        return [];
      }
      setDuels((s) => ({ ...s, status: "loading" }));
      try {
        const data = await apiGetDuels(token);
        const list = Array.isArray(data?.duels) ? data.duels : [];
        reconcileDuels(list);
        setDuels({ list, status: "ok" });
        // Un duelo resuelto (won/lost) movió el ledger — revalida el saldo.
        loadPoints(token);
        return list;
      } catch {
        setDuels((s) => ({ ...s, status: "error" }));
        return [];
      }
    },
    [reconcileDuels, loadPoints]
  );

  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(() => {
      if (!cancelled) loadDuels(state.auth.signedIn ? state.auth.token : null);
    });
    return () => {
      cancelled = true;
    };
  }, [state.auth.signedIn, state.auth.token, loadDuels]);

  const recordDuelLock = useCallback(
    (duelId, stake) =>
      patch((prev) => ({
        identity: {
          ...prev.identity,
          duels: [{ id: duelId, stake, locked: true, settled: false }, ...prev.identity.duels.filter((r) => r.id !== duelId)],
        },
      })),
    [patch]
  );

  const createDuel = useCallback(
    async ({ opponentUserId, modality, stake }) => {
      const token = state.auth.token;
      const data = await apiCreateDuel(token, { opponentUserId, modality, stake });
      const duel = data.duel;
      lockPoints(stake);
      recordDuelLock(duel.id, stake);
      await loadDuels(token);
      return duel;
    },
    [state.auth.token, lockPoints, recordDuelLock, loadDuels]
  );

  const acceptDuel = useCallback(
    async (id, stake) => {
      const token = state.auth.token;
      const data = await apiAcceptDuel(token, id);
      lockPoints(stake);
      recordDuelLock(id, stake);
      await loadDuels(token);
      return data.duel;
    },
    [state.auth.token, lockPoints, recordDuelLock, loadDuels]
  );

  const rejectDuel = useCallback(
    async (id) => {
      const token = state.auth.token;
      await apiRejectDuel(token, id);
      await loadDuels(token);
    },
    [state.auth.token, loadDuels]
  );

  const cancelDuel = useCallback(
    async (id) => {
      const token = state.auth.token;
      await apiCancelDuel(token, id);
      await loadDuels(token);
    },
    [state.auth.token, loadDuels]
  );

  const submitDuelRun = useCallback(
    async (id, run) => {
      const token = state.auth.token;
      const data = await apiSubmitDuelRun(token, id, run);
      await loadDuels(token);
      return data.duel;
    },
    [state.auth.token, loadDuels]
  );

  // ------------------------------------------------------------------
  // PREMIOS (puntos 63, 64) — un único sistema para premios BIAFYT y
  // de Gym (prize.source/prize.gymId), y para sus códigos de canje.
  // ------------------------------------------------------------------
  const claimPrize = useCallback((prize) => {
    // B1: el gate de "¿alcanza el saldo?" usa el saldo AUTORITATIVO del
    // backend (`points.balance`), la misma fuente que muestra la UI y que
    // valida `RewardController` (422 si no llega). Sin `points` cargado
    // (`status` != "ok") el canje no procede. El `uid` se genera aquí para
    // que sea el MISMO que viaja al backend y queda en el reward local.
    const canClaim = points.status === "ok" && points.balance != null && prize.cost <= points.balance;
    const uid = canClaim ? `r-${Date.now()}` : null;
    // Débito local LEGADO en `identity.user.points` (ya no se muestra; se
    // conserva para el shadow-write y los tests). El saldo visible se
    // revalida desde el backend tras el POST.
    let ok = false;
    setState((prev) => {
      if (!canClaim) return prev;
      ok = true;
      return {
        ...prev,
        identity: {
          ...prev.identity,
          user: { ...prev.identity.user, points: prev.identity.user.points - prize.cost },
          rewards: [
            {
              uid,
              prizeId: prize.id,
              title: prize.title,
              kind: prize.kind,
              source: prize.source ?? "BIAFYT",
              gymId: prize.gymId ?? null,
              transferable: prize.transferable,
              status: "Disponible",
              redemptionCode: generateRedemptionCode(),
              date: new Date().toISOString(),
            },
            ...prev.identity.rewards,
          ],
        },
      };
    });
    // Copia sombra best-effort en el backend (auditoría + débito en SU
    // ledger). El costo lo calcula el backend (RewardRules); aquí NUNCA se
    // envía cost/points/user_id. Si falla (incluido 422 por saldo
    // insuficiente en el ledger backend, p.ej. por puntos de duelos que el
    // backend no conoce todavía), se traga en silencio: no afecta al canje
    // local ya concedido, sin reintento ni cola.
    if (canClaim && state.auth.token) {
      apiClaimReward(state.auth.token, prize.id, uid)
        .then(() => loadPoints(state.auth.token))
        .catch(() => {});
    }
    return ok;
  }, [points.status, points.balance, state.auth.token, loadPoints]);

  // Solo canjea si el reward sigue "Disponible": impide que el mismo
  // código de canje se use dos veces.
  const useReward = useCallback(
    (uid) =>
      patch((prev) => ({
        identity: {
          ...prev.identity,
          rewards: prev.identity.rewards.map((r) => (r.uid === uid && r.status === "Disponible" ? { ...r, status: "Canjeado" } : r)),
        },
      })),
    [patch]
  );

  const giftReward = useCallback(
    (uid, toUserName) =>
      patch((prev) => ({
        identity: {
          ...prev.identity,
          rewards: prev.identity.rewards.map((r) => (r.uid === uid ? { ...r, status: `Regalado a ${toUserName}` } : r)),
        },
      })),
    [patch]
  );

  // ------------------------------------------------------------------
  // SESIÓN (backend Laravel/Sanctum) Y BIOMETRÍA
  // ------------------------------------------------------------------
  const setAuth = useCallback(
    (changes) =>
      patch((prev) => {
        // Invariante: `signedIn: true` nunca puede quedar sin un `auth.token`
        // real acompañándolo — ni el que ya había, ni uno nuevo en este mismo
        // `changes`. `setAuth` es el punto genérico de escritura de `auth`
        // (biometría, App Lock, etc.); blindarlo aquí evita que un futuro
        // caller reintroduzca el bug de biometría (conceder `signedIn` sin
        // sesión real). Los flujos legítimos que sí establecen `signedIn`
        // (`registerRemote`, `loginRemote`, `refreshSession`) escriben
        // `token`+`signedIn` juntos vía `patch` directo, no por aquí.
        const nextToken = "token" in changes ? changes.token : prev.auth.token;
        const safeChanges = changes.signedIn === true && !nextToken ? { ...changes, signedIn: false } : changes;
        return {
          auth: { ...prev.auth, ...safeChanges, biometric: { ...prev.auth.biometric, ...(safeChanges.biometric || {}) } },
        };
      }),
    [patch]
  );

  // Las tres transiciones reales de identidad (registro, login, revalidación
  // de /me) aplican la respuesta del backend de la misma forma: `switchIdentity`
  // (idempotente si el id no cambió — solo refresca nombre/email/iniciales;
  // snapshot+restore completo si sí cambió) + `device.rememberedEmail`, en UN
  // solo patch() junto con `auth` para no dejar un estado intermedio a medias.

  const registerRemote = useCallback(
    async ({ name, email, password }) => {
      const data = await apiRegister({ name, email, password });
      // Un solo patch(): setAuth (token+signedIn) y la identidad nueva
      // (vía switchIdentity, con su propia defensa estructural contra
      // Profile/focusId de una sesión anterior) se aplican juntos.
      patch((prev) => ({
        auth: { ...prev.auth, token: data.token, signedIn: true },
        ...switchIdentity(prev, data.user),
        device: { ...prev.device, rememberedEmail: data.user.email },
      }));
      return data.user;
    },
    [patch]
  );

  const loginRemote = useCallback(
    async ({ email, password }) => {
      const data = await apiLogin({ email, password });
      patch((prev) => ({
        auth: { ...prev.auth, token: data.token, signedIn: true },
        ...switchIdentity(prev, data.user),
        device: { ...prev.device, rememberedEmail: data.user.email },
      }));
      return data.user;
    },
    [patch]
  );

  /**
   * Revalida el token guardado contra /auth/me y, si sigue siendo válido,
   * es el único punto que confirma `signedIn: true` a partir de una
   * revalidación real contra el backend (además de refrescar `identity`/
   * `device.rememberedEmail`). Si el token ya no es válido (401), limpia
   * la sesión local. Lo usa el efecto de arranque (revalidar un token
   * persistido) y el desbloqueo biométrico de `Auth.jsx`: la biometría
   * nunca concede acceso por sí sola, solo dispara esta misma revalidación
   * cuando ya hay un token guardado — así las dos rutas comparten un único
   * criterio de "el token es válido → hay sesión", sin duplicar la lógica.
   */
  const refreshSession = useCallback(async () => {
    const token = state.auth.token;
    if (!token) return null;
    try {
      const data = await apiMe(token);
      patch((prev) => ({
        auth: { ...prev.auth, signedIn: true },
        ...switchIdentity(prev, data.user),
        device: { ...prev.device, rememberedEmail: data.user.email },
      }));
      return data.user;
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        patch(endSession);
      }
      throw err;
    }
  }, [state.auth.token, patch]);

  // Arranque: revalida el token persistido contra /me antes de confiar
  // en `signedIn`, reutilizando `refreshSession` (mismo criterio que el
  // desbloqueo biométrico). Si el token ya no es válido (401), se limpia
  // la sesión local (mismo efecto que signOut, ya manejado dentro de
  // `refreshSession`). Si hay un error de red (backend caído/sin
  // conexión), se conserva la sesión tal como estaba en localStorage:
  // preferimos no bloquear al usuario por una caída temporal del servidor
  // antes que forzar un re-login — no implementa un "modo offline" real,
  // solo evita perder una sesión ya guardada.
  useEffect(() => {
    if (!authChecking) return;
    let cancelled = false;
    // Diferido a un microtask (como en BiometricLock) para no llamar a
    // setState de forma síncrona en el cuerpo del efecto.
    Promise.resolve()
      .then(() => refreshSession())
      .catch(() => {
        // 401 ya fue manejado dentro de refreshSession (endSession);
        // otros errores (red, backend caído) dejan la sesión local intacta.
      })
      .finally(() => {
        if (!cancelled) setAuthChecking(false);
      });
    return () => {
      cancelled = true;
    };
    // Solo debe ejecutarse una vez, al montar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Cierra sesión. Si hay token, intenta revocarlo en el servidor primero,
   * pero un fallo ahí (p.ej. 401 porque ya estaba revocado) nunca impide
   * la limpieza local: el usuario no debe quedar atrapado en una sesión
   * local aparentemente válida con un token del servidor ya muerto.
   *
   * `endSession` limpia `auth` y hace `switchIdentity` a "nadie": la
   * identidad completa (Profile/focusId/puntos/duelos/todo) queda fuera de
   * vista para la siguiente sesión en este dispositivo, con su propia foto
   * guardada para cuando esta misma cuenta vuelva a entrar.
   */
  const signOut = useCallback(async () => {
    const token = state.auth.token;
    if (token) {
      try {
        await apiLogout(token);
      } catch {
        /* token ya inválido u otro error: se limpia la sesión local igual */
      }
    }
    patch(endSession);
  }, [patch, state.auth.token]);

  /** App Lock: bloquea la app (al ir a background) sin tocar signedIn. */
  const lockApp = useCallback(
    () =>
      patch((prev) =>
        prev.auth.signedIn && prev.auth.biometric.enabled ? { auth: { ...prev.auth, locked: true } } : {}
      ),
    [patch]
  );

  /** App Lock: libera el bloqueo tras verificar biometría o contraseña. */
  const unlockApp = useCallback(() => patch((prev) => ({ auth: { ...prev.auth, locked: false } })), [patch]);

  // ------------------------------------------------------------------
  // PERFIL (Fase 2 — backend Laravel/Sanctum, fuente de verdad)
  // ------------------------------------------------------------------

  /** Aplica la respuesta de GET/PATCH /profile a `identity.user.profile`/`focusId` (ver mapProfileFromApi). */
  const applyProfileResponse = useCallback(
    (apiProfile) =>
      patch((prev) => {
        const mapped = mapProfileFromApi(apiProfile);
        return {
          identity: {
            ...prev.identity,
            user: {
              ...prev.identity.user,
              profile: mapped.profile,
              profileSynced: true,
              // focusId undefined = la API no informó un valor utilizable: no se toca el
              // focusId local (Training/buildRoutine no tiene fallback para focusId: null).
              ...(mapped.focusId !== undefined ? { focusId: mapped.focusId } : {}),
            },
          },
        };
      }),
    [patch]
  );

  /** Trae el Profile del backend. Diferido: se llama al entrar a Profile.jsx, no al arranque. */
  const fetchProfile = useCallback(async () => {
    const token = state.auth.token;
    if (!token) return;
    setProfileError("");
    setProfileLoading(true);
    try {
      const data = await apiGetProfile(token);
      applyProfileResponse(data.profile);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        // Sesión inválida: se considera terminada, mismo caso que signOut.
        patch(endSession);
      } else {
        // Red/5xx: se conserva el cache existente (`identity.user.profile`/`profileSynced`) y solo se expone el error.
        setProfileError(apiErrorMessage(err, "No pudimos cargar tu perfil."));
      }
    } finally {
      setProfileLoading(false);
    }
  }, [state.auth.token, applyProfileResponse, patch]);

  /**
   * Guarda cambios de Profile (PATCH explícito, nunca autosave). En éxito
   * aplica la respuesta del backend como nuevo estado. En cualquier error
   * (401/422/5xx/red) relanza para que el formulario decida la UX (mensaje
   * inline, conservar lo escrito); en 401 además limpia la sesión local.
   */
  const updateProfile = useCallback(
    async (changes) => {
      const token = state.auth.token;
      const payload = buildProfilePatchPayload(changes);
      try {
        const data = await apiUpdateProfile(token, payload);
        applyProfileResponse(data.profile);
        return data.profile;
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          // Sesión inválida: se considera terminada, mismo caso que signOut.
          patch(endSession);
        }
        throw err;
      }
    },
    [state.auth.token, applyProfileResponse, patch]
  );

  // ------------------------------------------------------------------
  // MIS RUTINAS
  // ------------------------------------------------------------------
  const saveRoutine = useCallback((routineDraft) => {
    const id = routineDraft.id ?? `r-${Date.now()}`;
    setState((prev) => {
      const exists = prev.identity.customRoutines.some((r) => r.id === id);
      const entry = { ...routineDraft, id, updatedAt: new Date().toISOString() };
      return {
        ...prev,
        identity: {
          ...prev.identity,
          customRoutines: exists
            ? prev.identity.customRoutines.map((r) => (r.id === id ? entry : r))
            : [entry, ...prev.identity.customRoutines],
          activeRoutineId: prev.identity.activeRoutineId ?? id,
        },
      };
    });
    return id;
  }, []);

  const deleteRoutine = useCallback(
    (id) =>
      patch((prev) => ({
        identity: {
          ...prev.identity,
          customRoutines: prev.identity.customRoutines.filter((r) => r.id !== id),
          activeRoutineId: prev.identity.activeRoutineId === id ? null : prev.identity.activeRoutineId,
        },
      })),
    [patch]
  );

  const setActiveRoutine = useCallback(
    (id) => patch((prev) => ({ identity: { ...prev.identity, activeRoutineId: id } })),
    [patch]
  );

  // ------------------------------------------------------------------
  // CALENDARIO / AGENDA
  // ------------------------------------------------------------------
  const scheduleSession = useCallback(
    (entry) =>
      patch((prev) => ({
        identity: {
          ...prev.identity,
          agenda: [...prev.identity.agenda.filter((a) => a.date !== entry.date), { id: `ag-${entry.date}`, ...entry }],
        },
      })),
    [patch]
  );

  const unscheduleSession = useCallback(
    (date) =>
      patch((prev) => ({
        identity: { ...prev.identity, agenda: prev.identity.agenda.filter((a) => a.date !== date) },
      })),
    [patch]
  );

  // ------------------------------------------------------------------
  // RETOS DIARIOS
  // ------------------------------------------------------------------
  const bumpChallenge = useCallback(
    (dayKey, metric, amount = 1) =>
      patch((prev) => {
        const day = prev.identity.challengeProgress[dayKey] ?? { claimed: [] };
        return {
          identity: {
            ...prev.identity,
            challengeProgress: {
              ...prev.identity.challengeProgress,
              [dayKey]: { ...day, [metric]: (day[metric] ?? 0) + amount },
            },
          },
        };
      }),
    [patch]
  );

  const claimChallenge = useCallback((dayKey, challengeId, reward) => {
    // Chequeo síncrono desde el `state` actual, SOLO para decidir si disparar
    // la copia sombra (el `setState` de abajo mantiene su propio guard, que
    // es la fuente de verdad del comportamiento local, sin cambios).
    const alreadyClaimed = (state.identity.challengeProgress[dayKey]?.claimed ?? []).includes(challengeId);
    let granted = false;
    setState((prev) => {
      const day = prev.identity.challengeProgress[dayKey] ?? { claimed: [] };
      if (day.claimed.includes(challengeId)) return prev;
      granted = true;
      return {
        ...prev,
        identity: {
          ...prev.identity,
          user: { ...prev.identity.user, points: prev.identity.user.points + reward },
          challengeProgress: {
            ...prev.identity.challengeProgress,
            [dayKey]: { ...day, claimed: [...day.claimed, challengeId] },
          },
        },
      };
    });
    // Copia sombra best-effort: solo si el claim local ocurrió y hay sesión.
    // El backend calcula el reward desde sus reglas; aquí NO se envía
    // reward/points. Un fallo se traga en silencio (sin reintento ni cola).
    if (!alreadyClaimed && state.auth.token) {
      apiClaimChallenge(state.auth.token, challengeId, dayKey)
        .then(() => loadPoints(state.auth.token))
        .catch(() => {});
    }
    return granted;
  }, [state.identity.challengeProgress, state.auth.token, loadPoints]);

  // ------------------------------------------------------------------
  // NOTICIAS Y PROMOCIONES
  // ------------------------------------------------------------------
  const markPostRead = useCallback(
    (postId) =>
      patch((prev) =>
        prev.identity.readPosts.includes(postId)
          ? {}
          : { identity: { ...prev.identity, readPosts: [...prev.identity.readPosts, postId] } }
      ),
    [patch]
  );

  /** Posición y visibilidad del avatar flotante (dispositivo, no identidad). */
  const setCoach = useCallback(
    (changes) => patch((prev) => ({ device: { ...prev.device, coach: { ...prev.device.coach, ...changes } } })),
    [patch]
  );

  const resetAll = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setState(defaultState);
  }, []);

  // ------------------------------------------------------------------
  // DERIVADOS
  // ------------------------------------------------------------------
  const gym = useMemo(() => findGym(state.device.gyms, state.identity.user.gymId), [state.device.gyms, state.identity.user.gymId]);
  const branch = useMemo(() => findBranch(gym, state.identity.user.branchId), [gym, state.identity.user.branchId]);
  /**
   * Rutina activa: si el usuario creó una y la marcó como activa, esa
   * manda; si no, se genera automáticamente desde su enfoque.
   */
  const routine = useMemo(() => {
    const custom = state.identity.customRoutines.find((r) => r.id === state.identity.activeRoutineId);
    if (custom && custom.exercises.length > 0) return { ...custom, custom: true };
    return { ...buildRoutine(state.identity.user.focusId, exerciseCatalog), custom: false };
  }, [state.identity.customRoutines, state.identity.activeRoutineId, state.identity.user.focusId, exerciseCatalog]);

  /** Usuario actual normalizado como participante de ranking/duelos. */
  const me = useMemo(
    () => ({
      id: state.identity.user.id,
      name: state.identity.user.name,
      initials: state.identity.user.initials,
      gymId: state.identity.user.gymId,
      branchId: state.identity.user.branchId,
      city: state.identity.user.city,
      country: state.identity.user.country,
      // B1: el saldo del usuario en el ranking sale del backend
      // (`points.balance`), no del contador local. 0 mientras no cargó.
      points: points.status === "ok" && points.balance != null ? points.balance : 0,
      streak: state.identity.user.streak,
      variation: 0,
      daysOnTop: 0,
      rankingOptIn: state.identity.settings.rankingOptIn,
      profile: state.identity.user.profile,
      stats: state.identity.user.stats,
      duels: state.identity.user.duels,
      isMe: true,
    }),
    [state.identity.user, state.identity.settings.rankingOptIn, points.status, points.balance]
  );

  /** RANKINGS POR ÁMBITO (puntos 57, 58). */
  const ranking = useCallback(
    (scope) => {
      const all = [...communityUsers, me];
      const filtered = all.filter((u) => {
        if (!u.rankingOptIn) return false; // punto 58
        switch (scope) {
          case "group":
            return u.branchId === me.branchId && (u.isMe || ["u-andrea", "u-david", "u-sofia"].includes(u.id));
          case "branch":
            return u.branchId === me.branchId;
          case "gym":
            return u.gymId === me.gymId;
          case "city":
            return u.city === me.city;
          case "country":
            return u.country === me.country;
          case "global":
          default:
            return true;
        }
      });
      return filtered
        .slice()
        .sort((a, b) => b.points - a.points)
        .map((u, i) => ({ ...u, position: i + 1 }));
    },
    [me]
  );

  const value = {
    state,
    setState,
    patch,
    gym,
    branch,
    routine,
    me,
    ranking,
    community: communityUsers,
    authChecking,
    profileLoading,
    profileError,
    exerciseCatalog,
    machineCatalog,
    streak,
    duels,
    points,
    actions: {
      updateUser,
      refreshStreak: () => loadStreak(state.auth.token),
      refreshDuels: () => loadDuels(state.auth.token),
      refreshPoints: () => loadPoints(state.auth.token),
      loadMorePoints,
      selectGym,
      registerGym,
      completeOnboarding,
      updateDeviceSettings,
      updateIdentitySettings,
      addPoints,
      lockPoints,
      releasePoints,
      addActivity,
      checkIn,
      checkOut,
      selectPlan,
      createDuel,
      acceptDuel,
      rejectDuel,
      cancelDuel,
      submitDuelRun,
      claimPrize,
      useReward,
      giftReward,
      notify,
      markNotificationsRead,
      setAuth,
      registerRemote,
      loginRemote,
      refreshSession,
      signOut,
      lockApp,
      unlockApp,
      fetchProfile,
      updateProfile,
      saveRoutine,
      deleteRoutine,
      setActiveRoutine,
      scheduleSession,
      unscheduleSession,
      bumpChallenge,
      claimChallenge,
      markPostRead,
      setCoach,
      resetAll,
    },
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp debe usarse dentro de <AppProvider>");
  return ctx;
}
