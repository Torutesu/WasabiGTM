"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge, Button, Card, ErrorBanner, Toast } from "@/components/ui";

type Integration = { kind: string; status: string; label: string | null };

/** Which credential paths the server actually has configured. */
export type Providers = {
  x: boolean;
  google: boolean;
  githubApp: boolean;
  /** E2E and local demos: connect writes a fake record instead of leaving the app. */
  mock: boolean;
};

type Field = { key: string; label: string; testId: string; placeholder: string; secret?: boolean };

type CatalogItem = {
  kind: string;
  name: string;
  detail: string;
  connectLabel: string;
  /** OAuth-style handoff to the provider. */
  authorize?: (slug: string) => string;
  /** Credentials typed in by the user. */
  fields?: Field[];
  /** Shown when the provider's server-side credentials are missing. */
  missingHint?: string;
};

const CATALOG: CatalogItem[] = [
  {
    kind: "X_OAUTH",
    name: "X (Twitter)",
    detail: "Post approved drafts. Posting scope only.",
    connectLabel: "Connect",
    authorize: (slug) => `/api/integrations/x/authorize?project=${encodeURIComponent(slug)}`,
    missingHint: "Set X_CLIENT_ID / X_CLIENT_SECRET to enable this.",
  },
  {
    kind: "GITHUB_APP",
    name: "GitHub",
    detail: "Open pull requests for site fixes. Never merges.",
    connectLabel: "Install app",
    authorize: (slug) => `/api/integrations/github/authorize?project=${encodeURIComponent(slug)}`,
    fields: [
      { key: "repo", label: "Repository", testId: "github-repo", placeholder: "owner/name" },
      {
        key: "githubToken",
        label: "Fine-grained token",
        testId: "github-token",
        placeholder: "github_pat_…",
        secret: true,
      },
    ],
    missingHint: "No GitHub App configured — paste a fine-grained token instead.",
  },
  {
    kind: "GSC",
    name: "Search Console",
    detail: "Clicks, impressions, queries.",
    connectLabel: "Connect",
    authorize: (slug) =>
      `/api/integrations/google/authorize?project=${encodeURIComponent(slug)}&kind=GSC`,
    missingHint: "Set GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET to enable this.",
  },
  {
    kind: "GA",
    name: "Analytics",
    detail: "Sessions and users.",
    connectLabel: "Connect",
    authorize: (slug) =>
      `/api/integrations/google/authorize?project=${encodeURIComponent(slug)}&kind=GA`,
    missingHint: "Set GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET to enable this.",
  },
  {
    kind: "CMS_WEBHOOK",
    name: "CMS publish",
    detail: "Publish articles to your own site.",
    connectLabel: "Configure",
    fields: [
      {
        key: "webhookUrl",
        label: "Webhook URL",
        testId: "cms-webhook-url",
        placeholder: "https://…/webhook",
      },
      {
        key: "secret",
        label: "Shared secret",
        testId: "cms-secret",
        placeholder: "Shared secret",
        secret: true,
      },
    ],
  },
  {
    kind: "SLACK_WEBHOOK",
    name: "Slack notifications",
    detail: "Ping when a cycle produces cards.",
    connectLabel: "Configure",
    fields: [
      {
        key: "webhookUrl",
        label: "Webhook URL",
        testId: "notify-url",
        placeholder: "https://hooks.slack.com/…",
      },
      {
        key: "secret",
        label: "Shared secret",
        testId: "notify-secret",
        placeholder: "Optional",
        secret: true,
      },
    ],
  },
];

/** Whether the provider's server-side credentials exist for this item. */
function available(item: CatalogItem, providers: Providers): boolean {
  if (!item.authorize) return true;
  switch (item.kind) {
    case "X_OAUTH":
      return providers.x;
    case "GITHUB_APP":
      return providers.githubApp;
    case "GSC":
    case "GA":
      return providers.google;
    default:
      return true;
  }
}

