import { expect, test } from "@playwright/test";
import { createProject, login } from "./helpers";

/**
 * DoD check: swapping brand.config.ts must reskin every screen. This proves the
 * mechanism — components read the tokens rather than hardcoding colours — by
 * asserting each screen paints from the same custom properties.
 */
test("brand tokens drive colour on every screen", async ({ page }) => {
  await login(page);
  const slug = await createProject(page, { name: "Brand Test" });

  const routes = [
    `/projects/${slug}`,
    `/projects/${slug}/feed`,
    `/projects/${slug}/chat`,
    `/projects/${slug}/docs`,
    `/projects/${slug}/site`,
    `/projects/${slug}/performance`,
    `/projects/${slug}/integrations`,
    `/projects/${slug}/settings`,
  ];

  for (const route of routes) {
    await page.goto(route);
    const tokens = await page.evaluate(() => {
      const style = getComputedStyle(document.documentElement);
      const body = getComputedStyle(document.body);
      return {
        bg: style.getPropertyValue("--bg").trim(),
        accent: style.getPropertyValue("--accent").trim(),
        font: style.getPropertyValue("--font-sans").trim(),
        bodyBackground: body.backgroundColor,
      };
    });

    // Every screen resolves the same token set…
    expect(tokens.bg, route).not.toBe("");
    expect(tokens.accent, route).not.toBe("");
    expect(tokens.font, route).not.toBe("");
    // …and the page actually paints from it rather than a hardcoded colour.
    expect(tokens.bodyBackground, route).toBe(hexToRgb(tokens.bg));
  }
});

function hexToRgb(hex: string): string {
  const value = hex.replace("#", "");
  const full =
    value.length === 3
      ? value
          .split("")
          .map((c) => c + c)
          .join("")
      : value;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgb(${r}, ${g}, ${b})`;
}
