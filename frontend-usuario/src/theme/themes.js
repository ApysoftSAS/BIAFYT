/**
 * BIAFYT — TEMAS DE USUARIO
 * ---------------------------------------------------------------
 * El usuario puede cambiar SOLO tres colores:
 *   accent — el acento (por defecto verde lima)
 *   base   — el neutro claro del fondo (crema, arena…)
 *   ink    — el casi negro de estados activos y tarjetas destacadas
 *
 * El GLASSMORPHISM CÁLIDO NO es personalizable: translucidez, blur,
 * radios, sombras, bordes de vidrio y movimiento viven en colors.js y
 * nunca se tocan desde aquí. `deriveTheme` solo puede devolver claves de
 * `THEMABLE_COLOR_KEYS` / `THEMABLE_TOKEN_KEYS` (y `applyTheme` filtra
 * otra vez), así que ningún valor guardado puede desactivar el vidrio.
 *
 * Legibilidad (AA) garantizada por construcción, no por confianza:
 *  - base se rechaza si no es claro (el vidrio es blanco translúcido);
 *  - ink se rechaza si no es oscuro;
 *  - accent se aclara hasta tener ≥ 4.5:1 con ink (texto sobre el acento
 *    y acento sobre tarjetas oscuras);
 *  - accentText (el acento como TEXTO) se oscurece hasta ≥ 4.5:1 sobre
 *    la base.
 */

const HEX = /^#[0-9a-f]{6}$/i;

const toRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const toHex = (rgb) =>
  "#" +
  rgb
    .map((c) => Math.round(Math.max(0, Math.min(255, c))).toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
const mix = (a, b, t) => {
  const [ra, rb] = [toRgb(a), toRgb(b)];
  return toHex(ra.map((c, i) => c * (1 - t) + rb[i] * t));
};
const rgba = (hex, alpha) => `rgba(${toRgb(hex).join(", ")}, ${alpha})`;

const luminance = (hex) => {
  const [r, g, b] = toRgb(hex).map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

export const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

// ---------------------------------------------------------------
// Catálogo
// ---------------------------------------------------------------

export const PRESETS = {
  lima: { label: "Lima", accent: "#A8E86C", base: "#F4F2EE", ink: "#111311" },
  turquesa: { label: "Turquesa", accent: "#65CDBD", base: "#EFF2F0", ink: "#112B32" },
  coral: { label: "Coral", accent: "#FF9F80", base: "#F5EFEA", ink: "#1A1210" },
  lavanda: { label: "Lavanda", accent: "#C3B5F5", base: "#F3F1F5", ink: "#17141F" },
  ambar: { label: "Ámbar", accent: "#F2C14E", base: "#F5F1E8", ink: "#1A1710" },
  cielo: { label: "Cielo", accent: "#8EC9F5", base: "#EFF2F4", ink: "#101820" },
};

/** Neutros cálidos/claros que el usuario puede elegir como base en "Personalizado". */
export const BASES = [
  { label: "Crema", value: "#F4F2EE" },
  { label: "Arena", value: "#F1EBE0" },
  { label: "Piedra", value: "#EDEBE8" },
  { label: "Rosado", value: "#F6EEEC" },
  { label: "Salvia", value: "#EEF1EA" },
];

/** Casi negros que el usuario puede elegir como tinta en "Personalizado". */
export const INKS = [
  { label: "Negro cálido", value: "#111311" },
  { label: "Azul noche", value: "#0F1B2D" },
  { label: "Bosque", value: "#0F2318" },
  { label: "Vino", value: "#2A1018" },
  { label: "Café", value: "#24180F" },
];

export const DEFAULT_THEME = { preset: "lima", ...PRESETS.lima };
delete DEFAULT_THEME.label;

/** Única superficie de personalización permitida. NO incluye nada de vidrio. */
export const THEMABLE_COLOR_KEYS = [
  "primary",
  "accent",
  "cta",
  "ctaText",
  "textOnPrimary",
  "textOnLight",
  "accentText",
  "glow",
  "background",
  "backgroundAlt",
  "surfaceSolid",
  "overlay",
  "surfaceInverse",
  "active",
  "focusRing",
  "scrim",
  "bar",
];
export const THEMABLE_TOKEN_KEYS = ["glowRing", "bgGradient"];

// ---------------------------------------------------------------
// Saneado y derivación
// ---------------------------------------------------------------

const pickHex = (value, fallback) => (typeof value === "string" && HEX.test(value) ? value.toUpperCase() : fallback);

/** Devuelve siempre un tema válido y legible, sea cual sea la entrada. */
export function sanitizeTheme(raw) {
  const r = raw && typeof raw === "object" ? raw : {};
  const known = PRESETS[r.preset];
  if (known) return { preset: r.preset, accent: known.accent, base: known.base, ink: known.ink };

  let base = pickHex(r.base, DEFAULT_THEME.base);
  if (luminance(base) < 0.75) base = DEFAULT_THEME.base;
  let ink = pickHex(r.ink, DEFAULT_THEME.ink);
  if (luminance(ink) > 0.06) ink = DEFAULT_THEME.ink;
  let accent = pickHex(r.accent, DEFAULT_THEME.accent);
  for (let i = 0; i < 40 && contrast(accent, ink) < 4.5; i++) accent = mix(accent, "#FFFFFF", 0.08);

  // Sin elección válida guardada (usuario nuevo, dato corrupto): el tema de fábrica, no "Personalizado".
  const preset = r.preset === "custom" ? "custom" : isDefaultTheme({ accent, base, ink }) ? DEFAULT_THEME.preset : "custom";
  return { preset, accent, base, ink };
}

export const isDefaultTheme = (t) => t.accent === DEFAULT_THEME.accent && t.base === DEFAULT_THEME.base && t.ink === DEFAULT_THEME.ink;

/**
 * Colores/tokens derivados del tema, o `null` si es el tema por defecto
 * (que ya está definido a mano en colors.js).
 */
export function deriveTheme(theme) {
  const { accent, base, ink } = sanitizeTheme(theme);
  if (isDefaultTheme({ accent, base, ink })) return null;

  const baseAlt = mix(base, "#000000", 0.045);
  let accentText = accent;
  for (let t = 0; t <= 1.0001 && contrast(accentText, baseAlt) < 4.5; t += 0.05) accentText = mix(accent, ink, t);

  return {
    colors: {
      primary: accent,
      accent,
      cta: accent,
      ctaText: ink,
      textOnPrimary: ink,
      textOnLight: ink,
      accentText,
      glow: rgba(accent, 0.45),
      background: base,
      backgroundAlt: baseAlt,
      surfaceSolid: mix(base, "#FFFFFF", 0.55),
      overlay: rgba(base, 0.72),
      surfaceInverse: ink,
      active: ink,
      focusRing: ink,
      scrim: rgba(ink, 0.42),
      bar: mix(ink, "#FFFFFF", 0.18),
    },
    tokens: {
      glowRing: `0 0 0 4px ${rgba(accent, 0.35)}`,
      bgGradient: `radial-gradient(60% 42% at 88% -4%, ${rgba(accent, 0.55)}, transparent 70%), radial-gradient(50% 36% at 4% 98%, ${rgba(accent, 0.22)}, transparent 70%), linear-gradient(165deg, ${base} 0%, ${mix(base, "#000000", 0.03)} 55%, ${mix(base, "#000000", 0.065)} 100%)`,
    },
  };
}
