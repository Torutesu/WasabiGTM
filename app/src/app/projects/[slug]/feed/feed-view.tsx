"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Card, EmptyState, ErrorBanner, Skeleton, Toast } from "@/components/ui";

type QualityReview = {
  genericScore: number;
  factualScore: number;
  voiceScore: number;
  communityScore: number | null;
  passed: boolean;
  critique: string;
};

type Draft = {
  id: string;
  version: number;
  content: string;
  authorType: "AGENT" | "AGENT_FIX" | "HUMAN";
  meta: Record<string, unknown> | null;
  qualityReview: QualityReview | null;
};

type PublishRecord = {
  id: string;
  method: string;
  externalUrl: string | null;
  utm: string | null;
};

type FeedCard = {
  id: string;
  channel: string;
  type: string;
  title: string;
  status: string;
  priority: string;
  difficulty: string;
  language: string;
  rationale: string | null;
  archiveReason: string | null;
  sourceRef: Record<string, unknown> | null;
  drafts: Draft[];
  publishRecord: PublishRecord | null;
};

const TABS = ["CURRENT", "DONE", "PUBLISHED", "ARCHIVED"] as const;
const CHANNELS = ["X", "REDDIT", "SEO_GEO", "ARTICLE", "LAUNCH"];
const ARCHIVE_REASONS = [
  { value: "inaccurate", label: "Inaccurate" },
  { value: "off_voice", label: "Off voice" },
  { value: "not_needed", label: "Not needed" },
];

/** Kept outside the component so no state setter is reachable from the effect. */
async function fetchCards(
  slug: string,
  status: string,
  channel: string,
  language: string,
): Promise<FeedCard[] | null> {
  const query = new URLSearchParams({ status });
  if (channel) query.set("channel", channel);
  if (language) query.set("language", language);
  const response = await fetch(`/api/projects/${slug}/cards?${query}`, { cache: "no-store" });
  if (!response.ok) return null;
  const data = (await response.json()) as { cards?: FeedCard[] };
  return data.cards ?? [];
}

export function FeedView({
  slug,
  languages,
  xConnected,
  githubConnected,
  cmsConnected,
}: {
  slug: string;
  languages: string[];
  xConnected: boolean;
  githubConnected: boolean;
  cmsConnected: boolean;
}) {
  const [tab, setTab] = useState<(typeof TABS)[number]>("CURRENT");
  const [channelFilter, setChannelFilter] = useState<string>("");
  const [languageFilter, setLanguageFilter] = useState<string>("");
  const [cards, setCards] = useState<FeedCard[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // A published card leaves this tab immediately, so hold on to the result and
  // keep the link in view rather than letting it vanish with a toast.
  const [lastResult, setLastResult] = useState<{ method: string; url: string | null } | null>(null);

  // The previous list stays on screen while refetching rather than flashing a
  // skeleton on every filter change.
  const reload = useCallback(async () => {
    const next = await fetchCards(slug, tab, channelFilter, languageFilter);
    if (next) setCards(next);
    else setError("Could not load the feed.");
  }, [slug, tab, channelFilter, languageFilter]);

  useEffect(() => {
    let stale = false;
    void fetchCards(slug, tab, channelFilter, languageFilter).then((next) => {
      if (stale) return;
      if (next) setCards(next);
      else setError("Could not load the feed.");
    });
    return () => {
      stale = true;
    };
  }, [slug, tab, channelFilter, languageFilter]);

  function flash(message: string) {
    setToast(message);
    setTimeout(() => setToast(null), 4000);
  }

  return (
    <div className="px-6 py-6 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {TABS.map((value) => (
          <Button
            key={value}
            testId={`tab-${value}`}
            variant={tab === value ? "primary" : "default"}
            onClick={() => {
              setTab(value);
              setOpenId(null);
              setLastResult(null);
            }}
          >
            {value[0] + value.slice(1).toLowerCase()}
          </Button>
        ))}

        <div className="ml-auto flex items-center gap-2">
          <select
            data-testid="filter-channel"
            value={channelFilter}
            onChange={(e) => setChannelFilter(e.target.value)}
            className="text-xs py-1"
            aria-label="Filter by channel"
          >
            <option value="">All channels</option>
            {CHANNELS.map((channel) => (
              <option key={channel} value={channel}>
                {channel}
              </option>
            ))}
          </select>
          <select
            data-testid="filter-language"
            value={languageFilter}
            onChange={(e) => setLanguageFilter(e.target.value)}
            className="text-xs py-1"
            aria-label="Filter by language"
          >
            <option value="">All languages</option>
            {languages.map((language) => (
              <option key={language} value={language}>
                {language}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error ? <ErrorBanner message={error} testId="feed-error" /> : null}

      {lastResult ? (
        <Card className="p-3 flex flex-wrap items-center gap-3 text-sm" testId="last-result">
          <Badge tone="ok">{lastResult.method === "GITHUB_PR" ? "PR opened" : "Published"}</Badge>
          {lastResult.url ? (
            <a
              data-testid={lastResult.method === "GITHUB_PR" ? "pr-url" : "publish-url"}
              href={lastResult.url}
              target="_blank"
              rel="noreferrer"
              className="text-[var(--accent)] underline break-all"
            >
              {lastResult.url}
            </a>
          ) : null}
          <Button variant="ghost" onClick={() => setLastResult(null)}>
            Dismiss
          </Button>
        </Card>
      ) : null}

      <div data-testid="feed-list" className="space-y-2">
        {cards === null ? (
          <Skeleton rows={4} />
        ) : cards.length === 0 ? (
          <EmptyState
            title={
              tab === "CURRENT"
                ? "Nothing waiting. The next cycle will fill this in — or run one from Activity."
                : `No ${tab.toLowerCase()} cards.`
            }
          />
        ) : (
          cards.map((card) => (
            <FeedCardRow
              // Keyed by the latest draft so a new version remounts the editor
              // instead of syncing props into state with an effect.
              key={`${card.id}:${card.drafts[0]?.id ?? "none"}`}
              slug={slug}
              card={card}
              open={openId === card.id}
              onToggle={() => setOpenId(openId === card.id ? null : card.id)}
              onChanged={reload}
              onFlash={flash}
              onError={setError}
              onPublished={setLastResult}
              xConnected={xConnected}
              githubConnected={githubConnected}
              cmsConnected={cmsConnected}
            />
          ))
        )}
      </div>

      <Toast message={toast} testId="feed-toast" />
    </div>
  );
}

