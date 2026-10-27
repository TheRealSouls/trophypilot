import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isStaff } from "@/lib/roles";
import { PageHeader } from "@/components/ui";
import { GuideEditor } from "./GuideEditor";

export const metadata: Metadata = { title: "Write a guide" };

export default async function NewGuidePage({ searchParams }: { searchParams: Promise<{ game?: string }> }) {
  const user = await requireUser("/guides/new");
  const { game } = await searchParams;
  // Only the preselected game (from a game page's "Write a guide"); the picker searches the rest.
  const initialGame = game
    ? await prisma.game.findUnique({ where: { id: game }, select: { id: true, title: true, platforms: true, iconUrl: true } })
    : null;
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader kicker="Contribute" title="Write a trophy guide">
        Share your route to the platinum. Split it into roadmap stages, flag missables, and list collectibles. Your draft saves itself as you write.
      </PageHeader>
      <GuideEditor initialGame={initialGame} trusted={isStaff(user) || user.trusted} />
    </div>
  );
}
