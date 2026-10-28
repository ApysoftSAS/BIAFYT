/**
 * BIAFYT — AUTENTICACIÓN
 * ---------------------------------------------------------------
 * `validateEmail`/`passwordIssues` son validación de formulario, del lado
 * cliente únicamente — la verificación real de credenciales vive en el
 * backend Laravel/Sanctum (`POST /auth/register`, `POST /auth/login`, ver
 * `utils/api.js`). Este archivo ya no guarda ni compara contraseñas
 * localmente: `device.rememberedEmail` solo recuerda el correo (UX de
 * "recordar cuenta en este dispositivo"), sin salt/hash locales.
 *
 * La biometría usa WebAuthn con autenticador de plataforma, que en
 * Android (Capacitor/WebView) resuelve huella o rostro según el
 * dispositivo. Es un desbloqueo LOCAL de una sesión que ya existe (ver
 * `screens/Auth.jsx`/`state/AppContext.jsx`), no un mecanismo de
 * autenticación por sí solo. Si no está disponible, la app sigue
 * funcionando con correo y contraseña.
 */

const encoder = new TextEncoder();

function toHex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
}

export function passwordIssues(password) {
  const issues = [];
  if (password.length < 8) issues.push("Al menos 8 caracteres");
  if (!/[a-zA-Z]/.test(password)) issues.push("Al menos una letra");
  if (!/[0-9]/.test(password)) issues.push("Al menos un número");
  return issues;
}

// ------------------------------------------------------------------
// BIOMETRÍA (huella / rostro)
// ------------------------------------------------------------------

export async function biometricAvailable() {
  try {
    if (typeof window === "undefined" || !window.PublicKeyCredential) return false;
    return await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

function challengeBytes() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return bytes;
}

/** Registra el dispositivo como método de acceso. Devuelve el id de credencial. */
export async function enrollBiometric({ userId, userName, appName }) {
  const credential = await navigator.credentials.create({
    publicKey: {
      challenge: challengeBytes(),
      rp: { name: appName },
      user: {
        id: encoder.encode(userId),
        name: userName,
        displayName: userName,
      },
      pubKeyCredParams: [
        { type: "public-key", alg: -7 }, // ES256
        { type: "public-key", alg: -257 }, // RS256
      ],
      authenticatorSelection: {
        authenticatorAttachment: "platform",
        userVerification: "required",
        residentKey: "preferred",
      },
      timeout: 60000,
      attestation: "none",
    },
  });
  if (!credential) throw new Error("No se pudo registrar la biometría");
  return toHex(credential.rawId);
}

/** Solicita verificación biométrica para entrar. */
export async function verifyBiometric(credentialIdHex) {
  const rawId = Uint8Array.from(credentialIdHex.match(/.{1,2}/g).map((b) => parseInt(b, 16)));
  const assertion = await navigator.credentials.get({
    publicKey: {
      challenge: challengeBytes(),
      allowCredentials: [{ type: "public-key", id: rawId }],
      userVerification: "required",
      timeout: 60000,
    },
  });
  return Boolean(assertion);
}

export const AUTH_ERRORS = {
  NotAllowedError: "Verificación cancelada o rechazada.",
  InvalidStateError: "Este dispositivo ya está registrado.",
  NotSupportedError: "Tu dispositivo no admite este método.",
  SecurityError: "El origen no permite biometría (requiere HTTPS).",
};

export function describeAuthError(error) {
  return AUTH_ERRORS[error?.name] ?? "No pudimos completar la verificación.";
}
