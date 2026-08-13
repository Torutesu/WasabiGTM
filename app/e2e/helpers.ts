import { expect, type Page } from "@playwright/test";

export const CREDENTIALS = {
  email: process.env.SEED_USER_EMAIL ?? "founder@wasabi.local",
  password: process.env.SEED_USER_PASSWORD ?? "wasabi-dev-password",
};

/** The mock product site the crawler reads during onboarding (served by the app in test mode). */
export const MOCK_SITE_URL = "/testing/mock-site";

export async function login(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByTestId("login-email").fill(CREDENTIALS.email);
  await page.getByTestId("login-password").fill(CREDENTIALS.password);
  await page.getByTestId("login-submit").click();
  await expect(page).not.toHaveURL(/\/login/);
}

/** Creates a project and waits for onboarding analysis to finish. Returns its slug. */
export async function createProject(
  page: Page,
  options: {
    name: string;
    phase?: "prelaunch" | "launched" | "growth";
    languages?: Array<"en" | "ja">;
  },
): Promise<string> {
  const { name, phase = "prelaunch", languages = ["en"] } = options;

  await page.goto("/projects/new");
  await page.getByTestId("onboarding-url").fill(new URL(MOCK_SITE_URL, page.url()).toString());
  // Blur the URL field first so its auto-fill of the name runs before we type,
  // rather than racing with it.
  await page.getByTestId("onboarding-url").blur();
  await page.getByTestId("onboarding-name").fill(name);
  await page.getByTestId(`onboarding-phase-${phase}`).check();

  for (const lang of ["en", "ja"] as const) {
    const box = page.getByTestId(`onboarding-lang-${lang}`);
    if (languages.includes(lang)) {
      await box.check();
    } else {
      await box.uncheck();
    }
  }

  await page.getByTestId("onboarding-submit").click();

  // Analysis terminal → dashboard
  await expect(page).toHaveURL(/\/projects\/[^/]+\/analyzing/, { timeout: 20_000 });
  await expect(page).toHaveURL(/\/projects\/[^/]+$/, { timeout: 120_000 });

  const slug = new URL(page.url()).pathname.split("/")[2];
  return slug;
}

/** Runs a background job to completion via the dashboard's Run now control. */
export async function runCycle(page: Page, slug: string): Promise<void> {
  await page.goto(`/projects/${slug}`);
  await page.getByTestId("run-cycle").click();
  await expect(page.getByTestId("job-status-DAILY_CYCLE")).toHaveText(/SUCCESS|FAILED/, {
    timeout: 120_000,
  });
  await expect(page.getByTestId("job-status-DAILY_CYCLE")).toHaveText("SUCCESS");
}

export async function gotoFeed(page: Page, slug: string): Promise<void> {
  await page.goto(`/projects/${slug}/feed`);
  await expect(page.getByTestId("feed-list")).toBeVisible();
}

/** First card for a channel in the current tab. */
export function card(page: Page, channel: string) {
  return page.getByTestId(`card-${channel}`).first();
}
