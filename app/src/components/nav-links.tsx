"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "", label: "Activity", testId: "nav-activity" },
  { href: "/feed", label: "Feed", testId: "nav-feed" },
  { href: "/chat", label: "Chat", testId: "nav-chat" },
  { href: "/docs", label: "Context", testId: "nav-docs" },
  { href: "/site", label: "Site health", testId: "nav-site" },
  { href: "/performance", label: "Performance", testId: "nav-performance" },
  { href: "/integrations", label: "Integrations", testId: "nav-integrations" },
  { href: "/settings", label: "Settings", testId: "nav-settings" },
];

export function NavLinks({ slug }: { slug: string }) {
  const pathname = usePathname();
  const base = `/projects/${slug}`;

  return (
    <ul className="space-y-0.5">
      {ITEMS.map((item) => {
        const href = `${base}${item.href}`;
        const active = item.href === "" ? pathname === base : pathname.startsWith(href);
        return (
          <li key={item.href}>
            <Link
              href={href}
              data-testid={item.testId}
              className={`block px-2.5 py-1.5 rounded-[var(--radius)] text-sm transition-colors ${
                active
                  ? "bg-[var(--surface-alt)] text-[var(--text)]"
                  : "text-[var(--text-mute)] hover:text-[var(--text)]"
              }`}
            >
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
