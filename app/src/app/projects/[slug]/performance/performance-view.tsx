"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Card, EmptyState, ErrorBanner, Skeleton, Toast } from "@/components/ui";

type Row = {
  id: string;
  cardId: string;
  title: string;
  channel: string;
  method: string;
  externalUrl: string | null;
  utm: string | null;
  publishedAt: string;
  impressions: number;
  clicks: number;
  signups: number;
};

type ChannelRow = {
  channel: string;
  published: number;
  impressions: number;
  clicks: number;
  signups: number;
};

type Review = {
  id: string;
  weekStart: string;
  content: string;
  learnings: Record<string, unknown> | null;
};

type Payload = {
  funnel: { published: number; impressions: number; clicks: number; signups: number };
  byChannel: ChannelRow[];
  records: Row[];
  reviews: Review[];
};

const PERIODS = ["7d", "28d", "90d"] as const;

/** Kept outside the component so no state setter is reachable from the effect. */
async function fetchPerformance(
  slug: string,
  period: string,
): Promise<Payload | null> {
  const response = await fetch(`/api/projects/${slug}/performance?period=${period}`, {
    cache: "no-store",
  });
  if (!response.ok) return null;
  return (await response.json()) as Payload;
}

export function PerformanceView({ slug }: { slug: string }) {
  const [period, setPeriod] = useState<(typeof PERIODS)[number]>("28d");
  const [data, setData] = useState<Payload | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [urlDraft, setUrlDraft] = useState<Record<string, string>>({});

  // State is written only after the await, so the effect never triggers a
  // synchronous cascading render.
  const reload = useCallback(async () => {
    const next = await fetchPerformance(slug, period);
    if (next) setData(next);
    else setError("Could not load performance data.");
  }, [slug, period]);

  useEffect(() => {
    let stale = false;
    void fetchPerformance(slug, period).then((next) => {
      if (stale) return;
      if (next) setData(next);
      else setError("Could not load performance data.");
    });
    return () => {
      stale = true;
    };
  }, [slug, period]);

  function flash(message: string) {
    setToast(message);
    setTimeout(() => setToast(null), 4000);
  }

  async function generateReview() {
    setBusy(true);
    try {
      await fetch(`/api/projects/${slug}/jobs`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "WEEKLY_REVIEW" }),
      });
      flash("Weekly review written");
      await reload();
    } finally {
      setBusy(false);
    }
  }

  async function attachUrl(recordId: string) {
    const url = urlDraft[recordId];
    if (!url) return;
    await fetch(`/api/projects/${slug}/publish-records/${recordId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ externalUrl: url }),
    });
    flash("URL attached — it will be measured on the next pull");
    await reload();
  }

  return (
    <div className="px-6 py-6 space-y-5">
      <div className="flex items-center gap-2">
        {PERIODS.map((value) => (
          <Button
            key={value}
            testId={`period-${value}`}
            variant={period === value ? "primary" : "default"}
            onClick={() => setPeriod(value)}
          >
            {value}
          </Button>
        ))}
        <div className="ml-auto">
          <Button testId="generate-review" onClick={generateReview} disabled={busy}>
            {busy ? "Analysing…" : "Generate review"}
          </Button>
        </div>
      </div>

      {error ? <ErrorBanner message={error} testId="performance-error" /> : null}

      {data === null ? (
        <Skeleton rows={6} />
      ) : (
        <>
          <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Metric label="Published" value={data.funnel.published} testId="funnel-published" />
            <Metric label="Impressions" value={data.funnel.impressions} testId="funnel-impressions" />
            <Metric label="Clicks" value={data.funnel.clicks} testId="funnel-clicks" />
            <Metric label="Signups" value={data.funnel.signups} testId="funnel-signups" />
          </section>

          <section className="space-y-2">
            <h2 className="text-xs uppercase tracking-wide text-[var(--text-dim)]">By channel</h2>
            {data.byChannel.length === 0 ? (
              <EmptyState title="Publish your first card to see channel results." />
            ) : (
              <Card className="divide-y divide-[var(--border)]" testId="channel-table">
                {data.byChannel.map((row) => (
                  <div
                    key={row.channel}
                    data-testid={`channel-row-${row.channel}`}
                    className="p-3 flex items-center gap-4 text-sm"
                  >
                    <Badge tone="accent">{row.channel}</Badge>
                    <span className="text-[var(--text-mute)] text-xs">{row.published} published</span>
                    <span className="ml-auto tabular-nums text-xs">{row.impressions} imp</span>
                    <span className="tabular-nums text-xs">{row.clicks} clicks</span>
                    <span className="tabular-nums text-xs">{row.signups} signups</span>
                  </div>
                ))}
              </Card>
            )}
          </section>

          <section className="space-y-2">
            <h2 className="text-xs uppercase tracking-wide text-[var(--text-dim)]">
              Individual results
            </h2>
            {data.records.length === 0 ? (
              <EmptyState title="Nothing published in this period." />
            ) : (
              <Card className="divide-y divide-[var(--border)]">
                {data.records.map((row) => (
                  <div key={row.id} data-testid="record-row" className="p-3 space-y-2 text-sm">
                    <div className="flex flex-wrap items-center gap-3">
                      <Badge>{row.channel}</Badge>
                      <span className="flex-1 min-w-0 truncate">{row.title}</span>
                      <span data-testid="record-impressions" className="tabular-nums text-xs">
                        {row.impressions}
                      </span>
                      <span data-testid="record-clicks" className="tabular-nums text-xs">
                        {row.clicks}
                      </span>
                      <span className="tabular-nums text-xs">{row.signups}</span>
                      <Button
                        variant="ghost"
                        onClick={() => setExpanded(expanded === row.id ? null : row.id)}
                      >
                        {expanded === row.id ? "Hide" : "Details"}
                      </Button>
                    </div>
                    {expanded === row.id ? (
                      <div className="space-y-2 text-xs text-[var(--text-mute)]">
                        <p data-testid="record-utm" className="font-[family-name:var(--font-mono)] break-all">
                          {row.utm ?? "no utm"}
                        </p>
                        {row.externalUrl ? (
                          <a
                            href={row.externalUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[var(--accent)] underline break-all"
                          >
                            {row.externalUrl}
                          </a>
                        ) : (
                          <div className="flex gap-2">
                            <input
                              data-testid={`attach-url-${row.id}`}
                              value={urlDraft[row.id] ?? ""}
                              onChange={(e) =>
                                setUrlDraft({ ...urlDraft, [row.id]: e.target.value })
                              }
                              placeholder="Paste the published URL"
                              className="flex-1 text-xs"
                            />
                            <Button onClick={() => attachUrl(row.id)}>Add URL</Button>
                          </div>
                        )}
                      </div>
                    ) : null}
                  </div>
                ))}
              </Card>
            )}
          </section>

          <section className="space-y-2">
            <h2 className="text-xs uppercase tracking-wide text-[var(--text-dim)]">
              Weekly reviews
            </h2>
            {data.reviews.length === 0 ? (
              <EmptyState title="No review yet. Generate one once you have a week of data." />
            ) : (
              data.reviews.map((review) => (
                <Card key={review.id} testId="review-item" className="p-3 space-y-2">
                  <div className="text-xs text-[var(--text-dim)]">
                    week of {review.weekStart.slice(0, 10)}
                  </div>
                  <pre className="whitespace-pre-wrap text-sm">{review.content}</pre>
                  <div
                    data-testid="review-learnings"
                    className="text-xs text-[var(--accent)] font-[family-name:var(--font-mono)]"
                  >
                    {JSON.stringify(review.learnings ?? {})}
                  </div>
                </Card>
              ))
            )}
          </section>
        </>
      )}

      <Toast message={toast} testId="performance-toast" />
    </div>
  );
}

function Metric({ label, value, testId }: { label: string; value: number; testId: string }) {
  return (
    <Card className="p-4">
      <div data-testid={testId} className="text-2xl font-medium tabular-nums">
        {value}
      </div>
      <div className="mt-0.5 text-xs text-[var(--text-dim)]">{label}</div>
    </Card>
  );
}
