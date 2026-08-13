import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { brand } from "@/brand.config";
import { ProjectSwitcher } from "@/components/project-switcher";
import { NavLinks } from "@/components/nav-links";

/** SCR-003 shell — nav, project switcher, user menu. */
export default async function ProjectLayout({
  children,
  params,
}: LayoutProps<"/projects/[slug]">) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const { slug } = await params;
  const [project, projects] = await Promise.all([
    db.project.findUnique({ where: { slug } }),
    db.project.findMany({ orderBy: { createdAt: "desc" }, select: { slug: true, name: true } }),
  ]);
  if (!project) notFound();

  return (
    <div className="flex-1 flex flex-col">
      <header className="border-b border-[var(--border)] px-4 h-14 flex items-center gap-4 shrink-0">
        <Link href="/" className="text-sm font-medium tracking-tight">
          {brand.name}
        </Link>
        <ProjectSwitcher current={project.slug} projects={projects} />
        <div className="ml-auto flex items-center gap-3 text-xs text-[var(--text-dim)]">
          <span data-testid="user-email">{user.email}</span>
          <a href="/api/auth/signout" data-testid="signout" className="hover:text-[var(--text)]">
            Sign out
          </a>
        </div>
      </header>

      <div className="flex-1 flex min-h-0">
        <nav className="w-44 shrink-0 border-r border-[var(--border)] p-3">
          <NavLinks slug={project.slug} />
        </nav>
        <main className="flex-1 min-w-0 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
