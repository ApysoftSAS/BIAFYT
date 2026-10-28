/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { STORAGE_KEY } from "../config/appConfig.js";
import {
  apiRegister,
  apiLogin,
  apiLogout,
  apiMe,
  ApiError,
  apiGetCoachRelationships,
  apiRequestAthlete,
  apiAcceptCoachRelationship,
  apiRevokeCoachRelationship,
  apiGetAthleteDetail,
  apiGetAthleteNotes,
  apiCreateAthleteNote,
  apiDeleteAthleteNote,
  apiGetAthletePrograms,
  apiCreateAthleteProgram,
  apiUpdateAthleteProgram,
  apiDeleteAthleteProgram,
  apiGetExerciseCatalog,
  apiGetGymAssignments,
  apiGetGymEquipment,
} from "../utils/api.js";
import { initialsOf } from "../utils/format.js";

/**
 * BIAFYT COUCH — ESTADO GLOBAL
 * ---------------------------------------------------------------
 * Versión mínima del `AppContext` de `frontend-usuario`: solo sesión
 * (Sanctum) + relaciones coach↔atleta, que es todo lo que el backend
 * expone hoy para el rol coach. Sin snapshots por identidad, sin
 * biometría, sin onboarding — la app Couch no maneja datos físicos
 * ni entrenamiento propio.
 *
 * Persistencia: solo `auth` (token/signedIn/user) en LocalStorage bajo
 * `STORAGE_KEY` (derivada del appId de Couch, distinta de la app de
 * usuario). Las relaciones NO se persisten: se recargan del backend.
 */

const CoachContext = createContext(null);

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
    const auth = { ...DEFAULT_AUTH, ...(parsed.auth || {}), user: { ...DEFAULT_AUTH.user, ...(parsed.auth?.user || {}) } };
    // Invariante: `signedIn` nunca se confía sin token; el arranque
    // revalida cualquier token contra /auth/me de todos modos.
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

