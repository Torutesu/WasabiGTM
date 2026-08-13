/**
 * Brand / design tokens. Swap this file to reskin every screen.
 * Rule: no component hardcodes a colour or font family — they read from here
 * (via the CSS custom properties emitted in globals.css by `brandCssVariables`).
 */

export type BrandConfig = {
  name: string;
  tagline: string;
  colors: {
    bg: string;
    surface: string;
    surfaceAlt: string;
    border: string;
    text: string;
    textMute: string;
    textDim: string;
    accent: string;
    accentHover: string;
    accentContrast: string;
    danger: string;
    warn: string;
    ok: string;
  };
  fonts: {
    sans: string;
    mono: string;
  };
  radius: string;
};

export const brand: BrandConfig = {
  name: "Wasabi",
  tagline: "Growth that closes the loop.",
  colors: {
    bg: "#080808",
    surface: "#141414",
    surfaceAlt: "#1B1B1B",
    border: "#2A2A2A",
    text: "#FFFFFF",
    textMute: "#999999",
    textDim: "#666666",
    accent: "#C8A96E",
    accentHover: "#D4B57A",
    accentContrast: "#080808",
    danger: "#E5484D",
    warn: "#E5A23D",
    ok: "#3DD68C",
  },
  fonts: {
    sans: '"Helvetica Neue", Inter, system-ui, "Noto Sans JP", sans-serif',
    mono: '"JetBrains Mono", "SF Mono", ui-monospace, monospace',
  },
  radius: "10px",
};

/** Emitted into a <style> tag by the root layout so every screen picks up the brand. */
export function brandCssVariables(config: BrandConfig = brand): string {
  const { colors, fonts, radius } = config;
  return `:root{
--bg:${colors.bg};
--surface:${colors.surface};
--surface-alt:${colors.surfaceAlt};
--border:${colors.border};
--text:${colors.text};
--text-mute:${colors.textMute};
--text-dim:${colors.textDim};
--accent:${colors.accent};
--accent-hover:${colors.accentHover};
--accent-contrast:${colors.accentContrast};
--danger:${colors.danger};
--warn:${colors.warn};
--ok:${colors.ok};
--font-sans:${fonts.sans};
--font-mono:${fonts.mono};
--radius:${radius};
}`;
}
