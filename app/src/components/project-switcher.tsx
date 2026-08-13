"use client";

import { useRouter } from "next/navigation";

export function ProjectSwitcher({
  current,
  projects,
}: {
  current: string;
  projects: Array<{ slug: string; name: string }>;
}) {
  const router = useRouter();

  return (
    <select
      data-testid="project-switcher"
      value={current}
      onChange={(e) => {
        if (e.target.value === "__new__") router.push("/projects/new");
        else router.push(`/projects/${e.target.value}`);
      }}
      className="text-sm py-1"
      aria-label="Switch project"
    >
      {projects.map((project) => (
        <option key={project.slug} value={project.slug}>
          {project.name}
        </option>
      ))}
      <option value="__new__">+ New project…</option>
    </select>
  );
}
