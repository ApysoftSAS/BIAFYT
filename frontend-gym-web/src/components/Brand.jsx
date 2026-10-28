/**
 * BIAFYT GYM — MARCA
 * Logo oficial de BIAFYT. El wordmark toma el nombre desde appConfig.
 * Copia adaptada de frontend-usuario/src/components/Brand.jsx.
 */

import appConfig from "../config/appConfig.js";
import logo from "../assets/BIAFYT-logo.webp";

export function Glyph({ size = 48 }) {
  return (
    <img
      src={logo}
      width={size}
      height={size}
      alt={appConfig.name}
      className="BIAFYT-logo"
      style={{ width: size, height: size, objectFit: "contain", display: "block" }}
    />
  );
}

export function Wordmark({ glyph = true }) {
  return (
    <div className="wordmark">
      {glyph && <Glyph size={28} />}
      <span className="wordmark-text">{appConfig.name}</span>
    </div>
  );
}

export default Wordmark;
