import { useSession } from "../state/SessionContext.jsx";
import { Screen, Card, Button, Badge } from "../components/UI.jsx";
import appConfig from "../config/appConfig.js";

/**
 * CUENTA (Gym App)
 * Identidad de la sesión + rol de gestión por gimnasio (gym_admin / staff) +
 * cerrar sesión.
 */
export default function Account() {
  const { auth, gymAccess, actions } = useSession();

  return (
    <Screen title="Cuenta">
      <Card>
        <div className="row-left">
          <div className="avatar" style={{ width: 56, height: 56, fontSize: 20 }}>
            {auth.user.initials || "—"}
          </div>
          <div>
            <h3>{auth.user.name || "Sesión activa"}</h3>
            <p className="muted">{auth.user.email}</p>
          </div>
        </div>
      </Card>

      <Card>
        <p className="micro">Rol en la organización</p>
        <div className="stack-sm">
          {gymAccess.gyms.map((g) => (
            <div className="row-between" key={g.id}>
              <span>{g.name}</span>
              <Badge tone={g.role === "gym_admin" ? "accent" : "default"}>{g.role === "gym_admin" ? "administrador" : "staff"}</Badge>
            </div>
          ))}
        </div>
        <p className="micro">El rol gym_admin lo concede el equipo de BIAFYT; el de staff, el administrador del gimnasio.</p>
      </Card>

      <Card>
        <p className="micro">Sesión</p>
        <Button variant="ghost" full onClick={actions.signOut}>
          CERRAR SESIÓN
        </Button>
      </Card>

      <p className="micro center">
        {appConfig.name} · v{appConfig.version} · {appConfig.id}
      </p>
    </Screen>
  );
}
