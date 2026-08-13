import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { ChatView } from "./chat-view";

/** SCR-011 — the CMO chat. */
export default async function ChatPage({ params }: PageProps<"/projects/[slug]/chat">) {
  const { slug } = await params;
  const project = await db.project.findUnique({ where: { slug } });
  if (!project) notFound();

  return <ChatView slug={slug} />;
}
