/**
 * BIAFYT — CONFIGURACIÓN DE APLICACIÓN (punto 93)
 * ---------------------------------------------------------------
 * El nombre, el identificador y la versión NO se escriben a mano en
 * ningún componente. Vite los inyecta desde package.json y
 * capacitor.config.json (ver vite.config.js).
 */

/* global __APP_NAME__, __APP_ID__, __APP_VERSION__, __APP_SHORT_NAME__ */

export const appConfig = {
  name: __APP_NAME__,
  shortName: __APP_SHORT_NAME__,
  id: __APP_ID__,
  version: __APP_VERSION__,
};

/** Clave raíz de persistencia, derivada del identificador. */
export const STORAGE_KEY = `${appConfig.id}.state.v1`;

export default appConfig;
