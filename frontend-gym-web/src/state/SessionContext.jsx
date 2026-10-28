/* eslint-disable react-refresh/only-export-components */
/**
 * BIAFYT GYM WEB — SESIÓN + ACCESO DE GYM
 * ---------------------------------------------------------------
 * Sesión Sanctum (como frontend-couch) + el acceso de administración de
 * Gym del slice D-GYM.
 *
 * Tras confirmar la sesión, se consulta `GET /me/gym-assignments` (solo
 * trae assignments ACTIVOS) y se derivan los gyms en los que el usuario es
 * `gym_admin` (`utils/gym.js#adminGymsFrom`). El `gym_id` NUNCA se toma de
 * LocalStorage ni se inventa: sale exclusivamente de esa respuesta del
 * backend. Sin `gym_admin` activo → estado `none` ("Sin acceso de Gym").
 *
 * `staff` / `gym_admin` NO se conceden desde aquí (bootstrap manual en BD —
 * D-GYM-3). Este contexto solo LEE el rol para gatear la UI.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { STORAGE_KEY } from "../config/appConfig.js";
import {
  apiLogin,
  apiLogout,
  apiMe,
  apiRegister,
  ApiError,
  apiGetGymAssignments,
  apiGetGyms,
  apiGetGymMembers,
  apiGetGymCoaches,
  apiLookupGymUser,
  apiCreateGymAssignment,
  apiRevokeGymAssignment,
  apiGetGymMemberDetail,
  apiGetGymEquipment,
  apiSetGymEquipment,
  apiRemoveGymEquipment,
  apiGetGymEquipmentRequests,
  apiCreateGymEquipmentRequest,
  apiUpdateGymEquipmentRequest,
} from "../utils/api.js";
import { adminGymsFrom } from "../utils/gym.js";
import { initialsOf } from "../utils/format.js";

const SessionContext = createContext(null);

const DEFAULT_AUTH = {
  token: null,
  signedIn: false,
  user: { id: null, name: "", email: "", initials: "" },
};

// status: "loading" | "ok" | "none"
const DEFAULT_GYM_ACCESS = { status: "loading", gyms: [], activeGymId: null, error: "" };

function loadAuth() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_AUTH;
    const parsed = JSON.parse(raw);
    const auth = {
      ...DEFAULT_AUTH,
      ...(parsed.auth || {}),
      user: { ...DEFAULT_AUTH.user, ...(parsed.auth?.user || {}) },
    };
    if (!auth.token) auth.signedIn = false;
    return auth;
  } catch {
    return DEFAULT_AUTH;
  }
}

function userFromApi(apiUser) {
  return {
    id: apiUser.id,
    name: apiUser.name ?? "",
    email: apiUser.email ?? "",
    initials: initialsOf(apiUser.name ?? ""),
  };
}

export function SessionProvider({ children }) {
  const [auth, setAuth] = useState(loadAuth);
  const [authChecking, setAuthChecking] = useState(() => Boolean(auth.token));
  const [gymAccess, setGymAccess] = useState(DEFAULT_GYM_ACCESS);

  useEffect(() => {
    try {
      // Solo `auth` se persiste. El acceso de Gym se recarga del backend
      // en cada arranque — nunca se confía en un gym_id de LocalStorage.
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ auth }));
    } catch {
      /* almacenamiento no disponible */
    }
  }, [auth]);

  const endSession = useCallback(() => {
    setAuth({ ...DEFAULT_AUTH });
    setGymAccess(DEFAULT_GYM_ACCESS);
  }, []);

  const runAuthed = useCallback(
    async (fn) => {
      try {
        return await fn();
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) endSession();
        throw err;
      }
    },
    [endSession]
  );

  const registerRemote = useCallback(async ({ name, email, password }) => {
    const data = await apiRegister({ name, email, password });
    setAuth({ token: data.token, signedIn: true, user: userFromApi(data.user) });
  }, []);

  const loginRemote = useCallback(async ({ email, password }) => {
    const data = await apiLogin({ email, password });
    setAuth({ token: data.token, signedIn: true, user: userFromApi(data.user) });
  }, []);

  const refreshSession = useCallback(async () => {
    if (!auth.token) return;
    try {
      const data = await apiMe(auth.token);
      setAuth((prev) => ({ ...prev, signedIn: true, user: userFromApi(data.user) }));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) endSession();
      throw err;
    }
  }, [auth.token, endSession]);

  const signOut = useCallback(async () => {
    if (auth.token) {
      try {
        await apiLogout(auth.token);
      } catch {
        /* token ya inválido u otro error: se limpia la sesión local igual */
      }
    }
    endSession();
  }, [auth.token, endSession]);

  // Acceso de Gym: gyms en los que el usuario es gym_admin activo.
  const loadGymAccess = useCallback(async () => {
    if (!auth.token) return;
    setGymAccess((s) => ({ ...s, status: s.gyms.length ? "ok" : "loading", error: "" }));
    try {
      const data = await apiGetGymAssignments(auth.token);
      const gyms = adminGymsFrom(data.gym_assignments);
      setGymAccess((prev) => {
        if (gyms.length === 0) return { status: "none", gyms: [], activeGymId: null, error: "" };
        const keep = gyms.some((g) => g.id === prev.activeGymId) ? prev.activeGymId : gyms[0].id;
        return { status: "ok", gyms, activeGymId: keep, error: "" };
      });
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        endSession();
        return;
      }
      setGymAccess({ status: "none", gyms: [], activeGymId: null, error: "No pudimos verificar tu acceso de Gym." });
    }
  }, [auth.token, endSession]);

  // Arranque: revalida el token persistido antes de confiar en `signedIn`.
  useEffect(() => {
    if (!authChecking) return;
    let cancelled = false;
    Promise.resolve()
      .then(() => refreshSession())
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setAuthChecking(false);
      });
    return () => {
      cancelled = true;
    };
    // Solo al montar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cargar el acceso de Gym cuando hay sesión confirmada.
  useEffect(() => {
    if (!auth.signedIn || authChecking) return;
    let cancelled = false;
    Promise.resolve().then(() => {
      if (!cancelled) loadGymAccess();
    });
    return () => {
      cancelled = true;
    };
  }, [auth.signedIn, authChecking, loadGymAccess]);

  const selectGym = useCallback((gymId) => {
    setGymAccess((s) => (s.gyms.some((g) => g.id === gymId) ? { ...s, activeGymId: gymId } : s));
  }, []);

  const activeGymId = gymAccess.activeGymId;

  const gymActions = useMemo(
    () => ({
      getMembers: () => runAuthed(() => apiGetGymMembers(auth.token, activeGymId)),
      getCoaches: () => runAuthed(() => apiGetGymCoaches(auth.token, activeGymId)),
      lookupUser: (email) => runAuthed(() => apiLookupGymUser(auth.token, activeGymId, email)),
      createAssignment: (payload) => runAuthed(() => apiCreateGymAssignment(auth.token, activeGymId, payload)),
      revokeAssignment: (assignmentId) => runAuthed(() => apiRevokeGymAssignment(auth.token, activeGymId, assignmentId)),
      getMemberDetail: (userId) => runAuthed(() => apiGetGymMemberDetail(auth.token, activeGymId, userId)),
      getEquipment: () => runAuthed(() => apiGetGymEquipment(auth.token, activeGymId)),
      setEquipment: (equipmentId, available) =>
        runAuthed(() => apiSetGymEquipment(auth.token, activeGymId, equipmentId, available)),
      removeEquipment: (equipmentId) => runAuthed(() => apiRemoveGymEquipment(auth.token, activeGymId, equipmentId)),
      getEquipmentRequests: () => runAuthed(() => apiGetGymEquipmentRequests(auth.token, activeGymId)),
      createEquipmentRequest: (payload) =>
        runAuthed(() => apiCreateGymEquipmentRequest(auth.token, activeGymId, payload)),
      updateEquipmentRequest: (id, payload) =>
        runAuthed(() => apiUpdateGymEquipmentRequest(auth.token, activeGymId, id, payload)),
      getBranches: async () => {
        const { gyms } = await apiGetGyms();
        return gyms.find((g) => g.id === activeGymId)?.branches ?? [];
      },
    }),
    [auth.token, activeGymId, runAuthed]
  );

  const value = useMemo(
    () => ({
      auth,
      authChecking,
      gymAccess,
      actions: {
        registerRemote,
        loginRemote,
        refreshSession,
        signOut,
        selectGym,
        reloadGymAccess: loadGymAccess,
        ...gymActions,
      },
    }),
    [auth, authChecking, gymAccess, registerRemote, loginRemote, refreshSession, signOut, selectGym, loadGymAccess, gymActions]
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession debe usarse dentro de <SessionProvider>");
  return ctx;
}
