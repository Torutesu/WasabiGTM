"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Spinner } from "@/components/ui";

const JOBS = [
  { kind: "DAILY_CYCLE", label: "Run now", testId: "run-cycle" },
  { kind: "AUDIT", label: "Run audit", testId: "run-audit-dashboard" },
  { kind: "METRIC_PULL", label: "Pull metrics", testId: "run-metrics" },
  { kind: "CONTEXT_SYNC", label: "Sync context", testId: "run-sync" },
];

export function JobControls({ slug }: { slug: string }) {
  const router = useRouter();
  const [running, setRunning] = useState<string | null>(null);

  async function run(kind: string) {
    if (running) return;
    setRunning(kind);
    try {
      await fetch(`/api/projects/${slug}/jobs`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind }),
      });
      router.refresh();
    } finally {
      setRunning(null);
    }
  }

  return (
    <div className="flex items-center gap-2">
      {running ? <Spinner label={running} /> : null}
      {JOBS.map((job) => (
        <Button
          key={job.kind}
          testId={job.testId}
          variant={job.kind === "DAILY_CYCLE" ? "primary" : "default"}
          onClick={() => run(job.kind)}
          disabled={running !== null}
        >
          {job.label}
        </Button>
      ))}
    </div>
  );
}
