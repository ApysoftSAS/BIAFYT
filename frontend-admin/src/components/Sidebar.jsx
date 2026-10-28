import { Wordmark } from "./Brand.jsx";
import appConfig from "../config/appConfig.js";

const items = [
  { id: "requests", label: "Solicitudes", icon: "◇" },
  { id: "gyms", label: "Gimnasios", icon: "▤" },
  { id: "promotions", label: "Promociones", icon: "◈" },
];

const catalog = [
  { id: "equipmentCatalog", label: "Equipamiento", icon: "◻" },
  { id: "equipmentRequests", label: "Solicitudes de equipo", icon: "✎" },
];

/**
 * BIAFYT ADMIN — NAVEGACIÓN LATERAL
 * Administración de plataforma: revisión de solicitudes de registro de
 * gimnasio y lista de gimnasios. Alcance MVP — nada más.
 */
export default function Sidebar({ current, onNavigate }) {
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

      <p className="gym-sidebar-foot" style={{ marginTop: 18, marginBottom: 4 }}>Catálogo</p>
      <nav className="gym-nav">
        {catalog.map((it) => (
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
