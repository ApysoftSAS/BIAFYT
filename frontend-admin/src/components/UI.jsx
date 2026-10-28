/**
 * BIAFYT GYM WEB — COMPONENTES BASE
 * Mismos contratos de clase que frontend-usuario/src/components/UI.jsx,
 * subconjunto usado por la foundation web (+ `Panel` para el layout de
 * escritorio). Sin `Screen` móvil: la web usa el shell sidebar/topbar/main.
 */
import { useEffect } from "react";

export function Card({ children, className = "", onClick, accent = false }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag className={`card ${accent ? "card-accent" : ""} ${className}`} onClick={onClick}>
      {children}
    </Tag>
  );
}

export function Panel({ title, children, action }) {
  return (
    <section className="card">
      <div className="row-between" style={{ marginBottom: 12 }}>
        <h3>{title}</h3>
        {action}
      </div>
      {children}
    </section>
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

export function Badge({ children, tone = "default" }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function Stat({ label, value, tone }) {
  return (
    <div className="stat">
      <span className={`stat-value ${tone ? `text-${tone}` : ""}`}>{value}</span>
      <span className="stat-label">{label}</span>
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

export function Modal({ open, title, onClose, children }) {
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
      </div>
    </div>
  );
}
