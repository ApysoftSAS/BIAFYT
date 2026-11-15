import { useSession } from "../state/SessionContext.jsx";
import { Card, Panel, Button, Badge } from "../components/UI.jsx";
import appConfig from "../config/appConfig.js";

/**
 * CUENTA (Gym Web)
 * Identidad de la sesión + rol(es) de gestión (gym_admin / staff) + cerrar sesión.
 * Real (contrato `/auth/*` + `GET /me/gym-assignments`).
 */
export default function Account() {
  const { auth, gymAccess, actions } = useSession();

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

        <Panel title="Gestión de Gym">
          {gymAccess.gyms.length === 0 ? (
            <p className="muted">Sin rol gym_admin ni staff activo.</p>
          ) : (
            <div className="stack-sm">
              {gymAccess.gyms.map((g) => (
                <div className="row-between" key={g.id}>
                  <span>{g.name}</span>
                  <Badge tone={g.role === "gym_admin" ? "accent" : "default"}>{g.role === "gym_admin" ? "administrador" : "staff"}</Badge>
                </div>
              ))}
              <p className="micro">
                El rol gym_admin lo concede el equipo de BIAFYT (no se autoasigna);
                el rol staff lo concede el administrador del gimnasio.
              </p>
            </div>
          )}
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
