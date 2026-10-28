/**
 * BIAFYT — IDENTIDAD VISUAL
 * ---------------------------------------------------------------
 * ÚNICA FUENTE DE VERDAD DE COLOR Y ESTILO.
 * Si cambia la marca, se cambia AQUÍ y en ningún otro lugar.
 * Ningún componente debe escribir hexadecimales.
 *
 * Paleta de marca (manual BIAFYT):
 *   #112B32  profundo    — fondo, base de todo
 *   #DCEFED  claro       — texto y superficies claras
 *   #65CDBD  turquesa    — acento, CTA, estados activos
 */

export const palette = {
  deep: "#112B32",
  light: "#DCEFED",
  aqua: "#65CDBD",
};

export const colors = {
  // Base
  primary: palette.aqua,
  background: "#0A1A1F",
  backgroundAlt: palette.deep,
  surface: "rgba(220, 239, 237, 0.06)",
  surfaceAlt: "rgba(220, 239, 237, 0.10)",
  surfaceSolid: "#152F36",
  surfaceInverse: palette.light,
  overlay: "rgba(10, 26, 31, 0.72)",

  // Texto
  text: palette.light,
  textSecondary: "rgba(220, 239, 237, 0.62)",
  textMuted: "rgba(220, 239, 237, 0.38)",
  textOnPrimary: "#08171B",
  textOnLight: palette.deep,

  // Bordes y luz
  border: "rgba(220, 239, 237, 0.12)",
  borderStrong: "rgba(220, 239, 237, 0.24)",
  glassHighlight: "rgba(220, 239, 237, 0.28)",
  glow: "rgba(101, 205, 189, 0.35)",

  // Acciones
  accent: palette.aqua,
  cta: palette.aqua,
  ctaText: "#08171B",
  active: palette.aqua,
  inactive: "rgba(220, 239, 237, 0.40)",

  // Estados
  success: "#65CDBD",
  warning: "#E8B15A",
  error: "#E8736A",
  info: "#7FBFD6",

  // Estados de validación de actividad
  valid: "#65CDBD",
  invalid: "#E8736A",
  pending: "rgba(220, 239, 237, 0.50)",
};

/** Tipografía, radios y capas de vidrio. */
export const tokens = {
  radius: "22px",
  radiusSm: "14px",
  radiusLg: "30px",
  radiusPill: "999px",
  space: "16px",

  fontDisplay: "'Outfit', 'Poppins', system-ui, sans-serif",
  fontBody: "'Outfit', system-ui, -apple-system, sans-serif",
  trackingBrand: "0.34em",
  trackingLabel: "0.16em",

  // Liquid glass
  glassBlur: "22px",
  glassBlurStrong: "34px",
  glassShadow: "0 18px 40px rgba(4, 14, 18, 0.55)",
  glassInner: "inset 0 1px 0 rgba(220, 239, 237, 0.22)",
  glowRing: "0 0 24px rgba(101, 205, 189, 0.30)",
};

/** Inyecta la paleta como variables CSS. */
export function applyTheme(target = document.documentElement) {
  Object.entries(colors).forEach(([key, value]) => {
    target.style.setProperty(`--c-${toKebab(key)}`, value);
  });
  Object.entries(tokens).forEach(([key, value]) => {
    target.style.setProperty(`--t-${toKebab(key)}`, value);
  });
}

function toKebab(key) {
  return key.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}

export default colors;
