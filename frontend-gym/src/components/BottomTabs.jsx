/**
 * BIAFYT GYM — NAVEGACIÓN INFERIOR
 *
 * Mismas secciones que el sidebar de frontend-gym-web. Un `staff` (recepción)
 * solo ve las que `canOpen` le permite (el backend responde 404 al resto).
 */
import { canOpen } from "../utils/gym.js";

const items = [
  { id: "overview", label: "Resumen", icon: "▤" },
  { id: "reports", label: "Reportes", icon: "◩" },
  { id: "workspace", label: "Espacio", icon: "▦" },
  { id: "branches", label: "Sedes", icon: "◫" },
  { id: "inventory", label: "Inventario", icon: "▥" },
  { id: "vouchers", label: "Vouchers", icon: "◇" },
  { id: "account", label: "Cuenta", icon: "◉" },
];

export default function BottomTabs({ current, onNavigate, role }) {
  return (
    <nav className="bottom-nav">
      {items.filter((it) => canOpen(role, it.id)).map((it) => (
        <button
          key={it.id}
          className={`nav-item ${current === it.id ? "nav-active" : ""}`}
          onClick={() => onNavigate(it.id)}
          aria-current={current === it.id}
        >
          <span className="nav-icon">{it.icon}</span>
          <span className="nav-label">{it.label}</span>
        </button>
      ))}
    </nav>
  );
}
