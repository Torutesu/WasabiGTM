"use client";

import type { ReactNode } from "react";

/** Shared primitives. Every colour is a brand token — none are hardcoded here. */

export function Button({
  children,
  onClick,
  variant = "default",
  disabled,
  testId,
  type = "button",
  title,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "default" | "primary" | "danger" | "ghost";
  disabled?: boolean;
  testId?: string;
  type?: "button" | "submit";
  title?: string;
}) {
  const styles: Record<string, string> = {
    default: "bg-[var(--surface-alt)] border-[var(--border)] text-[var(--text)]",
    primary: "bg-[var(--accent)] border-[var(--accent)] text-[var(--accent-contrast)] font-medium",
    danger: "bg-transparent border-[var(--danger)] text-[var(--danger)]",
    ghost: "bg-transparent border-transparent text-[var(--text-mute)]",
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      data-testid={testId}
      title={title}
      className={`px-3 py-1.5 rounded-[var(--radius)] border text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-110 ${styles[variant]}`}
    >
      {children}
    </button>
  );
}

export function Badge({
  children,
  tone = "neutral",
  testId,
}: {
  children: ReactNode;
  tone?: "neutral" | "accent" | "ok" | "warn" | "danger";
  testId?: string;
}) {
  const tones: Record<string, string> = {
    neutral: "text-[var(--text-dim)] border-[var(--border)]",
    accent: "text-[var(--accent)] border-[var(--accent)]",
    ok: "text-[var(--ok)] border-[var(--ok)]",
    warn: "text-[var(--warn)] border-[var(--warn)]",
    danger: "text-[var(--danger)] border-[var(--danger)]",
  };
  return (
    <span
      data-testid={testId}
      className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] uppercase tracking-wide ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

export function Card({
  children,
  className = "",
  testId,
  onClick,
  dataAttrs,
}: {
  children: ReactNode;
  className?: string;
  testId?: string;
  onClick?: () => void;
  dataAttrs?: Record<string, string>;
}) {
  return (
    <div
      data-testid={testId}
      onClick={onClick}
      {...dataAttrs}
      className={`bg-[var(--surface)] border border-[var(--border)] rounded-[var(--radius)] ${className}`}
    >
      {children}
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-[var(--text-mute)] text-sm">
      <span className="inline-block w-3 h-3 rounded-full border-2 border-[var(--border)] border-t-[var(--accent)] animate-spin" />
      {label}
    </span>
  );
}

export function Toast({ message, testId }: { message: string | null; testId: string }) {
  if (!message) return null;
  return (
    <div
      data-testid={testId}
      role="status"
      className="fixed bottom-6 right-6 z-50 px-4 py-2 rounded-[var(--radius)] bg-[var(--surface-alt)] border border-[var(--accent)] text-sm shadow-lg"
    >
      {message}
    </div>
  );
}

export function EmptyState({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="py-12 text-center text-[var(--text-mute)] text-sm">
      <p>{title}</p>
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function ErrorBanner({ message, testId }: { message: string; testId?: string }) {
  return (
    <div
      data-testid={testId}
      role="alert"
      className="px-3 py-2 rounded-[var(--radius)] border border-[var(--danger)] text-[var(--danger)] text-sm"
    >
      {message}
    </div>
  );
}

export function Skeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-2" aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-10 rounded-[var(--radius)] bg-[var(--surface-alt)] animate-pulse" />
      ))}
    </div>
  );
}
