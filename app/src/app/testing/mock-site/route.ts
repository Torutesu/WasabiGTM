/**
 * A deterministic product site for E2E. Only served when WASABI_MOCK_EXTERNAL=1,
 * so it can never appear in a real deployment.
 */
export async function GET() {
  if (process.env.WASABI_MOCK_EXTERNAL !== "1") {
    return new Response("Not found", { status: 404 });
  }

  const html = `<!doctype html>
<html lang="en">
<head>
  <title>Shogun — the operating system for the AI-native individual</title>
  <meta name="description" content="Shogun captures your day passively and acts on it." />
</head>
<body>
  <h1>Your AI has memory. Now it acts.</h1>
  <p>Shogun is the operating system for the AI-native individual. It captures what you
     do through the macOS Accessibility API — not screenshots — stores it locally, and
     runs agents that act on that memory.</p>
  <h2>Pricing</h2>
  <p>$62 / month billed monthly, or $49 / month billed annually. 7-day trial.</p>
  <h2>Who it is for</h2>
  <p>Founders, builders, and researchers who already live inside AI tools and are tired
     of re-explaining their own context every morning.</p>
  <h2>Competitors</h2>
  <p>Littlebird remembers. Limitless needs hardware. Screenpipe is open source but raw.
     Granola only covers meetings.</p>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}
