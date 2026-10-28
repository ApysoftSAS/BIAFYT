import { useCallback, useEffect, useState } from "react";
import { useApp } from "../state/AppContext.jsx";
import { Button, Card, Field, Input } from "../components/UI.jsx";
import { Glyph } from "../components/Brand.jsx";
import appConfig from "../config/appConfig.js";
import { detectProvider, verify, describeAuthError, PROVIDER } from "../utils/biometric.js";
import { apiErrorMessage } from "../utils/api.js";

/**
 * BLOQUEO DE APP (App Lock)
 * Se muestra cuando hay sesión iniciada (signedIn) y el desbloqueo
 * biométrico está activo, tras abrir la app o volver de background.
 * Nunca cierra sesión: solo exige volver a demostrar identidad. Aquí
 * nunca se simula biometría — si el dispositivo no tiene una real
 * disponible, se ofrece contraseña directamente.
 */
export default function BiometricLock() {
  const { state, actions } = useApp();
  const [status, setStatus] = useState("checking"); // checking | prompt | error | unavailable
  const [errorMsg, setErrorMsg] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [busy, setBusy] = useState(false);

  const runVerify = useCallback(async () => {
    setErrorMsg("");
    setStatus("checking");
    const bio = await detectProvider({ allowSimulation: false });
    if (bio.provider !== PROVIDER.NATIVE) {
      setStatus("unavailable");
      setShowPassword(true);
      return;
    }
    setStatus("prompt");
    try {
      const ok = await verify({
        provider: PROVIDER.NATIVE,
        credentialId: state.auth.biometric.credentialId,
        appName: appConfig.name,
        reason: "Desbloquea BIAFYT para continuar",
      });
      if (ok) {
        actions.unlockApp();
      } else {
        setStatus("error");
        setErrorMsg("No pudimos verificar tu identidad.");
      }
    } catch (e) {
      setStatus("error");
      setErrorMsg(describeAuthError(e));
    }
  }, [actions, state.auth.biometric.credentialId]);

  useEffect(() => {
    // Se difiere a un microtask: cada reintento posterior se dispara manualmente.
    Promise.resolve().then(() => runVerify());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Reautenticación real contra POST /auth/login (reutiliza `loginRemote`
   * de AppContext, no duplica lógica de login): `state.device.rememberedEmail`
   * es solo cosmético (nunca trae `salt`/`hash` locales), así que la única
   * forma correcta de validar la contraseña es contra el backend. En éxito,
   * `loginRemote` guarda el token nuevo y confirma `signedIn` por el mismo
   * camino que el login normal; aquí solo falta liberar el bloqueo local.
   */
  const unlockWithPassword = useCallback(async () => {
    setPasswordError("");
    const email = state.device.rememberedEmail;
    if (!email) {
      setPasswordError("No encontramos una cuenta en este dispositivo.");
      return;
    }
    setBusy(true);
    try {
      await actions.loginRemote({ email, password });
      if (status === "unavailable") {
        // Evita quedar atascado en el próximo arranque si el dispositivo ya no ofrece biometría.
        actions.setAuth({ biometric: { enabled: false, credentialId: null } });
      }
      actions.unlockApp();
    } catch (e) {
      setPasswordError(apiErrorMessage(e, "Contraseña incorrecta."));
    } finally {
      setBusy(false);
    }
  }, [actions, password, state.device.rememberedEmail, status]);

  return (
    <div className="onboarding onboarding-hero auth">
      <div className="brand-mark">
        <Glyph size={58} />
      </div>
      <h1 className="brand-title">{appConfig.name}</h1>
      <p className="brand-sub">Aplicación bloqueada</p>

      <div className="auth-form">
        <Card className="soft">
          {status === "unavailable" ? (
            <p className="muted center">Este dispositivo ya no tiene biometría disponible. Desbloquea con tu contraseña para continuar.</p>
          ) : (
            <p className="muted center">{status === "error" ? errorMsg : "Confirma tu identidad para continuar."}</p>
          )}
        </Card>

        {status === "error" && (
          <Button full onClick={runVerify}>
            REINTENTAR
          </Button>
        )}

        {!showPassword && (
          <button className="link-button" onClick={() => setShowPassword(true)}>
            Usar correo y contraseña
          </button>
        )}

        {showPassword && (
          <>
            <Field label="Contraseña">
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
              />
            </Field>
            {passwordError && <p className="auth-error">{passwordError}</p>}
            <Button full disabled={busy || !password} onClick={unlockWithPassword}>
              {busy ? "UN MOMENTO…" : "DESBLOQUEAR"}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
