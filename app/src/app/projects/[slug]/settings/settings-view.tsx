"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge, Button, Card, ErrorBanner, Toast } from "@/components/ui";
import type { LlmStatus } from "@/lib/llm";

type Agent = {
  channel: string;
  enabled: boolean;
  dailyQuota: number;
  instructions: string;
  config: Record<string, unknown>;
};

type Project = {
  name: string;
  url: string;
  phase: string;
  languages: string[];
  cycleHours: number;
  status: string;
};

export function SettingsView({
  slug,
  project,
  agents: initialAgents,
  llm,
}: {
  slug: string;
  project: Project;
  agents: Agent[];
  llm: LlmStatus;
}) {
  const router = useRouter();
  const [agents, setAgents] = useState(initialAgents);
  const [general, setGeneral] = useState(project);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState("");

  function update(channel: string, patch: Partial<Agent>) {
    setAgents((prev) => prev.map((a) => (a.channel === channel ? { ...a, ...patch } : a)));
  }

  function flash(message: string) {
    setToast(message);
    setTimeout(() => setToast(null), 4000);
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      for (const agent of agents) {
        const response = await fetch(`/api/projects/${slug}/agents/${agent.channel}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            enabled: agent.enabled,
            dailyQuota: agent.dailyQuota,
            instructions: agent.instructions,
            config: agent.config,
          }),
        });
        if (!response.ok) {
          setError(`Could not save the ${agent.channel} agent.`);
          return;
        }
      }

      const response = await fetch(`/api/projects/${slug}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: general.name,
          url: general.url,
          phase: general.phase,
          languages: general.languages,
          cycleHours: general.cycleHours,
        }),
      });
      if (!response.ok) {
        setError("Could not save project settings.");
        return;
      }

      flash("Saved — applies from the next cycle");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function togglePause() {
    const next = general.status === "PAUSED" ? "ACTIVE" : "PAUSED";
    await fetch(`/api/projects/${slug}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    setGeneral({ ...general, status: next });
    flash(next === "PAUSED" ? "Project paused" : "Project resumed");
    router.refresh();
  }

  async function remove() {
    if (confirmDelete !== general.name) return;
    await fetch(`/api/projects/${slug}`, { method: "DELETE" });
    router.push("/");
  }

  return (
    <div className="px-6 py-6 space-y-6 max-w-3xl">
      {error ? <ErrorBanner message={error} testId="settings-error" /> : null}

      <section className="space-y-2">
        <h2 className="text-xs uppercase tracking-wide text-[var(--text-dim)]">Model</h2>
        <Card className="p-3 space-y-3" testId="llm-status">
          <div className="flex flex-wrap items-center gap-3">
            <Badge testId="llm-provider" tone={llm.usingOfflineFallback ? "warn" : "accent"}>
              {llm.provider}
            </Badge>
            <div className="flex flex-wrap gap-3 text-xs text-[var(--text-mute)]">
              {(["high", "mid", "light"] as const).map((tier) => (
                <span key={tier} data-testid={`llm-model-${tier}`}>
                  <span className="text-[var(--text-dim)]">{tier}</span>{" "}
                  <span className="font-[family-name:var(--font-mono)]">{llm.models[tier]}</span>
                </span>
              ))}
            </div>
          </div>

          {llm.usingOfflineFallback ? (
            <p data-testid="llm-offline-warning" className="text-xs text-[var(--warn)]">
              No vendor key is set, so generation runs on deterministic offline fixtures rather
              than a real model. Set one of the keys below and restart.
            </p>
          ) : null}

          <div className="flex flex-wrap gap-2">
            {llm.configuredKeys.map((key) => (
              <span
                key={key.id}
                data-testid={`llm-key-${key.id}`}
                className="inline-flex items-center gap-1.5 text-xs text-[var(--text-dim)]"
                title={key.keyEnv}
              >
                <span className={key.present ? "text-[var(--ok)]" : "text-[var(--text-dim)]"}>
                  {key.present ? "●" : "○"}
                </span>
                {key.label}
              </span>
            ))}
          </div>

          <p className="text-xs text-[var(--text-dim)]">
            Keys are read from the environment and never stored in the database. Change them in{" "}
            <code>.env</code> — see <code>.env.example</code>.
          </p>
        </Card>
      </section>

      <section className="space-y-2">
        <h2 className="text-xs uppercase tracking-wide text-[var(--text-dim)]">Agents</h2>
        {agents.map((agent) => (
          <Card key={agent.channel} className="p-3 space-y-2" testId={`agent-${agent.channel}`}>
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-sm">
                <input
                  data-testid={`agent-${agent.channel}-enabled`}
                  type="checkbox"
                  checked={agent.enabled}
                  onChange={(e) => update(agent.channel, { enabled: e.target.checked })}
                />
                <span className="font-medium">{agent.channel}</span>
              </label>
              <label className="flex items-center gap-2 text-xs text-[var(--text-mute)]">
                quota
                <input
                  data-testid={`agent-${agent.channel}-quota`}
                  type="number"
                  min={0}
                  max={10}
                  value={agent.dailyQuota}
                  onChange={(e) =>
                    update(agent.channel, { dailyQuota: Number(e.target.value) || 0 })
                  }
                  className="w-16 text-xs"
                />
                /day
              </label>
            </div>
            <textarea
              data-testid={`agent-${agent.channel}-instructions`}
              value={agent.instructions}
              onChange={(e) => update(agent.channel, { instructions: e.target.value })}
              rows={2}
              placeholder="Writing instructions — tone, keywords, communities to prefer…"
              className="w-full"
            />
            {agent.channel === "REDDIT" ? (
              <input
                data-testid="agent-REDDIT-subreddits"
                value={((agent.config.subreddits as string[]) ?? []).join(", ")}
                onChange={(e) =>
                  update(agent.channel, {
                    config: {
                      ...agent.config,
                      subreddits: e.target.value
                        .split(",")
                        .map((s) => s.trim())
                        .filter(Boolean),
                    },
                  })
                }
                placeholder="subreddits, comma separated"
                className="w-full text-xs"
              />
            ) : null}
          </Card>
        ))}
      </section>

      <section className="space-y-2">
        <h2 className="text-xs uppercase tracking-wide text-[var(--text-dim)]">Schedule</h2>
        <Card className="p-3">
          <label className="flex items-center gap-2 text-sm">
            Run a cycle every
            <select
              data-testid="cycle-hours"
              value={general.cycleHours}
              onChange={(e) => setGeneral({ ...general, cycleHours: Number(e.target.value) })}
              className="text-sm"
            >
              {[3, 6, 12, 24].map((hours) => (
                <option key={hours} value={hours}>
                  {hours}h
                </option>
              ))}
            </select>
          </label>
        </Card>
      </section>

      <section className="space-y-2">
        <h2 className="text-xs uppercase tracking-wide text-[var(--text-dim)]">General</h2>
        <Card className="p-3 space-y-2">
          <label className="block text-xs text-[var(--text-mute)]">
            Name
            <input
              data-testid="settings-name"
              value={general.name}
              onChange={(e) => setGeneral({ ...general, name: e.target.value })}
              className="mt-1 w-full text-sm"
            />
          </label>
          <label className="block text-xs text-[var(--text-mute)]">
            URL
            <input
              data-testid="settings-url"
              value={general.url}
              onChange={(e) => setGeneral({ ...general, url: e.target.value })}
              className="mt-1 w-full text-sm"
            />
          </label>
          <label className="block text-xs text-[var(--text-mute)]">
            Phase
            <select
              data-testid="settings-phase"
              value={general.phase}
              onChange={(e) => setGeneral({ ...general, phase: e.target.value })}
              className="mt-1 w-full text-sm"
            >
              {["prelaunch", "launched", "growth"].map((phase) => (
                <option key={phase} value={phase}>
                  {phase}
                </option>
              ))}
            </select>
          </label>
          <fieldset className="text-xs text-[var(--text-mute)]">
            <legend>Languages</legend>
            <div className="mt-1 flex gap-4">
              {["en", "ja"].map((lang) => (
                <label key={lang} className="flex items-center gap-1.5">
                  <input
                    data-testid={`settings-lang-${lang}`}
                    type="checkbox"
                    checked={general.languages.includes(lang)}
                    onChange={(e) =>
                      setGeneral({
                        ...general,
                        languages: e.target.checked
                          ? [...new Set([...general.languages, lang])]
                          : general.languages.filter((l) => l !== lang),
                      })
                    }
                  />
                  {lang}
                </label>
              ))}
            </div>
          </fieldset>
        </Card>
      </section>

      <div className="flex gap-2">
        <Button testId="settings-save" variant="primary" onClick={save} disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </Button>
        <Button testId="settings-pause" onClick={togglePause}>
          {general.status === "PAUSED" ? "Resume project" : "Pause project"}
        </Button>
      </div>

      <section className="space-y-2 pt-4 border-t border-[var(--border)]">
        <h2 className="text-xs uppercase tracking-wide text-[var(--danger)]">Danger zone</h2>
        <p className="text-xs text-[var(--text-dim)]">
          Deleting removes the project and everything generated for it. Type{" "}
          <span className="text-[var(--text)]">{general.name}</span> to confirm.
        </p>
        <div className="flex gap-2">
          <input
            data-testid="delete-confirm-input"
            value={confirmDelete}
            onChange={(e) => setConfirmDelete(e.target.value)}
            className="text-sm"
          />
          <Button
            testId="settings-delete"
            variant="danger"
            onClick={remove}
            disabled={confirmDelete !== general.name}
          >
            Delete project
          </Button>
        </div>
      </section>

      <Toast message={toast} testId="settings-toast" />
    </div>
  );
}
