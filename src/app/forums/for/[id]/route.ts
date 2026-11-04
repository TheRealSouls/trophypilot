import { prisma } from "@/lib/db";
import { ensureGameSection } from "@/lib/game-forum";

export const dynamic = "force-dynamic";

/** A same-site redirect by path, so it works on any host (the site, a preview, localhost). */
const go = (path: string) => new Response(null, { status: 307, headers: { Location: path } });

/** /forums/for/<game id>: opens the game's own forum, making it the first time someone asks. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const game = await prisma.game.findUnique({ where: { id }, select: { id: true, title: true, titleKey: true } });
  if (!game) return go("/forums");
  const section = await ensureGameSection(game);
  return go(`/forums/${encodeURIComponent(section.slug)}`);
}
