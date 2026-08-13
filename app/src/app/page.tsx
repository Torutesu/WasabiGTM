import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db";

/** Routes to the right starting point rather than rendering anything itself. */
export default async function Home() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const project = await db.project.findFirst({ orderBy: { createdAt: "desc" } });
  if (!project) redirect("/projects/new");
  redirect(`/projects/${project.slug}`);
}
