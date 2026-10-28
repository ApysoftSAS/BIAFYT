import { useCoach } from "../state/CoachContext.jsx";
import { Avatar, Button, Card, Screen } from "../components/UI.jsx";
import appConfig from "../config/appConfig.js";

export default function Profile() {
  const { auth, actions } = useCoach();

  return (
    <Screen title="PERFIL">
      <div className="stack">
        <Card>
          <div className="row-gap">
            <Avatar name={auth.user.name} initials={auth.user.initials} size={56} />
            <div>
              <h3>{auth.user.name}</h3>
              <p className="muted">{auth.user.email}</p>
            </div>
          </div>
        </Card>

        <Card>
          <p className="micro">CUENTA</p>
          <Button variant="ghost" full onClick={actions.signOut}>
            CERRAR SESIÓN
          </Button>
        </Card>

        <Card className="soft">
          <p className="micro">
            {appConfig.name} · versión {appConfig.version} · {appConfig.id}
          </p>
        </Card>
      </div>
    </Screen>
  );
}
