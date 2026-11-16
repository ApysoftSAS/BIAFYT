/**
 * BIAFYT — IDENTIDAD VISUAL
 * ---------------------------------------------------------------
 * ÚNICA FUENTE DE VERDAD DE COLOR Y ESTILO.
 * Si cambia la marca, se cambia AQUÍ y en ningún otro lugar.
 * Ningún componente debe escribir hexadecimales.
 *
 * Estilo: glassmorphism cálido. Neutros cremas, casi negro para estados
 * activos y tarjetas destacadas, y UN solo acento verde lima.
 *
 * Contraste (WCAG AA, medido sobre crema/arena/vidrio):
 *   text 1A1A1A ≈ 15:1 · textSecondary ≥ 5.7:1 · textMuted ≥ 4.8:1
 *   accentText ≥ 5.9:1 · blanco sobre ink 18.7:1 · ink sobre lima 12.8:1
 * El lima (#A8E86C) NO se usa como color de texto sobre claro: para eso
 * existe `accentText`. Como relleno (CTA, puntos, barras) sí.
 */

import { deriveTheme, THEMABLE_COLOR_KEYS, THEMABLE_TOKEN_KEYS } from "./themes.js";

export const palette = {
  cream: "#F4F2EE",
  sand: "#E9E6E0",
  ink: "#111311",
  lime: "#A8E86C",
  white: "#FFFFFF",
};

export const colors = {
  // Base
  primary: palette.lime,
  background: palette.cream,
  backgroundAlt: palette.sand,
  surface: "rgba(255, 255, 255, 0.55)",
  surfaceAlt: "rgba(255, 255, 255, 0.70)",
  surfaceHover: "rgba(255, 255, 255, 0.92)",
  surfaceSolid: "#FAF9F6", // reserva opaca si no hay backdrop-filter
  surfaceChip: "rgba(26, 26, 26, 0.07)", // badges y chips: gris translúcido
  surfaceInverse: palette.ink, // tarjetas destacadas y estados activos
  overlay: "rgba(244, 242, 238, 0.72)", // barras flotantes (cabecera, nav)
  scrim: "rgba(17, 19, 17, 0.42)", // fondo detrás de modales

  // Texto
  text: "#1A1A1A",
  textSecondary: "rgba(26, 26, 26, 0.72)",
  textMuted: "rgba(26, 26, 26, 0.64)",
  textOnPrimary: palette.ink,
  textOnLight: palette.ink,
  textOnDark: palette.white,
  textOnDarkSecondary: "rgba(255, 255, 255, 0.72)",
  accentText: "#2E6A10", // verde profundo: el "lima" legible como texto

  // Bordes y luz
  border: "rgba(255, 255, 255, 0.70)", // vidrio: borde blanco semitransparente
  borderStrong: "rgba(26, 26, 26, 0.16)", // campos y separadores visibles
  glassHighlight: "rgba(255, 255, 255, 0.85)",
  glow: "rgba(168, 232, 108, 0.45)",
  focusRing: palette.ink,

  // Acciones
  accent: palette.lime,
  cta: palette.lime,
  ctaText: palette.ink,
  active: palette.ink,
  inactive: "rgba(26, 26, 26, 0.58)",

  // Estados (tonos profundos: se usan también como texto)
  success: "#2E6A10",
  warning: "#8A5200",
  error: "#B3261E",
  info: "#2A6682",

  // Estados de validación de actividad
  valid: "#2E6A10",
  invalid: "#B3261E",
  pending: "rgba(26, 26, 26, 0.58)",

  // Gráficos
  bar: "#3A3E3A",
  barTrack: "rgba(26, 26, 26, 0.07)",
  barOnDark: "rgba(255, 255, 255, 0.22)",
  barTrackOnDark: "rgba(255, 255, 255, 0.08)",
};

/** Tipografía, radios, vidrio, sombras y movimiento. */
export const tokens = {
  radius: "24px", // tarjetas
  radiusSm: "16px",
  radiusLg: "30px", // paneles, hojas y modales
  radiusPill: "999px", // botones, inputs, badges e ítems
  space: "16px",

  fontDisplay: "'Inter', 'Geist', system-ui, -apple-system, sans-serif",
  fontBody: "'Inter', 'Geist', system-ui, -apple-system, sans-serif",
  trackingBrand: "0.34em",
  trackingLabel: "0.12em",

  // Vidrio cálido
  glassBlur: "28px",
  glassBlurStrong: "40px",
  glassShadow: "0 24px 60px rgba(70, 58, 40, 0.14)",
  glassInner: "inset 0 1px 0 rgba(255, 255, 255, 0.85)",
  shadowLift: "0 12px 32px rgba(70, 58, 40, 0.18)",
  glowRing: "0 0 0 4px rgba(168, 232, 108, 0.35)",

  // Fondo: degradado cálido con destello lima difuminado
  bgGradient:
    "radial-gradient(60% 42% at 88% -4%, rgba(168, 232, 108, 0.55), transparent 70%), radial-gradient(50% 36% at 4% 98%, rgba(168, 232, 108, 0.22), transparent 70%), linear-gradient(165deg, #F4F2EE 0%, #ECE9E3 55%, #E4E1DA 100%)",

  // Movimiento (spring suave)
  motionFast: "250ms",
  motionSlow: "400ms",
  ease: "cubic-bezier(0.34, 1.32, 0.64, 1)",
};

/**
 * Inyecta la paleta como variables CSS. `theme` (opcional) es la elección del
 * usuario: solo puede cambiar las claves de la lista blanca de themes.js; el
 * vidrio cálido (superficies, blur, radios, sombras, bordes) siempre sale de
 * `colors`/`tokens` tal cual.
 */
export function applyTheme(target = document.documentElement, theme) {
  const derived = theme ? deriveTheme(theme) : null;
  const pick = (base, over, allowed) => ({
    ...base,
    ...Object.fromEntries(Object.entries(over || {}).filter(([k]) => allowed.includes(k))),
  });
  Object.entries(pick(colors, derived?.colors, THEMABLE_COLOR_KEYS)).forEach(([key, value]) => {
    target.style.setProperty(`--c-${toKebab(key)}`, value);
  });
  Object.entries(pick(tokens, derived?.tokens, THEMABLE_TOKEN_KEYS)).forEach(([key, value]) => {
    target.style.setProperty(`--t-${toKebab(key)}`, value);
  });
  // Barra de estado del navegador/PWA acorde al fondo elegido.
  if (typeof document !== "undefined") {
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", derived?.colors.background ?? colors.background);
  }
}

function toKebab(key) {
  return key.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}

export default colors;