function FeedCardRow({
  slug,
  card,
  open,
  onToggle,
  onChanged,
  onFlash,
  onError,
  onPublished,
  xConnected,
  githubConnected,
  cmsConnected,
}: {
  slug: string;
  card: FeedCard;
  open: boolean;
  onToggle: () => void;
  onChanged: () => Promise<void>;
  onFlash: (message: string) => void;
  onError: (message: string | null) => void;
  onPublished: (result: { method: string; url: string | null }) => void;
  xConnected: boolean;
  githubConnected: boolean;
  cmsConnected: boolean;
}) {
  const latest = card.drafts[0];
  // Initialised from the draft; the parent's key remounts this row when a new
  // draft version arrives, so there is no prop-to-state sync effect.
  const [body, setBody] = useState(latest?.content ?? "");
  const [dirty, setDirty] = useState(false);
  const [cardError, setCardError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [askDone, setAskDone] = useState(false);
  const [externalUrl, setExternalUrl] = useState("");
  const [askArchive, setAskArchive] = useState(false);
  const [archiveReason, setArchiveReason] = useState("inaccurate");

  const quality = latest?.qualityReview;
  const meta = (latest?.meta ?? {}) as Record<string, unknown>;
  const source = (card.sourceRef ?? {}) as Record<string, unknown>;

  async function call(path: string, init: RequestInit): Promise<Record<string, unknown> | null> {
    setBusy(true);
    setCardError(null);
    onError(null);
    try {
      const response = await fetch(path, init);
      const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
      if (!response.ok) {
        setCardError(String(data.error ?? "Request failed"));
        return null;
      }
      return data;
    } catch {
      setCardError("Could not reach the server.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function saveDraft() {
    const result = await call(`/api/projects/${slug}/cards/${card.id}/draft`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: body }),
    });
    if (result) {
      setDirty(false);
      onFlash("Draft saved as a new version");
      await onChanged();
    }
  }

  async function publish(method: string) {
    const result = await call(`/api/projects/${slug}/cards/${card.id}/publish`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ method }),
    });
    if (result) {
      const record = result.record as { externalUrl?: string | null } | undefined;
      onPublished({ method, url: record?.externalUrl ?? null });
      onFlash(method === "GITHUB_PR" ? "Pull request opened" : "Published");
      await onChanged();
    }
  }

  async function markDone() {
    const result = await call(`/api/projects/${slug}/cards/${card.id}/done`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ externalUrl: externalUrl || undefined }),
    });
    if (result) {
      setAskDone(false);
      onFlash("Marked done");
      await onChanged();
    }
  }

  async function archive() {
    const result = await call(`/api/projects/${slug}/cards/${card.id}/archive`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reason: archiveReason }),
    });
    if (result) {
      setAskArchive(false);
      onFlash("Archived");
      await onChanged();
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(body);
    } catch {
      // Clipboard can be blocked; the flow still proceeds to the done prompt.
    }
    setAskDone(true);
    onFlash("Copied");
  }

  const canPostX = card.channel === "X" && xConnected && card.status === "CURRENT";
  const canPr = card.channel === "SEO_GEO" && githubConnected && card.status === "CURRENT";
  const canCms = card.channel === "ARTICLE" && cmsConnected && card.status === "CURRENT";
  const variants = Array.isArray(meta.variants)
    ? (meta.variants as Array<{ axis: string; title: string; content: string }>)
    : [];

  return (
    <Card
      testId={`card-${card.channel}`}
      className="overflow-hidden"
      dataAttrs={{ "data-card-id": card.id }}
    >
      <button
        type="button"
        onClick={onToggle}
        className="w-full text-left px-4 py-3 flex flex-wrap items-center gap-2 hover:bg-[var(--surface-alt)] transition-colors"
      >
        <Badge tone="accent">{card.channel}</Badge>
        <Badge testId="card-priority" tone={card.priority === "HIGH" ? "warn" : "neutral"}>
          {card.priority}
        </Badge>
        <Badge testId="card-difficulty">{card.difficulty}</Badge>
        <span className="flex-1 min-w-0 truncate text-sm">{card.title}</span>
        {quality ? (
          <Badge testId="card-quality" tone={quality.passed ? "ok" : "danger"}>
            {Math.round((quality.genericScore + quality.factualScore + quality.voiceScore) / 3)}
          </Badge>
        ) : (
          <Badge testId="card-quality">—</Badge>
        )}
        <Badge testId="card-language">{card.language}</Badge>
      </button>

      {open ? (
        <div data-testid="card-detail" data-card-id={card.id} className="px-4 pb-4 space-y-3 border-t border-[var(--border)] pt-3">
          {cardError ? <ErrorBanner message={cardError} testId="card-error" /> : null}

          <p data-testid="card-rationale" className="text-xs text-[var(--text-mute)]">
            {card.rationale ?? ""}
          </p>

          {card.archiveReason ? (
            <p className="text-xs">
              Archived because:{" "}
              <span data-testid="archive-reason" className="text-[var(--warn)]">
                {card.archiveReason}
              </span>
            </p>
          ) : null}

          {source.threadUrl ? (
            <div data-testid="source-embed" className="rounded-[var(--radius)] bg-[var(--surface-alt)] p-3 text-xs space-y-1">
              <a
                href={String(source.threadUrl)}
                target="_blank"
                rel="noreferrer"
                className="text-[var(--accent)] underline"
              >
                {String(source.title ?? source.threadUrl)} ↗
              </a>
              <p className="text-[var(--text-mute)]">{String(source.excerpt ?? "")}</p>
              <p data-testid="subreddit-rules" className="text-[var(--text-dim)]">
                {String(source.rules ?? "")}
              </p>
            </div>
          ) : null}

          {variants.length > 0 ? (
            <div data-testid="launch-variants" className="space-y-2">
              {variants.map((variant, index) => (
                <div
                  key={index}
                  data-testid="launch-variant"
                  className="rounded-[var(--radius)] bg-[var(--surface-alt)] p-3 text-xs"
                >
                  <div className="text-[var(--text-dim)] uppercase tracking-wide text-[10px]">
                    {variant.axis}
                  </div>
                  <div className="mt-1 font-medium">{variant.title}</div>
                  <button
                    type="button"
                    className="mt-1 text-[var(--accent)] underline"
                    onClick={() => {
                      setBody(variant.content);
                      setDirty(true);
                    }}
                  >
                    Use this variant
                  </button>
                </div>
              ))}
              {meta.timing ? (
                <p data-testid="launch-timing" className="text-xs text-[var(--text-mute)]">
                  {String(meta.timing)}
                </p>
              ) : null}
            </div>
          ) : null}

          {meta.filePath ? (
            <pre
              data-testid="fix-diff"
              className="rounded-[var(--radius)] bg-[var(--surface-alt)] p-3 font-[family-name:var(--font-mono)] text-[11px] overflow-auto max-h-56 whitespace-pre-wrap"
            >
              {`--- /dev/null\n+++ ${String(meta.filePath)}\n${String(meta.fileContent ?? "")
                .split("\n")
                .map((line) => `+${line}`)
                .join("\n")}`}
            </pre>
          ) : null}

          {meta.targetKeyword ? (
            <p className="text-xs">
              Target keyword:{" "}
              <span data-testid="target-keyword" className="text-[var(--accent)]">
                {String(meta.targetKeyword)}
              </span>
            </p>
          ) : null}

          <textarea
            data-testid="draft-editor"
            value={body}
            onChange={(e) => {
              setBody(e.target.value);
              setDirty(true);
            }}
            rows={card.channel === "ARTICLE" ? 16 : 8}
            className="w-full"
          />

          <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-dim)]">
            <span data-testid="draft-version">v{latest?.version ?? 1}</span>
            <span data-testid="draft-author">{latest?.authorType ?? "AGENT"}</span>
            {quality ? (
              <span title={quality.critique}>
                G{quality.genericScore} F{quality.factualScore} V{quality.voiceScore}
                {quality.communityScore !== null ? ` C${quality.communityScore}` : ""}
              </span>
            ) : null}
          </div>

          {card.publishRecord ? (
            <div className="rounded-[var(--radius)] bg-[var(--surface-alt)] p-3 text-xs space-y-1">
              <div>
                <span data-testid="publish-method">{card.publishRecord.method}</span>
                {card.publishRecord.externalUrl ? (
                  <>
                    {" · "}
                    <a
                      data-testid={
                        card.publishRecord.method === "GITHUB_PR" ? "pr-url" : "publish-url"
                      }
                      href={card.publishRecord.externalUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[var(--accent)] underline"
                    >
                      {card.publishRecord.externalUrl}
                    </a>
                  </>
                ) : null}
              </div>
              <pre
                data-testid="publish-body"
                className="whitespace-pre-wrap text-[var(--text-mute)]"
              >
                {body}
              </pre>
              {card.channel === "ARTICLE" ? (
                <pre data-testid="cms-payload" className="text-[var(--text-dim)]">
                  {JSON.stringify(
                    { title: card.title, slug: slugify(card.title), body: "…", og: null },
                    null,
                    1,
                  )}
                </pre>
              ) : null}
            </div>
          ) : null}

          {askDone ? (
            <div data-testid="mark-done-prompt" className="space-y-2 rounded-[var(--radius)] border border-[var(--accent)] p-3">
              <p className="text-xs text-[var(--text-mute)]">
                Paste the URL you posted to, so this can be measured. Optional.
              </p>
              <input
                data-testid="external-url"
                value={externalUrl}
                onChange={(e) => setExternalUrl(e.target.value)}
                placeholder="https://…"
                className="w-full text-xs"
              />
              <div className="flex gap-2">
                <Button testId="mark-done-confirm" variant="primary" onClick={markDone} disabled={busy}>
                  Mark as done
                </Button>
                <Button variant="ghost" onClick={() => setAskDone(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : null}

          {askArchive ? (
            <div className="space-y-2 rounded-[var(--radius)] border border-[var(--border)] p-3">
              <p className="text-xs text-[var(--text-mute)]">Why are you archiving this?</p>
              <div className="flex flex-wrap gap-2">
                {ARCHIVE_REASONS.map((reason) => (
                  <Button
                    key={reason.value}
                    testId={`archive-reason-${reason.value}`}
                    variant={archiveReason === reason.value ? "primary" : "default"}
                    onClick={() => setArchiveReason(reason.value)}
                  >
                    {reason.label}
                  </Button>
                ))}
              </div>
              <div className="flex gap-2">
                <Button testId="archive-confirm" variant="danger" onClick={archive} disabled={busy}>
                  Archive
                </Button>
                <Button variant="ghost" onClick={() => setAskArchive(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2 pt-1">
            {dirty ? (
              <Button testId="draft-save" variant="primary" onClick={saveDraft} disabled={busy}>
                Save edit
              </Button>
            ) : null}

            {canPostX ? (
              <Button testId="card-post" onClick={() => publish("API_X")} disabled={busy}>
                Post now
              </Button>
            ) : null}
            {canPr ? (
              <Button testId="card-create-pr" onClick={() => publish("GITHUB_PR")} disabled={busy}>
                Create PR
              </Button>
            ) : null}
            {canCms ? (
              <Button testId="card-publish-cms" onClick={() => publish("CMS")} disabled={busy}>
                Publish to CMS
              </Button>
            ) : null}
            {card.channel === "ARTICLE" && card.status === "CURRENT" && !cmsConnected ? (
              <Button testId="card-export" onClick={() => downloadMarkdown(card.title, body)}>
                Export
              </Button>
            ) : null}

            {card.status === "CURRENT" ? (
              <>
                <Button testId="card-copy" onClick={copy}>
                  Copy
                </Button>
                <Button testId="card-archive" variant="ghost" onClick={() => setAskArchive(true)}>
                  Archive
                </Button>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </Card>
  );
}

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 60) || "untitled"
  );
}

function downloadMarkdown(title: string, body: string) {
  const blob = new Blob([`# ${title}\n\n${body}`], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${slugify(title)}.md`;
  link.click();
  URL.revokeObjectURL(url);
}