export function IntegrationsView({
  slug,
  integrations,
  providers,
  notice,
}: {
  slug: string;
  integrations: Integration[];
  providers: Providers;
  notice?: { connected?: string; error?: string };
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(notice?.connected ? `${notice.connected} connected` : null);
  const [error, setError] = useState<string | null>(notice?.error ?? null);
  const [configuring, setConfiguring] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});

  const statusOf = (kind: string) =>
    integrations.find((i) => i.kind === kind)?.status ?? "DISCONNECTED";
  const labelOf = (kind: string) => integrations.find((i) => i.kind === kind)?.label ?? null;

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

  async function connect(item: CatalogItem) {
    if (providers.mock) {
      // Mock mode keeps the whole loop inside the app so it can be exercised
      // without third-party accounts. Never enabled in production.
      const ok = await upsert(item.kind, "CONNECTED", {
        handle: "founder",
        repo: "wasabi/site",
        accessToken: "connected-via-oauth",
        expired: false,
      });
      if (ok) flash(`${item.kind} connected`);
      return;
    }

    if (item.authorize && available(item, providers)) {
      // A full-page navigation, because the provider will not render in a frame.
      window.location.assign(item.authorize(slug));
      return;
    }
    setConfiguring(item.kind);
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

  async function saveFields(item: CatalogItem) {
    const config: Record<string, unknown> = {};
    for (const field of item.fields ?? []) {
      const value = values[`${item.kind}.${field.key}`] ?? "";
      if (value) config[field.key] = value;
    }
    const ok = await upsert(item.kind, "CONNECTED", config);
    if (ok) {
      setConfiguring(null);
      setValues({});
      flash(`${item.kind} configured`);
    }
  }

  return (
    <div className="px-6 py-6 space-y-3">
      {error ? <ErrorBanner message={error} testId="integrations-error" /> : null}

      {CATALOG.map((item) => {
        const status = statusOf(item.kind);
        const label = labelOf(item.kind);
        const oauthReady = Boolean(item.authorize) && available(item, providers);
        const canType = Boolean(item.fields);
        // Items with no provider handoff go straight to their form.
        const formOnly = !item.authorize && canType;
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
                <div className="text-xs text-[var(--text-dim)]">
                  {status === "CONNECTED" && label ? label : item.detail}
                </div>
                {!providers.mock && !oauthReady && item.missingHint && status === "DISCONNECTED" ? (
                  <div
                    className="text-xs text-[var(--text-dim)] mt-1"
                    data-testid={`hint-${item.kind}`}
                  >
                    {item.missingHint}
                  </div>
                ) : null}
              </div>
              <Badge
                testId={`status-${item.kind}`}
                tone={status === "CONNECTED" ? "ok" : status === "ERROR" ? "danger" : "neutral"}
              >
                {status}
              </Badge>

              {status === "DISCONNECTED" ? (
                <>
                  <Button
                    testId={formOnly ? `configure-${item.kind}` : `connect-${item.kind}`}
                    onClick={() => (formOnly ? setConfiguring(item.kind) : connect(item))}
                    disabled={busy}
                  >
                    {providers.mock || oauthReady || formOnly ? item.connectLabel : "Configure"}
                  </Button>
                  {/* An App install and a pasted token are both valid ways in. */}
                  {!providers.mock && oauthReady && canType ? (
                    <Button
                      testId={`configure-${item.kind}`}
                      variant="ghost"
                      onClick={() => setConfiguring(item.kind)}
                      disabled={busy}
                    >
                      Use a token
                    </Button>
                  ) : null}
                </>
              ) : status === "ERROR" ? (
                <Button
                  testId={`reconnect-${item.kind}`}
                  variant="primary"
                  onClick={() => connect(item)}
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

            {configuring === item.kind && item.fields ? (
              <div className="space-y-2 rounded-[var(--radius)] border border-[var(--accent)] p-3">
                {item.fields.map((field) => (
                  <label key={field.key} className="block space-y-1">
                    <span className="text-xs text-[var(--text-dim)]">{field.label}</span>
                    <input
                      data-testid={field.testId}
                      type={field.secret ? "password" : "text"}
                      value={values[`${item.kind}.${field.key}`] ?? ""}
                      onChange={(e) =>
                        setValues((current) => ({
                          ...current,
                          [`${item.kind}.${field.key}`]: e.target.value,
                        }))
                      }
                      placeholder={field.placeholder}
                      className="w-full text-sm"
                    />
                  </label>
                ))}
                <div className="flex gap-2">
                  <Button
                    testId={saveTestId(item.kind)}
                    variant="primary"
                    onClick={() => saveFields(item)}
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

function saveTestId(kind: string): string {
  if (kind === "CMS_WEBHOOK") return "cms-save";
  if (kind === "SLACK_WEBHOOK") return "notify-save";
  return `save-${kind}`;
}
