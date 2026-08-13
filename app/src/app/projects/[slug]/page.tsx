import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { Card } from "@/components/ui";
import { JobControls } from "@/components/job-controls";
import { CardStatus } from "@wasabi/prisma/client";

/** SCR-003 — Activity + today's summary. */
export default async function DashboardPage({ params }: PageProps<"/projects/[slug]">) {
  const { slug } = await params;
  const project = await db.project.findUnique({ where: { slug } });
  if (!project) notFound();

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const [pending, publishedToday, seo, geo, jobs] = await Promise.all([
    db.feedCard.count({ where: { projectId: project.id, status: CardStatus.CURRENT } }),
    db.publishRecord.count({
      where: { projectId: project.id, publishedAt: { gte: startOfToday } },
    }),
    db.siteAudit.findFirst({
      where: { projectId: project.id, kind: "SEO" },
      orderBy: { createdAt: "desc" },
    }),
    db.siteAudit.findFirst({
      where: { projectId: project.id, kind: "GEO" },
      orderBy: { createdAt: "desc" },
    }),
    db.jobRun.findMany({
      where: { projectId: project.id },
      orderBy: { startedAt: "desc" },
      take: 20,
    }),
  ]);

  return (
    <div className="px-6 py-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-medium tracking-tight">{project.name}</h1>
          <p className="text-xs text-[var(--text-dim)]">
            {project.url} · {project.phase} · {project.languages.join(", ")}
          </p>
        </div>
        <JobControls slug={slug} />
      </div>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat
          label="Opportunities waiting"
          value={String(pending)}
          testId="stat-pending"
          href={`/projects/${slug}/feed`}
        />
        <Stat label="Published today" value={String(publishedToday)} testId="stat-published" />
        <Stat
          label="SEO"
          value={seo ? String(seo.score) : "—"}
          testId="stat-seo"
          href={`/projects/${slug}/site`}
        />
        <Stat
          label="GEO"
          value={geo ? String(geo.score) : "—"}
          testId="stat-geo"
          href={`/projects/${slug}/site`}
        />
      </section>

      <section className="space-y-2">
        <h2 className="text-xs uppercase tracking-wide text-[var(--text-dim)]">Activity</h2>
        <Card className="divide-y divide-[var(--border)]" testId="activity-log">
          {jobs.length === 0 ? (
            <p className="p-4 text-sm text-[var(--text-mute)]">
              No runs yet. The first cycle will run shortly — or start one now.
            </p>
          ) : (
            jobs.map((job) => (
              <div key={job.id} className="p-3 text-sm">
                <div className="flex items-center gap-3">
                  <span className="font-[family-name:var(--font-mono)] text-xs text-[var(--text-dim)]">
                    {job.startedAt.toISOString().slice(11, 16)}
                  </span>
                  <span className="font-medium">{job.kind}</span>
                  <span
                    data-testid={`job-status-${job.kind}`}
                    className={
                      job.status === "SUCCESS"
                        ? "text-[var(--ok)] text-xs"
                        : job.status === "FAILED"
                          ? "text-[var(--danger)] text-xs"
                          : "text-[var(--warn)] text-xs"
                    }
                  >
                    {job.status}
                  </span>
                </div>
                {job.log ? (
                  <pre className="mt-1 whitespace-pre-wrap font-[family-name:var(--font-mono)] text-[11px] text-[var(--text-mute)]">
                    {job.log}
                  </pre>
                ) : null}
                {job.error ? (
                  <p className="mt-1 text-xs text-[var(--danger)]">{job.error}</p>
                ) : null}
              </div>
            ))
          )}
        </Card>
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  testId,
  href,
}: {
  label: string;
  value: string;
  testId: string;
  href?: string;
}) {
  const inner = (
    <Card className="p-4" testId={testId}>
      <div className="text-2xl font-medium tabular-nums">{value}</div>
      <div className="mt-0.5 text-xs text-[var(--text-dim)]">{label}</div>
    </Card>
  );
  return href ? (
    <Link href={href} className="block hover:brightness-110 transition">
      {inner}
    </Link>
  ) : (
    inner
  );
}
