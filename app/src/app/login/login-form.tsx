"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, ErrorBanner } from "@/components/ui";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/signin", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? "Invalid email or password");
        return;
      }
      router.push("/");
      router.refresh();
    } catch {
      setError("Could not reach the server. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      {error ? <ErrorBanner message={error} testId="login-error" /> : null}
      <label className="block">
        <span className="text-xs text-[var(--text-mute)]">Email</span>
        <input
          data-testid="login-email"
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1 w-full"
        />
      </label>
      <label className="block">
        <span className="text-xs text-[var(--text-mute)]">Password</span>
        <input
          data-testid="login-password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-1 w-full"
        />
      </label>
      <div className="pt-2">
        <Button type="submit" variant="primary" testId="login-submit" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </Button>
      </div>
    </form>
  );
}
