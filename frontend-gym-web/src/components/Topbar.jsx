import { useSession } from "../state/SessionContext.jsx";

const TITLES = {
  overview: "Resumen",
  workspace: "Espacio",
  account: "Cuenta",
};

/**
 * BIAFYT GYM WEB — BARRA SUPERIOR (foundation)
 * Título de la vista actual + identidad de la sesión + cerrar sesión.
 */
export default function Topbar({ screen, onNavigate }) {
  const { auth, actions } = useSession();

  return (
    <header className="gym-topbar">
      <h1>{TITLES[screen] ?? "BIAFYT Gym"}</h1>
      <div className="gym-account">
        <button className="gym-account-name" style={{ background: "none", border: "none", color: "inherit", cursor: "pointer" }} onClick={() => onNavigate("account")}>
          <span className="avatar" style={{ width: 30, height: 30, fontSize: 12, display: "inline-grid", verticalAlign: "middle", marginRight: 8 }}>
            {auth.user.initials || "—"}
          </span>
          {auth.user.name || auth.user.email || "Sesión"}
        </button>
        <button className="btn btn-ghost" onClick={actions.signOut}>
          Salir
        </button>
      </div>
    </header>
  );
}
