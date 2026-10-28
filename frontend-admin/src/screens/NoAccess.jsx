import { useSession } from "../state/SessionContext.jsx";
import { Glyph } from "../components/Brand.jsx";
import { Button, Card } from "../components/UI.jsx";
import appConfig from "../config/appConfig.js";

/**
 * SIN ACCESO
 *
 * El usuario está autenticado pero no es BIAFYT Admin
 * (`user.is_platform_admin`). El rol se concede a mano con
 * `php artisan BIAFYT:grant-platform-admin <email>` — nunca desde la UI.
 */
export default function NoAccess() {
  const { auth, actions } = useSession();

  return (
    <div className="gym-auth">
      <Card className="gym-auth-card">
        <div className="brand-mark">
          <Glyph size={44} />
        </div>
        <h1>{appConfig.name}</h1>
        <p className="brand-sub">Sin acceso</p>

        <div className="stack" style={{ marginTop: 16, textAlign: "left" }}>
          <p className="muted">
            Tu cuenta ({auth.user.email}) no tiene permisos de administración de
            plataforma, así que no hay ningún panel que mostrar.
          </p>
          <p className="micro">
            El acceso de BIAFYT Admin lo concede el equipo de BIAFYT. Cuando
            lo tengas, vuelve a entrar.
          </p>
          <div className="row-gap">
            <Button variant="ghost" onClick={actions.refreshSession}>
              REINTENTAR
            </Button>
            <Button variant="ghost" onClick={actions.signOut}>
              CERRAR SESIÓN
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
