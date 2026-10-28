import { useSession } from "../state/SessionContext.jsx";
import { Card, Panel, Button, Badge } from "../components/UI.jsx";
import appConfig from "../config/appConfig.js";

/**
 * CUENTA (Gym Web)
 * Identidad de la sesión + rol(es) gym_admin + cerrar sesión.
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

        <Panel title="Administración de Gym" action={<Badge tone="accent">gym_admin</Badge>}>
          {gymAccess.gyms.length === 0 ? (
            <p className="muted">Sin rol gym_admin activo.</p>
          ) : (
            <div className="stack-sm">
              {gymAccess.gyms.map((g) => (
                <div className="row-between" key={g.id}>
                  <span>{g.name}</span>
                  <span className="micro">administrador</span>
                </div>
              ))}
              <p className="micro">
                El rol gym_admin lo concede el equipo de BIAFYT (no se
                autoasigna). staff y la gestión de sedes llegan en una fase posterior.
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
