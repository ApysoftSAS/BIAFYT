/* eslint-disable react-refresh/only-export-components */
/**
 * BIAFYT ADMIN — SESIÓN
 * ---------------------------------------------------------------
 * Sesión Sanctum (como las demás apps) + la señal `isPlatformAdmin`,
 * derivada SIEMPRE del backend: `GET /auth/me` → `user.is_platform_admin`.
 * Nunca se confía en un flag guardado en LocalStorage — solo se persiste el
 * token, y al arrancar se revalida contra `/auth/me`.
 *
 * El backend gatea además cada endpoint `/admin/*` por su cuenta (404 si no
 * eres platform admin), así que `isPlatformAdmin` solo decide qué UI mostrar,
 * no es una barrera de seguridad.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { STORAGE_KEY } from "../config/appConfig.js";
import {
  apiLogin,
  apiLogout,
  apiMe,
  apiRegister,
  ApiError,
  apiGetGymRegistrationRequests,
  apiGetGymRegistrationRequest,
  apiApproveGymRegistrationRequest,
  apiRejectGymRegistrationRequest,
  apiGetAdminGyms,
  apiAdminListEquipment,
  apiAdminCreateEquipment,
  apiAdminUpdateEquipment,
  apiAdminListEquipmentRequests,
  apiAdminGetEquipmentRequest,
  apiAdminStartEquipmentReview,
  apiAdminRequestEquipmentChanges,
  apiAdminCorrectEquipmentRequest,
  apiAdminRejectEquipmentRequest,
  apiAdminApproveEquipmentRequest,
  apiAdminListPromotions,
  apiAdminCreatePromotion,
} from "../utils/api.js";
import { initialsOf } from "../utils/format.js";

const SessionContext = createContext(null);

const DEFAULT_AUTH = {
  token: null,
  signedIn: false,
  isPlatformAdmin: false,
  user: { id: null, name: "", email: "", initials: "" },
};

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
    // El flag persistido no se confía: se recalcula en el arranque.
    auth.isPlatformAdmin = false;
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

  useEffect(() => {
    try {
      // Solo se persiste el token + identidad. `isPlatformAdmin` se
      // recalcula del backend en cada arranque, nunca se lee de aquí.
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ auth: { token: auth.token, signedIn: auth.signedIn, user: auth.user } })
      );
    } catch {
      /* almacenamiento no disponible */
    }
  }, [auth]);

  const endSession = useCallback(() => setAuth({ ...DEFAULT_AUTH }), []);

  const applyMe = useCallback((apiUser) => {
    setAuth((prev) => ({
      ...prev,
      signedIn: true,
      isPlatformAdmin: Boolean(apiUser.is_platform_admin),
      user: userFromApi(apiUser),
    }));
  }, []);

  const registerRemote = useCallback(
    async ({ name, email, password }) => {
      const data = await apiRegister({ name, email, password });
      setAuth((prev) => ({ ...prev, token: data.token }));
      // El registro no dice si eres platform admin; se resuelve con /auth/me.
      const me = await apiMe(data.token);
      applyMe(me.user);
    },
    [applyMe]
  );

  const loginRemote = useCallback(
    async ({ email, password }) => {
      const data = await apiLogin({ email, password });
      setAuth((prev) => ({ ...prev, token: data.token }));
      const me = await apiMe(data.token);
      applyMe(me.user);
    },
    [applyMe]
  );

  const refreshSession = useCallback(async () => {
    if (!auth.token) return;
    try {
      const data = await apiMe(auth.token);
      applyMe(data.user);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) endSession();
      throw err;
    }
  }, [auth.token, applyMe, endSession]);

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

  // Arranque: revalida el token persistido antes de confiar en `signedIn`
  // y `isPlatformAdmin`.
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

  // Acciones de administración: el token se inyecta aquí (nunca lo tocan las
  // pantallas) y `runAuthed` cierra la sesión ante un 401.
  const adminActions = useMemo(
    () => ({
      listRequests: (status) => runAuthed(() => apiGetGymRegistrationRequests(auth.token, status)),
      getRequest: (id) => runAuthed(() => apiGetGymRegistrationRequest(auth.token, id)),
      approveRequest: (id, note) => runAuthed(() => apiApproveGymRegistrationRequest(auth.token, id, note)),
      rejectRequest: (id, note) => runAuthed(() => apiRejectGymRegistrationRequest(auth.token, id, note)),
      listGyms: () => runAuthed(() => apiGetAdminGyms(auth.token)),

      // Catálogo global de equipamiento.
      listEquipment: (active) => runAuthed(() => apiAdminListEquipment(auth.token, active)),
      createEquipment: (payload) => runAuthed(() => apiAdminCreateEquipment(auth.token, payload)),
      updateEquipment: (id, payload) => runAuthed(() => apiAdminUpdateEquipment(auth.token, id, payload)),

      // Solicitudes de equipamiento de los gyms.
      listEquipmentRequests: (filters) => runAuthed(() => apiAdminListEquipmentRequests(auth.token, filters)),
      getEquipmentRequest: (id) => runAuthed(() => apiAdminGetEquipmentRequest(auth.token, id)),
      startEquipmentReview: (id) => runAuthed(() => apiAdminStartEquipmentReview(auth.token, id)),
      requestEquipmentChanges: (id, note) => runAuthed(() => apiAdminRequestEquipmentChanges(auth.token, id, note)),
      correctEquipmentRequest: (id, payload) => runAuthed(() => apiAdminCorrectEquipmentRequest(auth.token, id, payload)),
      rejectEquipmentRequest: (id, note) => runAuthed(() => apiAdminRejectEquipmentRequest(auth.token, id, note)),
      approveEquipmentRequest: (id, opts) => runAuthed(() => apiAdminApproveEquipmentRequest(auth.token, id, opts)),

      // Promociones de plataforma (Promotion V0).
      listPromotions: () => runAuthed(() => apiAdminListPromotions(auth.token)),
      createPromotion: (payload) => runAuthed(() => apiAdminCreatePromotion(auth.token, payload)),
    }),
    [auth.token, runAuthed]
  );

  const value = useMemo(
    () => ({
      auth,
      authChecking,
      actions: { registerRemote, loginRemote, refreshSession, signOut, runAuthed, ...adminActions },
    }),
    [auth, authChecking, registerRemote, loginRemote, refreshSession, signOut, runAuthed, adminActions]
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession debe usarse dentro de <SessionProvider>");
  return ctx;
}
