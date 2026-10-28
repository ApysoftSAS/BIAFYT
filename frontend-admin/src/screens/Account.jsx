import { useSession } from "../state/SessionContext.jsx";
import { Card, Panel, Button, Badge } from "../components/UI.jsx";
import appConfig from "../config/appConfig.js";

/**
 * CUENTA (Admin)
 * Identidad de la sesión + señal de acceso de plataforma + cerrar sesión.
 * `isPlatformAdmin` viene del backend (`/auth/me`); nunca se edita aquí.
 */
export default function Account() {
  const { auth, actions } = useSession();

  return (
    <div>
      <div className="gym-main-head">
        <h2>Cuenta</h2>
        <p>Sesión activa en {appConfig.name}.</p>
      </div>

      <div className="stack" style={{ maxWidth: 520 }}>
        <Card>
          <div className="row-left">
            <div className="avatar" style={{ width: 52, height: 52, fontSize: 18 }}>
              {auth.user.initials || "—"}
            </div>
            <div>
              <h3>{auth.user.name || "Sesión activa"}</h3>
              <p className="muted">{auth.user.email}</p>
            </div>
          </div>
        </Card>

        <Panel
          title="Acceso de plataforma"
          action={<Badge tone={auth.isPlatformAdmin ? "success" : "default"}>{auth.isPlatformAdmin ? "platform_admin" : "sin acceso"}</Badge>}
        >
          <p className="micro">
            El acceso de BIAFYT Admin lo concede el equipo con
            <code> php artisan BIAFYT:grant-platform-admin &lt;email&gt;</code>. No se
            autoasigna desde ninguna UI.
          </p>
        </Panel>

        <Panel title="Sesión">
          <Button variant="ghost" onClick={actions.signOut}>
            CERRAR SESIÓN
          </Button>
        </Panel>

        <p className="micro">
          {appConfig.name} · v{appConfig.version} · {appConfig.id}
        </p>
      </div>
    </div>
  );
}
