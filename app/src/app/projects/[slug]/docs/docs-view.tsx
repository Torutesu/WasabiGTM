"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge, Button, Card, EmptyState, ErrorBanner, Toast } from "@/components/ui";

type Doc = {
  kind: string;
  content: string;
  version: number;
  updatedBy: string | null;
  updatedAt: string;
};

type Source = {
  id: string;
  kind: string;
  config: Record<string, unknown>;
  lastSyncAt: string | null;
  lastError: string | null;
  suggestion: Record<string, unknown> | null;
};

const KINDS = [
  { kind: "PRODUCT_DESCRIPTION", label: "Product Description" },
  { kind: "PRODUCT_INFO", label: "Product Information" },
  { kind: "MARKETING_STRATEGY", label: "Marketing Strategy" },
  { kind: "COMPETITOR_ANALYSIS", label: "Competitor Analysis" },
  { kind: "BRAND_VOICE", label: "Brand Voice" },
];

export function DocsView({
  slug,
  docs,
  sources,
}: {
  slug: string;
  docs: Doc[];
  sources: Source[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"docs" | "sources">("docs");
  const [kind, setKind] = useState(KINDS[0].kind);
  const [drafts, setDrafts] = useState<Record<string, string>>(
    Object.fromEntries(docs.map((doc) => [doc.kind, doc.content])),
  );
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const current = docs.find((doc) => doc.kind === kind);
  const value = drafts[kind] ?? current?.content ?? "";

  function flash(message: string) {
    setToast(message);
    setTimeout(() => setToast(null), 4000);
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/projects/${slug}/docs/${kind}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content: value }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setError(data.error ?? "Could not save");
        return;
      }
      flash("Saved — applies from the next generation cycle");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function sync(sourceId: string) {
    setBusy(true);
    try {
      const response = await fetch(`/api/projects/${slug}/sources/${sourceId}/sync`, {
        method: "POST",
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string | null };
      if (!response.ok) {
        setError(data.error ?? "Sync failed");
        return;
      }
      flash(data.error ? `Synced with an error: ${data.error}` : "Sync complete");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="px-6 py-6 space-y-4">
      <div className="flex gap-2">
        <Button testId="docs-tab-docs" variant={tab === "docs" ? "primary" : "default"} onClick={() => setTab("docs")}>
          Docs
        </Button>
        <Button
          testId="docs-tab-sources"
          variant={tab === "sources" ? "primary" : "default"}
          onClick={() => setTab("sources")}
        >
          Sources
        </Button>
      </div>

      {error ? <ErrorBanner message={error} testId="docs-error" /> : null}

      {tab === "docs" ? (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {KINDS.map((item) => (
              <Button
                key={item.kind}
                testId={`doc-tab-${item.kind}`}
                variant={kind === item.kind ? "primary" : "default"}
                onClick={() => setKind(item.kind)}
              >
                {item.label}
              </Button>
            ))}
          </div>

          {current ? (
            <>
              <textarea
                data-testid="doc-editor"
                value={value}
                onChange={(e) => setDrafts({ ...drafts, [kind]: e.target.value })}
                rows={24}
                className="w-full"
              />
              <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--text-dim)]">
                <span data-testid="doc-version">v{current.version}</span>
                <span>{current.updatedBy === "agent" ? "updated by agent" : "edited by you"}</span>
                <div className="ml-auto flex gap-2">
                  <Button testId="doc-save" variant="primary" onClick={save} disabled={busy}>
                    Save
                  </Button>
                  <Button
                    testId="doc-copy"
                    onClick={() => void navigator.clipboard.writeText(value).catch(() => {})}
                  >
                    Copy
                  </Button>
                  <Button testId="doc-download" onClick={() => download(kind, value)}>
                    Download
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <EmptyState title="This document has not been generated yet." />
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {sources.length === 0 ? (
            <EmptyState title="No context sources yet." />
          ) : (
            sources.map((source) => (
              <Card
                key={source.id}
                testId={`source-row-${source.kind}`}
                className="p-3 flex flex-wrap items-center gap-3"
              >
                <Badge tone="accent">{source.kind}</Badge>
                <span className="text-sm truncate flex-1 min-w-0">
                  {String(source.config.url ?? source.config.repo ?? source.config.label ?? "—")}
                </span>
                {source.lastError ? (
                  <span className="text-xs text-[var(--danger)]">{source.lastError}</span>
                ) : (
                  <span className="text-xs text-[var(--text-dim)]">
                    {source.lastSyncAt ? `synced ${timeAgo(source.lastSyncAt)}` : "never synced"}
                  </span>
                )}
                {source.suggestion ? (
                  <Badge testId={`suggestion-${source.kind}`} tone="warn">
                    Update suggested
                  </Badge>
                ) : null}
                <Button testId={`sync-${source.kind}`} onClick={() => sync(source.id)} disabled={busy}>
                  Sync
                </Button>
              </Card>
            ))
          )}
        </div>
      )}

      <Toast message={toast} testId="doc-toast" />
    </div>
  );
}

function download(kind: string, content: string) {
  const blob = new Blob([content], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${kind.toLowerCase()}.md`;
  link.click();
  URL.revokeObjectURL(url);
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}
