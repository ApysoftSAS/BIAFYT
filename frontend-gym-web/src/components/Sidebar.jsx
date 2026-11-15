import { Wordmark } from "./Brand.jsx";
import appConfig from "../config/appConfig.js";

/**
 * BIAFYT GYM WEB — NAVEGACIÓN LATERAL (foundation)
 *
 * Todas las secciones son funcionales. Un `staff` (recepción) solo ve las que
 * `canOpen` le permite; el backend responde 404 al resto igualmente.
 */
import { canOpen } from "../utils/gym.js";

const primary = [
  { id: "overview", label: "Resumen", icon: "▤", ready: true },
  { id: "reports", label: "Reportes", icon: "◩", ready: true },
  { id: "workspace", label: "Espacio", icon: "▦", ready: true },
  { id: "branches", label: "Sedes", icon: "◫", ready: true },
  { id: "inventory", label: "Inventario", icon: "▥", ready: true },
  { id: "vouchers", label: "Vouchers", icon: "◇", ready: true },
];

export default function Sidebar({ current, onNavigate, role }) {
  const items = primary.filter((it) => canOpen(role, it.id));
  return (
    <aside className="gym-sidebar">
      <div className="gym-sidebar-brand">
        <Wordmark />
      </div>

      <nav className="gym-nav">
        {items.map((it) => (
          <button
            key={it.id}
            className={`gym-nav-item ${current === it.id ? "gym-nav-active" : ""}`}
            onClick={() => onNavigate(it.id)}
            aria-current={current === it.id}
          >
            <span className="gym-nav-icon">{it.icon}</span>
            {it.label}
          </button>
        ))}
      </nav>


      <button
        className={`gym-nav-item ${current === "account" ? "gym-nav-active" : ""}`}
        style={{ marginTop: "auto" }}
        onClick={() => onNavigate("account")}
      >
        <span className="gym-nav-icon">◉</span>
        Cuenta
      </button>

      <p className="gym-sidebar-foot">
        {appConfig.shortName} · v{appConfig.version}
      </p>
    </aside>
  );
}
