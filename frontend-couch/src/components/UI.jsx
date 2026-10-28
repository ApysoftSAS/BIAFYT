import { useEffect } from "react";

export function Screen({ title, subtitle, onBack, action, children }) {
  return (
    <div className="screen">
      <header className="screen-head">
        {onBack && (
          <button className="icon-btn" onClick={onBack} aria-label="Volver">
            ←
          </button>
        )}
        <div className="screen-title">
          <h1>{title}</h1>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {action}
      </header>
      <div className="screen-body">{children}</div>
    </div>
  );
}

export function Card({ children, className = "", onClick, accent = false }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag className={`card ${accent ? "card-accent" : ""} ${className}`} onClick={onClick}>
      {children}
    </Tag>
  );
}

export function Button({ children, variant = "primary", full = false, disabled, onClick, type = "button" }) {
  return (
    <button type={type} className={`btn btn-${variant} ${full ? "btn-full" : ""}`} disabled={disabled} onClick={onClick}>
      {children}
    </button>
  );
}

export function Field({ label, hint, children }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

export function Input(props) {
  return <input className="input" {...props} />;
}

export function Tabs({ items, value, onChange }) {
  return (
    <div className="tabs" role="tablist">
      {items.map((it) => (
        <button
          key={it.id}
          role="tab"
          aria-selected={value === it.id}
          className={`tab ${value === it.id ? "tab-active" : ""}`}
          onClick={() => onChange(it.id)}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ checked, onChange, label, description }) {
  return (
    <div className="toggle-row">
      <div className="toggle-text">
        <span className="toggle-label">{label}</span>
        {description && <span className="toggle-desc">{description}</span>}
      </div>
      <button
        className={`toggle ${checked ? "toggle-on" : ""}`}
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
      >
        <span className="toggle-knob" />
      </button>
    </div>
  );
}

export function Bar({ value, max = 100, tone = "primary" }) {
  const pctValue = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className="bar">
      <div className={`bar-fill bar-${tone}`} style={{ width: `${pctValue}%` }} />
    </div>
  );
}

export function Avatar({ name, initials, size = 40, highlight = false }) {
  return (
    <div className={`avatar ${highlight ? "avatar-hl" : ""}`} style={{ width: size, height: size, fontSize: size * 0.36 }} title={name}>
      {initials}
    </div>
  );
}

export function Badge({ children, tone = "default" }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function Modal({ open, title, onClose, children, footer }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function EmptyState({ icon = "—", title, text, action }) {
  return (
    <div className="empty">
      <div className="empty-icon">{icon}</div>
      <h3>{title}</h3>
      {text && <p>{text}</p>}
      {action}
    </div>
  );
}

export function Stat({ label, value, tone }) {
  return (
    <div className="stat">
      <span className={`stat-value ${tone ? `text-${tone}` : ""}`}>{value}</span>
      <span className="stat-label">{label}</span>
    </div>
  );
}
