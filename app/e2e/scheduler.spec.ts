import { expect, test } from "@playwright/test";
import { createProject, login } from "./helpers";

test.describe.configure({ mode: "serial" });

const KEY = process.env.CRON_SECRET ?? "test-cron-secret";

/**
 * The scheduler is what makes the product autonomous, so it is exercised end to
 * end: a tick must actually start and finish a job, and must refuse callers
 * without the secret.
 */
test("the cron tick runs due work and refuses unauthenticated callers", async ({ page }) => {
  await login(page);
  const slug = await createProject(page, { name: "Tick Test" });

  // No secret, no work.
  const unauthorized = await page.request.post("/api/cron/tick");
  expect(unauthorized.status()).toBe(401);

  // Scoped to this project so other test projects in the shared database
  // cannot claim the tick's single slot.
  const tick = `/api/cron/tick?key=${KEY}&project=${slug}`;
  const first = await page.request.post(tick);
  expect(first.ok()).toBeTruthy();
  const body = (await first.json()) as {
    ran: Array<{ project: string; kind: string; status: string }>;
  };

  const ran = body.ran.find((job) => job.project === slug);
  expect(ran, "a freshly onboarded project has due work").toBeTruthy();
  expect(ran?.status).toBe("SUCCESS");

  // The dashboard shows the job the tick created — the loop is the same loop.
  await page.goto(`/projects/${slug}`);
  await expect(page.getByTestId(`job-status-${ran?.kind}`)).toHaveText("SUCCESS");

  // A second tick picks up the next kind rather than repeating the first.
  const second = await page.request.post(tick);
  const secondBody = (await second.json()) as { ran: Array<{ project: string; kind: string }> };
  const next = secondBody.ran.find((job) => job.project === slug);
  expect(next?.kind).not.toBe(ran?.kind);
});
