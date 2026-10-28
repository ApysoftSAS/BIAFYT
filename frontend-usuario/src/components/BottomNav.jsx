const items = [
  { id: "home", label: "Inicio", icon: "▣" },
  { id: "ranking", label: "Ranking", icon: "≡" },
  { id: "duels", label: "Duelos", icon: "⚔" },
  { id: "machines", label: "Máquinas", icon: "⚙" },
  { id: "profile", label: "Perfil", icon: "◉" },
];

export default function BottomNav({ current, onNavigate, duelBadge = 0 }) {
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
          {it.id === "duels" && duelBadge > 0 && <span className="nav-badge">{duelBadge}</span>}
        </button>
      ))}
    </nav>
  );
}
