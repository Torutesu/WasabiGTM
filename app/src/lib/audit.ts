import { db } from "@/lib/db";
import { fetchPage, probeGeoCitations } from "@/lib/external";
import { llm } from "@/lib/llm";
import { AuditKind } from "@/generated/prisma/client";

/**
 * AIF-005 — SEO and GEO audits.
 *
 * SEO findings come from the page itself (deterministic checks), then the model
 * writes the fix content. GEO probes the AI search engines for real citations;
 * when an engine can't be reached the audit is marked stale rather than guessed.
 */

export type Issue = {
  id: string;
  severity: "HIGH" | "MEDIUM" | "LOW";
  page: string;
  title: string;
  detail: string;
  fixSuggestion: string;
  /** Set for fixes we can turn into a file change. */
  filePath?: string;
  fileContent?: string;
};

const AUDIT_SCHEMA = {
  type: "object",
  properties: {
    score: { type: "integer" },
    issues: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          severity: { type: "string" },
          page: { type: "string" },
          title: { type: "string" },
          detail: { type: "string" },
          fixSuggestion: { type: "string" },
        },
        required: ["id", "severity", "page", "title", "detail", "fixSuggestion"],
        additionalProperties: false,
      },
    },
  },
  required: ["score", "issues"],
  additionalProperties: false,
} as const;

