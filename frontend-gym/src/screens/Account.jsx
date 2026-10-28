import { useSession } from "../state/SessionContext.jsx";
import { Screen, Card, Button, Badge } from "../components/UI.jsx";
import appConfig from "../config/appConfig.js";

/**
 * CUENTA (Gym App)
 * Identidad de la sesión + cerrar sesión. Todo real (contrato `/auth/*`).
 * El rol/permiso de Gym NO se muestra porque no existe todavía (D5 diferido).
 */
export default function Account() {
  const { auth, actions } = useSession();

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
        <div className="row-between">
          <span className="muted">Sin rol de Gym asignado</span>
          <Badge tone="warning">Pronto</Badge>
        </div>
        <p className="micro">
          Los roles de Gym (staff, gym_admin) y la autorización organizacional se
          implementan en la fase Coach/Gym.
        </p>
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
