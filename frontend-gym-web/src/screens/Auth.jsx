import { useCallback, useState } from "react";
import { useSession } from "../state/SessionContext.jsx";
import { Button, Field, Input } from "../components/UI.jsx";
import { Glyph } from "../components/Brand.jsx";
import appConfig from "../config/appConfig.js";
import { passwordIssues, validateEmail } from "../utils/auth.js";
import { apiErrorMessage } from "../utils/api.js";

/**
 * ACCESO (Gym Web)
 * Tarjeta de login centrada, estilo escritorio. Usa el contrato `/auth/*`
 * existente (Sanctum). NO comprueba rol de Gym — la autorización
 * organizacional está diferida a la fase Coach/Gym.
 */
export default function Auth() {
  const { actions } = useSession();
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ name: "", email: "", password: "", confirm: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const update = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

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
      setError(apiErrorMessage(e, "No pudimos crear la cuenta."));
    } finally {
      setBusy(false);
    }
  }, [actions, form]);

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

  return (
    <div className="gym-auth">
      <div className="card gym-auth-card">
        <div className="brand-mark">
          <Glyph size={44} />
        </div>
        <h1>{appConfig.name}</h1>
        <p className="brand-sub">{mode === "register" ? "Crea tu cuenta" : "Panel de gimnasio"}</p>

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

          <button
            className="link-button"
            onClick={() => {
              setError("");
              setMode(mode === "register" ? "login" : "register");
            }}
          >
            {mode === "register" ? "Ya tengo cuenta" : "Crear una cuenta nueva"}
          </button>
        </div>
      </div>
    </div>
  );
}
