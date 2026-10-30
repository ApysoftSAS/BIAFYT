/**
 * BIAFYT — MARCA
 * ---------------------------------------------------------------
 * Usa el logo oficial de BIAFYT como imagen.
 * El wordmark sigue tomando el nombre desde appConfig.
 */

import appConfig from "../config/appConfig.js";
import logo from "../assets/somaglyph-logo.webp";

export function Glyph({ size = 48 }) {
  return (
    <img
      src={logo}
      width={size}
      height={size}
      alt={appConfig.name}
      className="BIAFYT-logo"
      style={{
        width: size,
        height: size,
        objectFit: "contain",
        display: "block",
      }}
    />
  );
}

export function Wordmark({ tagline = false, glyph = true }) {
  return (
    <div className="wordmark-block">
      <div className="wordmark">
        {glyph && <Glyph size={36} />}

        <span className="wordmark-text">
          {appConfig.name}
        </span>
      </div>

      {tagline && (
        <p className="tagline">
          Carve. Refine. Become.
        </p>
      )}
    </div>
  );
}

export default Wordmark;