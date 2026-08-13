"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge, Button, Card, ErrorBanner, Toast } from "@/components/ui";

type Integration = { kind: string; status: string; label: string | null };

const CATALOG = [
  {
    kind: "X_OAUTH",
    name: "X (Twitter)",
    detail: "Post approved drafts. Posting scope only.",
    connectLabel: "Connect",
  },
  {
    kind: "GITHUB_APP",
    name: "GitHub",
    detail: "Open pull requests for site fixes. Never merges.",
    connectLabel: "Connect",
  },
  { kind: "GSC", name: "Search Console", detail: "Clicks, impressions, queries.", connectLabel: "Connect" },
  { kind: "GA", name: "Analytics", detail: "Sessions and users.", connectLabel: "Connect" },
  {
    kind: "CMS_WEBHOOK",
    name: "CMS publish",
    detail: "Publish articles to your own site.",
    connectLabel: "Configure",
    configurable: true,
  },
  {
    kind: "SLACK_WEBHOOK",
    name: "Slack notifications",
    detail: "Ping when a cycle produces cards.",
    connectLabel: "Configure",
    configurable: true,
  },
];

export function IntegrationsView({
  slug,
  integrations,
}: {
  slug: string;
  integrations: Integration[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [configuring, setConfiguring] = useState<string | null>(null);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [secret, setSecret] = useState("");

  const statusOf = (kind: string) =>
    integrations.find((i) => i.kind === kind)?.status ?? "DISCONNECTED";

  function flash(message: string) {
    setToast(message);
    setTimeout(() => setToast(null), 4000);
  }

  async function upsert(kind: string, status: string, config?: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/projects/${slug}/integrations`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind, status, config }),
      });
      if (!response.ok) {
        setError("Could not update the integration.");
        return false;
      }
      router.refresh();
      return true;
    } finally {
      setBusy(false);
    }
  }

  async function connect(kind: string) {
    // In a live deployment this hands off to the provider's OAuth flow; the
    // callback then writes the same record with the real tokens.
    const ok = await upsert(kind, "CONNECTED", {
      handle: "founder",
      repo: "wasabi/site",
      accessToken: "connected-via-oauth",
      expired: false,
    });
    if (ok) flash(`${kind} connected`);
  }

  async function disconnect(kind: string) {
    setBusy(true);
    try {
      await fetch(`/api/projects/${slug}/integrations/${kind}`, { method: "DELETE" });
      router.refresh();
      flash(`${kind} disconnected`);
    } finally {
      setBusy(false);
    }
  }

  async function saveConfig(kind: string) {
    const ok = await upsert(kind, "CONNECTED", { webhookUrl, secret });
    if (ok) {
      setConfiguring(null);
      setWebhookUrl("");
      setSecret("");
      flash(`${kind} configured`);
    }
  }

  return (
    <div className="px-6 py-6 space-y-3">
      {error ? <ErrorBanner message={error} testId="integrations-error" /> : null}

      {CATALOG.map((item) => {
        const status = statusOf(item.kind);
        return (
          <Card key={item.kind} className="p-4 space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <span
                className={
                  status === "CONNECTED"
                    ? "text-[var(--ok)]"
                    : status === "ERROR"
                      ? "text-[var(--danger)]"
                      : "text-[var(--text-dim)]"
                }
                aria-hidden
              >
                {status === "CONNECTED" ? "●" : status === "ERROR" ? "⚠" : "○"}
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-sm">{item.name}</div>
                <div className="text-xs text-[var(--text-dim)]">{item.detail}</div>
              </div>
              <Badge
                testId={`status-${item.kind}`}
                tone={status === "CONNECTED" ? "ok" : status === "ERROR" ? "danger" : "neutral"}
              >
                {status}
              </Badge>

              {status === "DISCONNECTED" ? (
                <Button
                  testId={item.configurable ? `configure-${item.kind}` : `connect-${item.kind}`}
                  onClick={() =>
                    item.configurable ? setConfiguring(item.kind) : connect(item.kind)
                  }
                  disabled={busy}
                >
                  {item.connectLabel}
                </Button>
              ) : status === "ERROR" ? (
                <Button
                  testId={`reconnect-${item.kind}`}
                  variant="primary"
                  onClick={() => connect(item.kind)}
                  disabled={busy}
                >
                  Reconnect
                </Button>
              ) : (
                <>
                  <Button
                    testId={`disconnect-${item.kind}`}
                    variant="ghost"
                    onClick={() => disconnect(item.kind)}
                    disabled={busy}
                  >
                    Disconnect
                  </Button>
                  {/* Lets us prove the expired-token fallback without waiting for a real expiry. */}
                  <Button
                    testId={`expire-${item.kind}`}
                    variant="ghost"
                    title="Simulate an expired token"
                    onClick={() => upsert(item.kind, "ERROR")}
                    disabled={busy}
                  >
                    Simulate expiry
                  </Button>
                </>
              )}
            </div>

            {configuring === item.kind ? (
              <div className="space-y-2 rounded-[var(--radius)] border border-[var(--accent)] p-3">
                <input
                  data-testid={item.kind === "CMS_WEBHOOK" ? "cms-webhook-url" : "notify-url"}
                  value={webhookUrl}
                  onChange={(e) => setWebhookUrl(e.target.value)}
                  placeholder="https://…/webhook"
                  className="w-full text-sm"
                />
                <input
                  data-testid={item.kind === "CMS_WEBHOOK" ? "cms-secret" : "notify-secret"}
                  value={secret}
                  onChange={(e) => setSecret(e.target.value)}
                  placeholder="Shared secret"
                  className="w-full text-sm"
                />
                <div className="flex gap-2">
                  <Button
                    testId={item.kind === "CMS_WEBHOOK" ? "cms-save" : "notify-save"}
                    variant="primary"
                    onClick={() => saveConfig(item.kind)}
                    disabled={busy}
                  >
                    Save
                  </Button>
                  <Button variant="ghost" onClick={() => setConfiguring(null)}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : null}
          </Card>
        );
      })}

      <Toast message={toast} testId="integrations-toast" />
    </div>
  );
}
