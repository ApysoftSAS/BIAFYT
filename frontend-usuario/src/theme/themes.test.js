import { describe, expect, it } from "vitest";
import { applyTheme, colors, tokens } from "./colors.js";
import { BASES, DEFAULT_THEME, INKS, PRESETS, THEMABLE_COLOR_KEYS, THEMABLE_TOKEN_KEYS, contrast, deriveTheme, sanitizeTheme } from "./themes.js";

const lightHex = (css) => css; // los derivados de acento/base/tinta son #RRGGBB

describe("temas de usuario", () => {
  it("el tema por defecto no deriva nada (usa los colores base)", () => {
    expect(deriveTheme(DEFAULT_THEME)).toBeNull();
    expect(deriveTheme(undefined)).toBeNull();
  });

  it("todo preset y toda combinación base × tinta cumple AA", () => {
    const combos = [
      ...Object.values(PRESETS),
      ...BASES.flatMap((b) => INKS.map((i) => ({ accent: "#2255FF", base: b.value, ink: i.value }))),
      { accent: "#000000", base: "#F4F2EE", ink: "#111311" }, // acento negro: se aclara
      { accent: "#FFFF00", base: "#EDEBE8", ink: "#0F1B2D" },
    ];
    for (const c of combos) {
      const t = sanitizeTheme({ preset: "custom", ...c });
      const d = deriveTheme(t) ?? { colors: { accentText: colors.accentText, backgroundAlt: colors.backgroundAlt } };
      const baseAlt = d.colors.backgroundAlt;
      expect(contrast(t.accent, t.ink), `acento/tinta ${JSON.stringify(c)}`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(lightHex(d.colors.accentText), baseAlt), `accentText ${JSON.stringify(c)}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("rechaza bases oscuras, tintas claras y valores basura", () => {
    const t = sanitizeTheme({ preset: "custom", accent: "no-es-color", base: "#000000", ink: "#FFFFFF" });
    expect(t.base).toBe(DEFAULT_THEME.base);
    expect(t.ink).toBe(DEFAULT_THEME.ink);
    expect(t.accent).toBe(DEFAULT_THEME.accent);
    expect(sanitizeTheme(null)).toEqual(DEFAULT_THEME);
    expect(sanitizeTheme({ preset: "custom" }).preset).toBe("custom");
  });

  it("solo puede derivar claves de la lista blanca: nunca vidrio, blur, radios ni sombras", () => {
    for (const p of Object.keys(PRESETS)) {
      const d = deriveTheme({ preset: p });
      if (!d) continue;
      expect(Object.keys(d.colors).every((k) => THEMABLE_COLOR_KEYS.includes(k))).toBe(true);
      expect(Object.keys(d.tokens).every((k) => THEMABLE_TOKEN_KEYS.includes(k))).toBe(true);
    }
    for (const forbidden of ["surface", "surfaceAlt", "surfaceHover", "border", "borderStrong", "glassHighlight", "text"]) {
      expect(THEMABLE_COLOR_KEYS).not.toContain(forbidden);
    }
    for (const forbidden of ["glassBlur", "glassBlurStrong", "glassShadow", "glassInner", "shadowLift", "radius", "radiusLg", "radiusPill", "ease"]) {
      expect(THEMABLE_TOKEN_KEYS).not.toContain(forbidden);
    }
  });

  it("applyTheme cambia el acento pero deja el vidrio intacto, incluso con un tema malicioso", () => {
    const el = document.createElement("div");
    applyTheme(el, { preset: "coral", glassBlur: "0px", surface: "red", radius: "0", tokens: { glassBlur: "0" } });
    expect(el.style.getPropertyValue("--c-primary")).toBe(PRESETS.coral.accent);
    expect(el.style.getPropertyValue("--t-glass-blur")).toBe(tokens.glassBlur);
    expect(el.style.getPropertyValue("--t-glass-blur-strong")).toBe(tokens.glassBlurStrong);
    expect(el.style.getPropertyValue("--c-surface")).toBe(colors.surface);
    expect(el.style.getPropertyValue("--c-surface-alt")).toBe(colors.surfaceAlt);
    expect(el.style.getPropertyValue("--c-border")).toBe(colors.border);
    expect(el.style.getPropertyValue("--t-radius")).toBe(tokens.radius);
    expect(el.style.getPropertyValue("--t-glass-shadow")).toBe(tokens.glassShadow);
  });

  it("volver al tema por defecto restaura exactamente los colores base", () => {
    const el = document.createElement("div");
    applyTheme(el, { preset: "cielo" });
    applyTheme(el, DEFAULT_THEME);
    expect(el.style.getPropertyValue("--c-primary")).toBe(colors.primary);
    expect(el.style.getPropertyValue("--t-bg-gradient")).toBe(tokens.bgGradient);
  });
});