export async function runSeoAudit(input: {
  projectId: string;
  url: string;
  productName: string;
}): Promise<{ score: number; issues: Issue[]; stale: boolean }> {
  const findings: Issue[] = [];
  let stale = false;
  let html = "";

  try {
    const page = await fetchPage(input.url);
    html = page.html;
    if (page.status >= 400) stale = true;
  } catch {
    stale = true;
  }

  if (!stale) {
    const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? "";
    const description =
      html.match(/<meta[^>]+name=["']description["'][^>]*content=["']([^"']*)["']/i)?.[1] ?? "";
    const h1Count = (html.match(/<h1[\s>]/gi) ?? []).length;
    const hasOg = /property=["']og:title["']/i.test(html);
    const hasSchema = /application\/ld\+json/i.test(html);

    if (!title) {
      findings.push(issue("HIGH", input.url, "Missing <title>", "The page has no title element.", "Add a <title> naming the product and its core outcome."));
    }
    if (!description) {
      findings.push(
        issue(
          "HIGH",
          input.url,
          "Missing meta description",
          "No meta description, so search engines write their own snippet.",
          "Add a 150-160 character meta description leading with the user outcome.",
        ),
      );
    }
    if (h1Count === 0) {
      findings.push(issue("MEDIUM", input.url, "No H1", "The page has no H1 heading.", "Add a single H1 matching the page's primary intent."));
    } else if (h1Count > 1) {
      findings.push(issue("LOW", input.url, "Multiple H1 headings", `Found ${h1Count} H1 elements.`, "Keep exactly one H1 per page."));
    }
    if (!hasOg) {
      findings.push(issue("MEDIUM", input.url, "Missing Open Graph tags", "Links shared on social have no preview card.", "Add og:title, og:description, and og:image."));
    }
    if (!hasSchema) {
      findings.push(
        issue(
          "MEDIUM",
          input.url,
          "No structured data",
          "No JSON-LD, so search and AI engines have to infer what this product is.",
          "Add SoftwareApplication JSON-LD with name, description, offers, and operatingSystem.",
          "public/structured-data.json",
          JSON.stringify(
            {
              "@context": "https://schema.org",
              "@type": "SoftwareApplication",
              name: input.productName,
              url: input.url,
            },
            null,
            2,
          ),
        ),
      );
    }

    // Site files. llms.txt lives here per AIF-005 rather than under GEO, so a
    // single fix card covers it; the GEO screen reads this result for its
    // AI-readiness checklist.
    const robots = await safeFetch(new URL("/robots.txt", input.url).toString());
    if (!robots) {
      findings.push(issue("LOW", input.url, "robots.txt not found", "Crawlers get no guidance.", "Add a robots.txt that allows crawling and points at the sitemap."));
    }
    const sitemap = await safeFetch(new URL("/sitemap.xml", input.url).toString());
    if (!sitemap) {
      findings.push(issue("MEDIUM", input.url, "sitemap.xml not found", "Search engines have to discover pages by crawling alone.", "Publish a sitemap.xml listing every indexable page."));
    }
    const llmsTxt = await safeFetch(new URL("/llms.txt", input.url).toString());
    if (!llmsTxt) {
      findings.push(
        issue(
          "HIGH",
          input.url,
          "llms.txt not found",
          "AI search engines have no curated summary of this product, so they infer it from whatever they happen to crawl.",
          "Publish /llms.txt describing the product, who it is for, and the canonical pages.",
          "public/llms.txt",
          [
            `# ${input.productName}`,
            ``,
            `> ${input.productName} — see ${input.url}`,
            ``,
            `## Core pages`,
            `- [Home](${input.url})`,
          ].join("\n"),
        ),
      );
    }
  }

  const result = await llm().generate<{ score: number; issues: Issue[] }>({
    tier: "mid",
    system: "You score a site's search health and write concrete, copy-pasteable fixes.",
    prompt: `Site: ${input.url}\nDeterministic findings:\n${JSON.stringify(findings, null, 2)}`,
    schema: AUDIT_SCHEMA as unknown as Record<string, unknown>,
    offlineKey: "audit:SEO",
    offlineContext: { findings: JSON.stringify(findings) },
  });

  // Keep the file payloads our deterministic pass computed.
  const merged = result.issues.map((i) => {
    const local = findings.find((f) => f.title === i.title);
    return local ? { ...i, filePath: local.filePath, fileContent: local.fileContent } : i;
  });

  await db.siteAudit.create({
    data: {
      projectId: input.projectId,
      kind: AuditKind.SEO,
      score: stale ? 0 : result.score,
      issues: merged as never,
      stale,
    },
  });

  return { score: result.score, issues: merged, stale };
}

export async function runGeoAudit(input: {
  projectId: string;
  url: string;
  productName: string;
}): Promise<{ score: number; issues: Issue[]; stale: boolean }> {
  // GEO issues are about citations. Site-file gaps (llms.txt, robots, sitemap,
  // schema) are raised by the SEO audit so each fix is a single card.
  const findings: Issue[] = [];
  let stale = false;

  const prompts = [
    `best tool for ${input.productName.toLowerCase()} use case`,
    `${input.productName} alternatives`,
    `how to solve the problem ${input.productName} solves`,
  ];

  const citations = await probeGeoCitations({ productName: input.productName, prompts });
  if (citations.length === 0) {
    stale = true;
  } else {
    const uncited = citations.filter((c) => !c.cited);
    for (const miss of uncited.slice(0, 5)) {
      findings.push(
        issue(
          "MEDIUM",
          input.url,
          `Not cited by ${miss.engine} for "${miss.prompt}"`,
          miss.competitor
            ? `${miss.engine} cites ${miss.competitor} instead for this buying-intent prompt.`
            : `${miss.engine} does not cite this product for a prompt it should own.`,
          "Publish a page that answers this prompt directly, with the claim stated in the first paragraph.",
        ),
      );
    }
  }

  const result = await llm().generate<{ score: number; issues: Issue[] }>({
    tier: "mid",
    system: "You score a product's visibility inside AI search engines and write concrete fixes.",
    prompt: `Site: ${input.url}\nFindings:\n${JSON.stringify(findings, null, 2)}\nCitations:\n${JSON.stringify(citations)}`,
    schema: AUDIT_SCHEMA as unknown as Record<string, unknown>,
    offlineKey: "audit:GEO",
    offlineContext: { findings: JSON.stringify(findings) },
  });

  const merged = result.issues.map((i) => {
    const local = findings.find((f) => f.title === i.title);
    return local ? { ...i, filePath: local.filePath, fileContent: local.fileContent } : i;
  });

  await db.siteAudit.create({
    data: {
      projectId: input.projectId,
      kind: AuditKind.GEO,
      score: result.score,
      issues: merged as never,
      stale,
    },
  });

  return { score: result.score, issues: merged, stale };
}

// ----------------------------------------------------------------- helpers

function issue(
  severity: Issue["severity"],
  page: string,
  title: string,
  detail: string,
  fixSuggestion: string,
  filePath?: string,
  fileContent?: string,
): Issue {
  return {
    id: title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40),
    severity,
    page,
    title,
    detail,
    fixSuggestion,
    filePath,
    fileContent,
  };
}

async function safeFetch(url: string): Promise<string | null> {
  try {
    const { status, html } = await fetchPage(url);
    if (status >= 400) return null;
    return html;
  } catch {
    return null;
  }
}
