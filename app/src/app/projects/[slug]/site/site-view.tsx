"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge, Button, Card, EmptyState, ErrorBanner, Spinner, Toast } from "@/components/ui";
import type { Issue } from "@/lib/audit";

type Audit = {
  score: number;
  stale: boolean;
  previous: number | null;
  issues: Issue[];
};

const SEVERITY_ORDER: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };

export function SiteView({
  slug,
  seo,
  geo,
}: {
  slug: string;
  seo: Audit | null;
  geo: Audit | null;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"SEO" | "GEO">("SEO");
  const [running, setRunning] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const audit = tab === "SEO" ? seo : geo;

  function flash(message: string) {
    setToast(message);
    setTimeout(() => setToast(null), 4000);
  }

  async function runAudit() {
    setRunning(true);
    setError(null);
    try {
      const response = await fetch(`/api/projects/${slug}/jobs`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "AUDIT" }),
      });
      if (!response.ok) {
        setError("The audit could not complete. Try again.");
        return;
      }
      router.refresh();
    } finally {
      setRunning(false);
    }
  }

  async function createFix(issue: Issue) {
    const response = await fetch(`/api/projects/${slug}/cards`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ issue, type: tab === "SEO" ? "seo_fix" : "geo_fix" }),
    });
    if (response.ok) {
      flash("Added to feed");
    } else {
      setError("Could not create the fix card.");
    }
  }

  // Site files are audited on the SEO pass; the checklist reflects that result
  // rather than duplicating the checks.
  const missing = (needle: string) => seo?.issues.some((i) => i.title.includes(needle)) ?? false;
  const readiness = geo
    ? [
        { label: "llms.txt", ok: !missing("llms.txt") },
        { label: "robots.txt", ok: !missing("robots.txt") },
        { label: "sitemap.xml", ok: !missing("sitemap") },
        { label: "schema markup", ok: !missing("structured data") },
      ]
    : [];

  return (
    <div className="px-6 py-6 space-y-4">
      <div className="flex items-center gap-2">
        <Button testId="site-tab-SEO" variant={tab === "SEO" ? "primary" : "default"} onClick={() => setTab("SEO")}>
          SEO
        </Button>
        <Button testId="site-tab-GEO" variant={tab === "GEO" ? "primary" : "default"} onClick={() => setTab("GEO")}>
          GEO
        </Button>
        <div className="ml-auto flex items-center gap-2">
          {running ? <Spinner label="auditing" /> : null}
          <Button testId="run-audit" onClick={runAudit} disabled={running}>
            Run audit
          </Button>
        </div>
      </div>

      {error ? <ErrorBanner message={error} testId="site-error" /> : null}

      {!audit ? (
        <EmptyState
          title="No audit yet."
          action={
            <Button testId="run-first-audit" variant="primary" onClick={runAudit} disabled={running}>
              Run first audit
            </Button>
          }
        />
      ) : (
        <>
          <div className="flex items-baseline gap-3">
            <span data-testid="audit-score" className="text-3xl font-medium tabular-nums">
              {audit.score}
            </span>
            {audit.previous !== null ? (
              <span className="text-xs text-[var(--text-dim)]">
                {audit.score - audit.previous >= 0 ? "+" : ""}
                {audit.score - audit.previous} since last run
              </span>
            ) : null}
            {audit.stale ? <Badge tone="warn">stale</Badge> : null}
          </div>

          {tab === "GEO" ? (
            <Card className="p-3" testId="ai-readiness">
              <h3 className="text-xs uppercase tracking-wide text-[var(--text-dim)]">
                AI readiness
              </h3>
              <ul className="mt-2 flex flex-wrap gap-3 text-xs">
                {readiness.map((item) => (
                  <li key={item.label} className="flex items-center gap-1.5">
                    <span className={item.ok ? "text-[var(--ok)]" : "text-[var(--danger)]"}>
                      {item.ok ? "✓" : "✗"}
                    </span>
                    {item.label}
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          <div className="space-y-2">
            {audit.issues.length === 0 ? (
              <EmptyState title="No issues found." />
            ) : (
              [...audit.issues]
                .sort(
                  (a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9),
                )
                .map((issue, index) => (
                  <Card key={`${issue.id}-${index}`} testId="issue-row" className="p-3 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        tone={
                          issue.severity === "HIGH"
                            ? "danger"
                            : issue.severity === "MEDIUM"
                              ? "warn"
                              : "neutral"
                        }
                      >
                        {issue.severity}
                      </Badge>
                      <span className="text-sm flex-1 min-w-0">{issue.title}</span>
                      <Button testId="create-fix" onClick={() => createFix(issue)}>
                        Create fix →
                      </Button>
                    </div>
                    <p className="text-xs text-[var(--text-mute)]">{issue.detail}</p>
                    <p className="text-xs text-[var(--accent)]">{issue.fixSuggestion}</p>
                    {issue.fileContent ? (
                      <pre className="rounded-[var(--radius)] bg-[var(--surface-alt)] p-2 font-[family-name:var(--font-mono)] text-[11px] overflow-auto max-h-40 whitespace-pre-wrap">
                        {issue.fileContent}
                      </pre>
                    ) : null}
                  </Card>
                ))
            )}
          </div>
        </>
      )}

      <Toast message={toast} testId="site-toast" />
    </div>
  );
}
