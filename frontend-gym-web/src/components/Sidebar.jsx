import { Wordmark } from "./Brand.jsx";
import appConfig from "../config/appConfig.js";

/**
 * BIAFYT GYM WEB — NAVEGACIÓN LATERAL (foundation)
 *
 * "Resumen" y "Espacio" son funcionales (slice D-GYM: gestión de
 * miembros/coaches del propio gym). "Sedes" y "Staff" siguen diferidos a
 * la fase Coach/Gym completa (BIAFYT_BUSINESS_CORE.md §46 D-COACH/D-GYM,
 * §47) y se muestran `disabled` para no presentarlos como funcionales.
 */
const primary = [
  { id: "overview", label: "Resumen", icon: "▤", ready: true },
  { id: "workspace", label: "Espacio", icon: "▦", ready: true },
  { id: "inventory", label: "Inventario", icon: "▥", ready: true },
];

// Secciones aún no implementadas (fase Coach/Gym completa): gestión de
// sedes y el rol staff. Miembros y coaches ya se gestionan en "Espacio".
const comingSoon = [
  { label: "Sedes", icon: "◫" },
  { label: "Staff", icon: "◈" },
];

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
        Próximamente (fase Coach/Gym)
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
