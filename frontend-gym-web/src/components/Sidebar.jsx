import { Wordmark } from "./Brand.jsx";
import appConfig from "../config/appConfig.js";

/**
 * BIAFYT GYM WEB — NAVEGACIÓN LATERAL (foundation)
 *
 * Todas las secciones de `primary` son funcionales. "Staff" sigue diferido
 * (sus capacidades no están definidas — BIAFYT_BUSINESS_CORE.md §6) y se
 * muestra `disabled` para no presentarlo como funcional.
 */
const primary = [
  { id: "overview", label: "Resumen", icon: "▤", ready: true },
  { id: "workspace", label: "Espacio", icon: "▦", ready: true },
  { id: "branches", label: "Sedes", icon: "◫", ready: true },
  { id: "inventory", label: "Inventario", icon: "▥", ready: true },
  { id: "vouchers", label: "Vouchers", icon: "◇", ready: true },
];

// Aún no implementado: el rol staff (capacidades por definir).
const comingSoon = [{ label: "Staff", icon: "◈" }];

export default function Sidebar({ current, onNavigate }) {
  return (
    <aside className="gym-sidebar">
      <div className="gym-sidebar-brand">
        <Wordmark />
      </div>

      <nav className="gym-nav">
        {primary.map((it) => (
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

      <p className="gym-sidebar-foot" style={{ marginTop: 18, marginBottom: 4 }}>
        Próximamente
      </p>
      <nav className="gym-nav">
        {comingSoon.map((it) => (
          <button key={it.label} className="gym-nav-item" disabled aria-disabled="true">
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