export function CoachProvider({ children }) {
  const [auth, setAuth] = useState(loadAuth);
  const [authChecking, setAuthChecking] = useState(() => Boolean(auth.token));

  const [relationships, setRelationships] = useState([]);
  const [relationshipsLoading, setRelationshipsLoading] = useState(false);
  const [relationshipsError, setRelationshipsError] = useState("");

  // Persistencia de la sesión.
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ auth }));
    } catch {
      /* almacenamiento no disponible */
    }
  }, [auth]);

  const endSession = useCallback(() => {
    setAuth({ ...DEFAULT_AUTH });
    setRelationships([]);
    setRelationshipsError("");
  }, []);

  // Ejecuta una llamada autenticada; ante un 401 (token revocado o
  // expirado) termina la sesión local y relanza el error, para que la
  // pantalla no muestre el "Unauthenticated." crudo del backend y la app
  // vuelva a <Auth/>.
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

  // ---------------- SESIÓN ----------------
  const registerRemote = useCallback(async ({ name, email, password }) => {
    const data = await apiRegister({ name, email, password });
    setAuth({ token: data.token, signedIn: true, user: userFromApi(data.user) });
    return data.user;
  }, []);

  const loginRemote = useCallback(async ({ email, password }) => {
    const data = await apiLogin({ email, password });
    setAuth({ token: data.token, signedIn: true, user: userFromApi(data.user) });
    return data.user;
  }, []);

  const refreshSession = useCallback(async () => {
    if (!auth.token) return null;
    try {
      const data = await apiMe(auth.token);
      setAuth((prev) => ({ ...prev, signedIn: true, user: userFromApi(data.user) }));
      return data.user;
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

  // Arranque: revalida el token persistido contra /auth/me antes de
  // confiar en `signedIn`. 401 → sesión terminada; error de red → se
  // conserva la sesión local tal cual (no forzamos re-login por una
  // caída temporal del backend).
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

  // ---------------- RELACIONES COACH ↔ ATLETA ----------------
  const loadRelationships = useCallback(async () => {
    if (!auth.token) return;
    setRelationshipsLoading(true);
    setRelationshipsError("");
    try {
      const data = await apiGetCoachRelationships(auth.token);
      setRelationships(data.coach_relationships ?? []);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) endSession();
      else setRelationshipsError("No pudimos cargar tus relaciones.");
    } finally {
      setRelationshipsLoading(false);
    }
  }, [auth.token, endSession]);

  // Carga inicial de relaciones cuando hay sesión confirmada. Diferido a
  // un microtask para no llamar a setState de forma síncrona en el cuerpo
  // del efecto (mismo patrón que el arranque de sesión).
  useEffect(() => {
    if (!auth.signedIn || authChecking) return;
    let cancelled = false;
    Promise.resolve().then(() => {
      if (!cancelled) loadRelationships();
    });
    return () => {
      cancelled = true;
    };
  }, [auth.signedIn, authChecking, loadRelationships]);

  const requestAthlete = useCallback(
    async (athleteUserId) => {
      const res = await runAuthed(() => apiRequestAthlete(auth.token, athleteUserId));
      await loadRelationships();
      return res?.coach_relationship ?? null;
    },
    [auth.token, runAuthed, loadRelationships]
  );

  const acceptRelationship = useCallback(
    async (id) => {
      await runAuthed(() => apiAcceptCoachRelationship(auth.token, id));
      await loadRelationships();
    },
    [auth.token, runAuthed, loadRelationships]
  );

  const revokeRelationship = useCallback(
    async (id) => {
      await runAuthed(() => apiRevokeCoachRelationship(auth.token, id));
      await loadRelationships();
    },
    [auth.token, runAuthed, loadRelationships]
  );

  // ---------------- COACH MVP — ATLETA (detalle + notas) ----------------
  // Callers finos del backend, envueltos en `runAuthed` para que un 401
  // cierre la sesión. El detalle del atleta NO se guarda en el contexto:
  // es por-pantalla (mismo criterio que el `busyId`/`error` local de
  // Athletes.jsx). El contexto solo aporta el guard de 401 y el token.
  const getAthleteDetail = useCallback(
    (athleteUserId) => runAuthed(() => apiGetAthleteDetail(auth.token, athleteUserId)),
    [auth.token, runAuthed]
  );

  const getAthleteNotes = useCallback(
    (athleteUserId) => runAuthed(() => apiGetAthleteNotes(auth.token, athleteUserId)),
    [auth.token, runAuthed]
  );

  const createAthleteNote = useCallback(
    (athleteUserId, body) => runAuthed(() => apiCreateAthleteNote(auth.token, athleteUserId, body)),
    [auth.token, runAuthed]
  );

  const deleteAthleteNote = useCallback(
    (noteId) => runAuthed(() => apiDeleteAthleteNote(auth.token, noteId)),
    [auth.token, runAuthed]
  );

  // ---------------- COACH — RUTINAS DEL ATLETA (slice D-COACH-PROGRAMS) ----------------
  const getAthletePrograms = useCallback(
    (athleteUserId) => runAuthed(() => apiGetAthletePrograms(auth.token, athleteUserId)),
    [auth.token, runAuthed]
  );

  const createAthleteProgram = useCallback(
    (athleteUserId, payload) => runAuthed(() => apiCreateAthleteProgram(auth.token, athleteUserId, payload)),
    [auth.token, runAuthed]
  );

  const updateAthleteProgram = useCallback(
    (athleteUserId, programId, payload) =>
      runAuthed(() => apiUpdateAthleteProgram(auth.token, athleteUserId, programId, payload)),
    [auth.token, runAuthed]
  );

  const deleteAthleteProgram = useCallback(
    (athleteUserId, programId) => runAuthed(() => apiDeleteAthleteProgram(auth.token, athleteUserId, programId)),
    [auth.token, runAuthed]
  );

  // Catálogo global de ejercicios (público, sin token). El gym de referencia
  // y su inventario se consultan al vuelo desde el editor.
  const getExerciseCatalog = useCallback(() => apiGetExerciseCatalog(), []);

  const getCoachGyms = useCallback(
    () => runAuthed(() => apiGetGymAssignments(auth.token)),
    [auth.token, runAuthed]
  );

  const getGymEquipment = useCallback((gymId) => apiGetGymEquipment(gymId), []);

  const value = useMemo(
    () => ({
      auth,
      authChecking,
      relationships,
      relationshipsLoading,
      relationshipsError,
      actions: {
        registerRemote,
        loginRemote,
        refreshSession,
        signOut,
        loadRelationships,
        requestAthlete,
        acceptRelationship,
        revokeRelationship,
        getAthleteDetail,
        getAthleteNotes,
        createAthleteNote,
        deleteAthleteNote,
        getAthletePrograms,
        createAthleteProgram,
        updateAthleteProgram,
        deleteAthleteProgram,
        getExerciseCatalog,
        getCoachGyms,
        getGymEquipment,
      },
    }),
    [
      auth,
      authChecking,
      relationships,
      relationshipsLoading,
      relationshipsError,
      registerRemote,
      loginRemote,
      refreshSession,
      signOut,
      loadRelationships,
      requestAthlete,
      acceptRelationship,
      revokeRelationship,
      getAthleteDetail,
      getAthleteNotes,
      createAthleteNote,
      deleteAthleteNote,
      getAthletePrograms,
      createAthleteProgram,
      updateAthleteProgram,
      deleteAthleteProgram,
      getExerciseCatalog,
      getCoachGyms,
      getGymEquipment,
    ]
  );

  return <CoachContext.Provider value={value}>{children}</CoachContext.Provider>;
}

export function useCoach() {
  const ctx = useContext(CoachContext);
  if (!ctx) throw new Error("useCoach debe usarse dentro de <CoachProvider>");
  return ctx;
}
