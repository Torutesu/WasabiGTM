"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, ErrorBanner } from "@/components/ui";

type Job = {
  id: string;
  status: "RUNNING" | "SUCCESS" | "FAILED";
  log: string | null;
  error: string | null;
};

const TOTAL_STEPS = 7;

export function AnalysisTerminal({
  slug,
  initialJobId,
}: {
  slug: string;
  initialJobId: string | null;
}) {
  const router = useRouter();
  const [job, setJob] = useState<Job | null>(null);
  const [retrying, setRetrying] = useState(false);
  const logRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const response = await fetch(
          `/api/projects/${slug}/jobs?kind=ONBOARD_ANALYSIS&limit=1`,
          { cache: "no-store" },
        );
        if (!response.ok) return;
        const data = (await response.json()) as { jobs: Job[] };
        const latest = data.jobs[0];
        if (cancelled || !latest) return;
        setJob(latest);

        if (latest.status === "SUCCESS") {
          setTimeout(() => router.push(`/projects/${slug}`), 1200);
          return;
        }
        if (latest.status === "RUNNING") {
          setTimeout(poll, 1500);
        }
      } catch {
        if (!cancelled) setTimeout(poll, 3000);
      }
    }

    void poll();
    return () => {
      cancelled = true;
    };
  }, [slug, router, initialJobId]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [job?.log]);

  const lines = (job?.log ?? "$ Initializing Wasabi CMO...").split("\n");
  const completed = lines.filter((line) => /done|ok|✓/.test(line)).length;
  const progress = Math.min(100, Math.round((completed / TOTAL_STEPS) * 100));

  async function retry() {
    if (!job) return;
    setRetrying(true);
    await fetch(`/api/projects/${slug}/jobs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "ONBOARD_ANALYSIS", retryOf: job.id }),
    });
    setRetrying(false);
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <pre
        ref={logRef}
        data-testid="analysis-log"
        className="h-80 overflow-auto rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4 font-[family-name:var(--font-mono)] text-xs leading-relaxed whitespace-pre-wrap"
      >
        {lines.join("\n")}
        {job?.status === "SUCCESS" ? "\n✓ Context loaded and CMO initialized" : ""}
      </pre>

      <div className="flex items-center gap-3">
        <div className="h-1.5 flex-1 rounded-full bg-[var(--surface-alt)] overflow-hidden">
          <div
            className="h-full bg-[var(--accent)] transition-all duration-500"
            style={{ width: `${job?.status === "SUCCESS" ? 100 : progress}%` }}
          />
        </div>
        <span data-testid="analysis-progress" className="text-xs text-[var(--text-dim)]">
          {job?.status === "SUCCESS" ? "done" : `${completed}/${TOTAL_STEPS} steps`}
        </span>
      </div>

      {job?.status === "FAILED" ? (
        <div className="space-y-3">
          <ErrorBanner
            testId="analysis-error"
            message={job.error ?? "Analysis failed after three attempts."}
          />
          <Button testId="analysis-retry" onClick={retry} disabled={retrying}>
            {retrying ? "Retrying…" : "Retry"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
