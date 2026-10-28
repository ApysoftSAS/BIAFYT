/**
 * BIAFYT GYM WEB — CONFIGURACIÓN DE APLICACIÓN
 * ---------------------------------------------------------------
 * Nombre / id / versión NO se escriben a mano en ningún componente.
 * Vite los inyecta desde `package.json` y `app.config.json` (ver
 * `vite.config.js`). Misma disciplina que frontend-usuario, adaptada a
 * una app sin Capacitor (fuente = `app.config.json`).
 */

/* global __APP_NAME__, __APP_ID__, __APP_VERSION__, __APP_SHORT_NAME__ */

export const appConfig = {
  name: __APP_NAME__,
  shortName: __APP_SHORT_NAME__,
  id: __APP_ID__,
  version: __APP_VERSION__,
};

/** Clave raíz de persistencia local, derivada del identificador. */
export const STORAGE_KEY = `${appConfig.id}.state.v1`;

export default appConfig;
