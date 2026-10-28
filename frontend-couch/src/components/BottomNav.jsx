const items = [
  { id: "home", label: "Inicio", icon: "▣" },
  { id: "athletes", label: "Atletas", icon: "≡" },
  { id: "profile", label: "Perfil", icon: "◉" },
];

export default function BottomNav({ current, onNavigate, athleteBadge = 0 }) {
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
          {it.id === "athletes" && athleteBadge > 0 && <span className="nav-badge">{athleteBadge}</span>}
        </button>
      ))}
    </nav>
  );
}
