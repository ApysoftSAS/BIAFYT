/* eslint-disable react-refresh/only-export-components */
/**
 * BIAFYT GYM — SESIÓN (foundation)
 * ---------------------------------------------------------------
 * Versión mínima del `CoachContext` de frontend-couch: SOLO sesión
 * (Sanctum). Sin relaciones, sin dominio Gym, sin roles.
 *
 * Persiste `auth` (token + user) en LocalStorage bajo `STORAGE_KEY`
 * (derivada del appId de Gym → clave distinta de las otras apps). Al
 * arrancar, revalida cualquier token contra `GET /auth/me`.
 *
 * IMPORTANTE: el usuario autenticado aquí es un `User` genérico. NO hay
 * verificación de rol/permiso de Gym — la autorización organizacional
 * (staff / gym_admin / organization scope) está diferida a la fase
 * Coach/Gym (BIAFYT_BUSINESS_CORE.md §6, §46 D8, §47).
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { STORAGE_KEY } from "../config/appConfig.js";
import { apiLogin, apiLogout, apiMe, apiRegister, ApiError } from "../utils/api.js";
import { initialsOf } from "../utils/format.js";

const SessionContext = createContext(null);

const DEFAULT_AUTH = {
  token: null,
  signedIn: false,
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
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ auth }));
    } catch {
      /* almacenamiento no disponible */
    }
  }, [auth]);

  const endSession = useCallback(() => setAuth({ ...DEFAULT_AUTH }), []);

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

  const value = useMemo(
    () => ({
      auth,
      authChecking,
      actions: { registerRemote, loginRemote, refreshSession, signOut },
    }),
    [auth, authChecking, registerRemote, loginRemote, refreshSession, signOut]
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession debe usarse dentro de <SessionProvider>");
  return ctx;
}
