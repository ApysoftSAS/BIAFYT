import { useSession } from "../state/SessionContext.jsx";
import { Glyph } from "../components/Brand.jsx";
import { Button, Card } from "../components/UI.jsx";
import appConfig from "../config/appConfig.js";

/**
 * SIN ACCESO DE GYM
 *
 * El usuario está autenticado pero no tiene ningún `GymAssignment` de
 * `gym_admin` ni `staff` activo. No se muestra ningún dato de ningún gym: el
 * rol se concede a mano en la BD (D-GYM-3, bootstrap manual).
 */
export default function NoGymAccess() {
  const { auth, gymAccess, actions } = useSession();

  return (
    <div className="gym-auth">
      <Card className="gym-auth-card">
        <div className="brand-mark">
          <Glyph size={44} />
        </div>
        <h1>{appConfig.name}</h1>
        <p className="brand-sub">Sin acceso de Gym</p>

        <div className="stack" style={{ marginTop: 16, textAlign: "left" }}>
          <p className="muted">
            Tu cuenta ({auth.user.email}) no tiene un rol <strong>gym_admin</strong> ni <strong>staff</strong> activo
            en ninguna organización, así que no hay ningún panel que mostrar.
          </p>
          <p className="micro">
            El rol de administrador lo concede el equipo de BIAFYT; el de staff, el
            administrador de tu gimnasio. Cuando lo tengas, vuelve a entrar.
          </p>
          {gymAccess.error && <p className="text-warning">{gymAccess.error}</p>}

          <div className="row-gap">
            <Button variant="ghost" onClick={actions.reloadGymAccess}>
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
