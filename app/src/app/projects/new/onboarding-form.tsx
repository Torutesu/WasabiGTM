"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, ErrorBanner } from "@/components/ui";

type ExtraSource = { kind: string; label: string; value: string };

const SOURCE_KINDS = [
  { kind: "GITHUB_REPO", label: "GitHub repo", placeholder: "owner/repo" },
  { kind: "DOCUMENT", label: "Paste a document", placeholder: "Positioning memo, brand guide…" },
];

export function OnboardingForm() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [nameTouched, setNameTouched] = useState(false);
  const [phase, setPhase] = useState<"prelaunch" | "launched" | "growth">("prelaunch");
  const [languages, setLanguages] = useState<string[]>(["en"]);
  const [sources, setSources] = useState<ExtraSource[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [urlWarning, setUrlWarning] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function toggleLanguage(lang: string, checked: boolean) {
    setLanguages((prev) => {
      const next = checked ? [...new Set([...prev, lang])] : prev.filter((l) => l !== lang);
      return next;
    });
  }

  async function checkUrl() {
    if (!url) return;
    try {
      const parsed = new URL(url);
      setUrlWarning(null);
      // Only suggest a name while the field is still untouched, so this can
      // never overwrite or race with what the user is typing.
      if (!nameTouched && !name) {
        setName(parsed.hostname.replace(/^www\./, "").split(".")[0]);
      }
    } catch {
      setUrlWarning("That does not look like a URL.");
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (languages.length === 0) {
      setError("Pick at least one language.");
      return;
    }
    setBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          url,
          name,
          phase,
          languages,
          sources: sources
            .filter((s) => s.value.trim())
            .map((s) => ({
              kind: s.kind,
              config:
                s.kind === "GITHUB_REPO"
                  ? { repo: s.value, label: s.value }
                  : { text: s.value, label: s.label },
            })),
        }),
      });

      const data = (await response.json()) as {
        project?: { slug: string };
        error?: string;
      };
      if (!response.ok || !data.project) {
        setError(data.error ?? "Could not create the project.");
        setBusy(false);
        return;
      }
      router.push(`/projects/${data.project.slug}/analyzing`);
    } catch {
      setError("Could not reach the server.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      {error ? <ErrorBanner message={error} testId="onboarding-error" /> : null}

      <section className="space-y-3">
        <h2 className="text-xs uppercase tracking-wide text-[var(--text-dim)]">Step 1 — Product</h2>
        <label className="block">
          <span className="text-xs text-[var(--text-mute)]">Product URL</span>
          <input
            data-testid="onboarding-url"
            type="text"
            required
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onBlur={checkUrl}
            placeholder="https://example.com"
            className="mt-1 w-full"
          />
        </label>
        {urlWarning ? (
          <p data-testid="onboarding-url-warning" className="text-xs text-[var(--warn)]">
            {urlWarning}
          </p>
        ) : null}

        <label className="block">
          <span className="text-xs text-[var(--text-mute)]">Product name</span>
          <input
            data-testid="onboarding-name"
            type="text"
            required
            value={name}
            onChange={(e) => {
              setNameTouched(true);
              setName(e.target.value);
            }}
            className="mt-1 w-full"
          />
        </label>

        <fieldset>
          <legend className="text-xs text-[var(--text-mute)]">Phase</legend>
          <div className="mt-1 flex gap-4 text-sm">
            {(["prelaunch", "launched", "growth"] as const).map((value) => (
              <label key={value} className="flex items-center gap-2">
                <input
                  data-testid={`onboarding-phase-${value}`}
                  type="radio"
                  name="phase"
                  checked={phase === value}
                  onChange={() => setPhase(value)}
                />
                <span className="capitalize">{value}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="text-xs text-[var(--text-mute)]">Languages</legend>
          <div className="mt-1 flex gap-4 text-sm">
            {(
              [
                ["en", "English"],
                ["ja", "日本語"],
              ] as const
            ).map(([code, label]) => (
              <label key={code} className="flex items-center gap-2">
                <input
                  data-testid={`onboarding-lang-${code}`}
                  type="checkbox"
                  checked={languages.includes(code)}
                  onChange={(e) => toggleLanguage(code, e.target.checked)}
                />
                <span>{label}</span>
              </label>
            ))}
          </div>
        </fieldset>
      </section>

      <section className="space-y-3">
        <h2 className="text-xs uppercase tracking-wide text-[var(--text-dim)]">
          Step 2 — Context sources (optional)
        </h2>
        <p className="text-xs text-[var(--text-dim)]">
          The more internal context you connect, the less generic everything downstream is. You
          can add more later.
        </p>
        {sources.map((source, index) => (
          <div key={index} className="flex gap-2">
            <input
              data-testid={`onboarding-source-${index}`}
              value={source.value}
              onChange={(e) =>
                setSources((prev) =>
                  prev.map((s, i) => (i === index ? { ...s, value: e.target.value } : s)),
                )
              }
              placeholder={SOURCE_KINDS.find((k) => k.kind === source.kind)?.placeholder}
              className="flex-1"
            />
            <Button
              variant="ghost"
              onClick={() => setSources((prev) => prev.filter((_, i) => i !== index))}
            >
              Remove
            </Button>
          </div>
        ))}
        <div className="flex gap-2">
          {SOURCE_KINDS.map((kind) => (
            <Button
              key={kind.kind}
              testId={`onboarding-add-${kind.kind}`}
              onClick={() =>
                setSources((prev) => [...prev, { kind: kind.kind, label: kind.label, value: "" }])
              }
            >
              + {kind.label}
            </Button>
          ))}
        </div>
      </section>

      <Button type="submit" variant="primary" testId="onboarding-submit" disabled={busy}>
        {busy ? "Starting…" : "Start analysis"}
      </Button>
    </form>
  );
}
