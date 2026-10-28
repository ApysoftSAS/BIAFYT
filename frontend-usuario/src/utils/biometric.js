/**
 * BIAFYT — BIOMETRÍA MULTIPLATAFORMA
 * ---------------------------------------------------------------
 * La app corre en tres contextos y en cada uno la huella/rostro se
 * resuelve distinto:
 *
 *  1. NATIVO (Android / iOS con Capacitor + plugin de biometría)
 *     → huella, Face ID o Touch ID reales del sistema operativo.
 *  2. NAVEGADOR con WebAuthn (requiere HTTPS o localhost)
 *     → huella o rostro del dispositivo vía autenticador de plataforma.
 *  3. DEMO (cualquier navegador, incluido HTTP en una IP de red)
 *     → simulación visible, para poder mostrar el flujo completo.
 *
 * El resto de la app no necesita saber en cuál está: llama a
 * `enroll()` y `verify()` y recibe el mismo resultado.
 */

import {
  biometricAvailable as webauthnAvailable,
  enrollBiometric as webauthnEnroll,
  verifyBiometric as webauthnVerify,
  describeAuthError,
} from "./auth.js";

export const PROVIDER = {
  NATIVE: "native",
  WEBAUTHN: "webauthn",
  SIMULATED: "simulated",
};

/** Plugin nativo, si la app corre dentro de Capacitor. */
function nativePlugin() {
  if (typeof window === "undefined") return null;
  const plugins = window.Capacitor?.Plugins;
  if (!plugins) return null;
  // capacitor-native-biometric  |  @aparajita/capacitor-biometric-auth
  return plugins.NativeBiometric ?? plugins.BiometricAuth ?? null;
}

export function isNativePlatform() {
  return typeof window !== "undefined" && Boolean(window.Capacitor?.isNativePlatform?.());
}

/**
 * Determina qué proveedor usar y con qué etiqueta mostrarlo.
 * `allowSimulation` mantiene la demo utilizable donde no hay biometría real.
 */
export async function detectProvider({ allowSimulation = true } = {}) {
  const plugin = nativePlugin();
  if (plugin) {
    try {
      const result = await plugin.isAvailable();
      if (result?.isAvailable ?? result?.available ?? false) {
        return { provider: PROVIDER.NATIVE, label: labelForBiometryType(result?.biometryType), real: true };
      }
    } catch {
      /* seguimos con las alternativas */
    }
  }

  if (await webauthnAvailable()) {
    return { provider: PROVIDER.WEBAUTHN, label: "Huella o rostro", real: true };
  }

  if (allowSimulation) {
    return { provider: PROVIDER.SIMULATED, label: "Huella o rostro (demo)", real: false };
  }

  return { provider: null, label: null, real: false };
}

function labelForBiometryType(type) {
  const map = {
    1: "Touch ID",
    2: "Face ID",
    3: "Huella",
    4: "Reconocimiento facial",
    5: "Iris",
    touchId: "Touch ID",
    faceId: "Face ID",
    fingerprint: "Huella",
    face: "Reconocimiento facial",
  };
  return map[type] ?? "Huella o rostro";
}

/** Registra el dispositivo como método de acceso. */
export async function enroll({ provider, userId, userName, appName }) {
  if (provider === PROVIDER.NATIVE) {
    const plugin = nativePlugin();
    // El plugin nativo guarda las credenciales en el llavero del sistema.
    await plugin.setCredentials?.({ username: userName, password: userId, server: appName });
    return `native:${userId}`;
  }
  if (provider === PROVIDER.WEBAUTHN) {
    return webauthnEnroll({ userId, userName, appName });
  }
  return `simulated:${userId}`;
}

/** Solicita la verificación para entrar. */
export async function verify({ provider, credentialId, appName, reason = "Confirma tu identidad para entrar" }) {
  if (provider === PROVIDER.NATIVE) {
    const plugin = nativePlugin();
    await plugin.verifyIdentity?.({
      reason,
      title: appName,
      subtitle: "Acceso a tu cuenta",
      description: reason,
    });
    return true; // el plugin lanza excepción si falla
  }
  if (provider === PROVIDER.WEBAUTHN) {
    return webauthnVerify(credentialId);
  }
  // Simulación: el llamador muestra el diálogo de demo.
  return true;
}

export { describeAuthError };
