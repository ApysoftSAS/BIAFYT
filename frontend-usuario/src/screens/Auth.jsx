import { useCallback, useEffect, useState } from "react";
import { useApp } from "../state/AppContext.jsx";
import { Button, Card, Field, Input, Modal } from "../components/UI.jsx";
import Coach from "../components/Coach.jsx";
import appConfig from "../config/appConfig.js";
import { Glyph } from "../components/Brand.jsx";
import { passwordIssues, validateEmail } from "../utils/auth.js";
import { detectProvider, enroll, verify, describeAuthError, PROVIDER } from "../utils/biometric.js";
import { apiErrorMessage, ApiError } from "../utils/api.js";

/**
 * ACCESO
 * Registro y entrada con correo + contraseña, y acceso biométrico
 * (huella o rostro según el dispositivo) mediante WebAuthn.
 */
export default function Auth() {
  const { state, actions } = useApp();
  const hasAccount = Boolean(state.device.rememberedEmail);
  const [mode, setMode] = useState(hasAccount ? "login" : "register");
  const [form, setForm] = useState({ name: "", email: state.device.rememberedEmail ?? "", password: "", confirm: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  // Proveedor de biometría: nativo (Android/iOS), WebAuthn o simulado.
  const [bio, setBio] = useState({ provider: null, label: "Huella o rostro", real: false });
  const [simulating, setSimulating] = useState(false);

  useEffect(() => {
    let alive = true;
    detectProvider().then((result) => {
      if (alive) setBio(result);
    });
    return () => {
      alive = false;
    };
  }, []);

  const update = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  // ---------------- REGISTRO ----------------
  const register = useCallback(async () => {
    setError("");
    if (form.name.trim().length < 3) return setError("Escribe tu nombre completo.");
    if (!validateEmail(form.email)) return setError("El correo no parece válido.");
    const issues = passwordIssues(form.password);
    if (issues.length) return setError(`La contraseña necesita: ${issues.join(", ").toLowerCase()}.`);
    if (form.password !== form.confirm) return setError("Las contraseñas no coinciden.");

    setBusy(true);
    try {
      await actions.registerRemote({
        name: form.name.trim(),
        email: form.email.trim().toLowerCase(),
        password: form.password,
      });
    } catch (e) {
      setError(apiErrorMessage(e, "No pudimos crear la cuenta. Intenta de nuevo."));
    } finally {
      setBusy(false);
    }
  }, [actions, form]);

  // ---------------- ENTRADA ----------------
  const login = useCallback(async () => {
    setError("");
    if (!form.email.trim() || !form.password) return setError("Escribe tu correo y tu contraseña.");

    setBusy(true);
    try {
      await actions.loginRemote({ email: form.email.trim().toLowerCase(), password: form.password });
    } catch (e) {
      setError(apiErrorMessage(e, "No pudimos verificar tus datos."));
    } finally {
      setBusy(false);
    }
  }, [actions, form.email, form.password]);

  // ---------------- BIOMETRÍA ----------------
  // La biometría es solo un desbloqueo LOCAL de una sesión que YA existe
  // (obtenida por un login/registro real anterior): nunca autentica por sí
  // sola. En las 3 ramas (SIMULATED/NATIVE/WEBAUTHN) el acceso solo se
  // concede si hay un `auth.token` guardado y ese token sigue siendo
  // válido en el backend — se revalida con GET /auth/me reutilizando
  // `actions.refreshSession()` (mismo criterio que usa el arranque de la
  // app en AppContext). Si no hay token, no hay biometría que valga.
  const confirmSessionAfterBiometric = useCallback(async () => {
    if (!state.auth.token) {
      setError("Inicia sesión con tu correo y contraseña primero.");
      return;
    }
    setBusy(true);
    try {
      await actions.refreshSession();
    } catch (e) {
      setError(e instanceof ApiError ? apiErrorMessage(e, "No pudimos confirmar tu sesión.") : describeAuthError(e));
    } finally {
      setBusy(false);
    }
  }, [actions, state.auth.token]);

  const loginWithBiometric = useCallback(async () => {
    setError("");
    // SIMULATED es cosmético: la demo se puede explorar aunque no haya
    // sesión guardada; la decisión real de acceso ocurre al confirmar
    // dentro del modal (confirmSessionAfterBiometric), igual que en las
    // otras 2 ramas.
    if (bio.provider === PROVIDER.SIMULATED) {
      setSimulating(true);
      return;
    }
    if (!state.auth.token) {
      setError("Inicia sesión con tu correo y contraseña primero.");
      return;
    }
    setBusy(true);
    let verified = false;
    try {
      verified = await verify({
        provider: bio.provider,
        credentialId: state.auth.biometric.credentialId,
        appName: appConfig.name,
      });
      if (!verified) setError("No pudimos verificar tu identidad.");
    } catch (e) {
      setError(describeAuthError(e));
    }
    setBusy(false);
    // Verificación local superada: por sí sola no autentica, solo dispara
    // la revalidación del token guardado contra el backend.
    if (verified) await confirmSessionAfterBiometric();
  }, [bio.provider, confirmSessionAfterBiometric, state.auth.biometric.credentialId, state.auth.token]);

  const activateBiometric = useCallback(async () => {
    setError("");
    setBusy(true);
    try {
      const credentialId = await enroll({
        provider: bio.provider,
        userId: state.identity.user.id,
        userName: state.device.rememberedEmail ?? state.identity.user.name,
        appName: appConfig.name,
      });
      actions.setAuth({ biometric: { enabled: true, credentialId, provider: bio.provider } });
    } catch (e) {
      setError(describeAuthError(e));
    } finally {
      setBusy(false);
    }
  }, [actions, bio.provider, state.device.rememberedEmail, state.identity.user.id, state.identity.user.name]);

  const bioReady = state.auth.biometric.enabled && state.auth.biometric.credentialId;

  return (
    <div className="onboarding onboarding-hero auth">
      <div className="brand-mark">
        <Glyph size={58} />
      </div>
      <h1 className="brand-title">{appConfig.name}</h1>
      <p className="brand-sub">{mode === "register" ? "Crea tu cuenta" : "Bienvenido de vuelta"}</p>

      <div className="auth-form">
        {mode === "register" && (
          <Field label="Nombre completo">
            <Input value={form.name} onChange={update("name")} placeholder="Tu nombre" autoComplete="name" />
          </Field>
        )}

        <Field label="Correo">
          <Input type="email" value={form.email} onChange={update("email")} placeholder="tu@correo.com" autoComplete="email" />
        </Field>

        <Field label="Contraseña" hint={mode === "register" ? "Mínimo 8 caracteres, con letras y números." : undefined}>
          <Input
            type="password"
            value={form.password}
            onChange={update("password")}
            placeholder="••••••••"
            autoComplete={mode === "register" ? "new-password" : "current-password"}
          />
        </Field>

        {mode === "register" && (
          <Field label="Repite la contraseña">
            <Input type="password" value={form.confirm} onChange={update("confirm")} placeholder="••••••••" autoComplete="new-password" />
          </Field>
        )}

        {error && <p className="auth-error">{error}</p>}

        <Button full disabled={busy} onClick={mode === "register" ? register : login}>
          {busy ? "UN MOMENTO…" : mode === "register" ? "CREAR CUENTA" : "ENTRAR"}
        </Button>

        {/* Acceso biométrico */}
        {mode === "login" && bioReady && (
          <button className="bio-button" onClick={loginWithBiometric} disabled={busy}>
            <span className="bio-icon">{bio.provider === PROVIDER.NATIVE ? "◉" : "☝"}</span>
            <span>ENTRAR CON {bio.label.toUpperCase()}</span>
          </button>
        )}

        {mode === "login" && !bioReady && hasAccount && (
          <Card className="soft">
            <strong>Acceso rápido</strong>
            <p className="muted">
              {bio.real
                ? "Activa la huella o el reconocimiento facial para entrar sin escribir la contraseña."
                : "En este navegador la biometría no es real, pero puedes activarla para recorrer el flujo de la demo."}
            </p>
            <Button variant="ghost" full disabled={busy} onClick={activateBiometric}>
              ACTIVAR {bio.label.toUpperCase()}
            </Button>
          </Card>
        )}

        <button
          className="link-button"
          onClick={() => {
            setError("");
            setMode(mode === "register" ? "login" : "register");
          }}
        >
          {mode === "register" ? "Ya tengo cuenta" : "Crear una cuenta nueva"}
        </button>

        {mode === "login" && hasAccount && (
          <p className="micro center">Cuenta en este dispositivo: {state.device.rememberedEmail}</p>
        )}
      </div>

      {/* Simulación de biometría para la demo en navegador */}
      <Modal open={simulating} title="VERIFICACIÓN BIOMÉTRICA" onClose={() => setSimulating(false)}>
        <div className="bio-sim">
          <div className="bio-sim-ring">
            <span>☝</span>
          </div>
          <p className="muted center">
            Simulación de {bio.label.toLowerCase()}. En Android e iOS este paso abre el lector real del sistema.
          </p>
          <Button
            full
            onClick={() => {
              setSimulating(false);
              // Cosmético: nunca crea sesión por sí mismo. Solo confirma
              // acceso si ya hay un token guardado y sigue siendo válido;
              // si no, deja claro que hace falta iniciar sesión primero.
              confirmSessionAfterBiometric();
            }}
          >
            SIMULAR HUELLA CORRECTA
          </Button>
          <Button variant="ghost" full onClick={() => setSimulating(false)}>
            CANCELAR
          </Button>
        </div>
      </Modal>

      <Coach
        state={mode === "register" ? "explicacion" : "motivacion"}
        message={mode === "register" ? "Creamos tu cuenta y armamos tu rutina." : "Vamos a entrenar."}
      />
    </div>
  );
}
