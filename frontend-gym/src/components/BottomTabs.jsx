/**
 * BIAFYT GYM — NAVEGACIÓN INFERIOR (foundation)
 *
 * Los items de navegación son PROVISIONALES. La superficie Gym real
 * (organización, sedes, miembros, staff, coaches, administración) se
 * define en la fase Coach/Gym del roadmap — ver BIAFYT_BUSINESS_CORE.md
 * §5, §46 (D8), §47 (Fase 5). Aquí sólo demuestran el shell.
 */
const items = [
  { id: "overview", label: "Resumen", icon: "▤" },
  { id: "workspace", label: "Espacio", icon: "▦" },
  { id: "account", label: "Cuenta", icon: "◉" },
];

export default function BottomTabs({ current, onNavigate }) {
  return (
    <nav className="bottom-nav">
      {items.map((it) => (
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
