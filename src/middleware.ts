import { NextResponse, type NextRequest } from "next/server";
import { isScraper } from "@/lib/bots";

/**
 * Turns away content scrapers (src/lib/bots.ts) with a few bytes instead of
 * a full page. robots.txt asks them to stay out; this is for the ones that
 * don't listen. robots.txt itself stays readable to everyone.
 */
export function middleware(req: NextRequest) {
  if (req.nextUrl.pathname !== "/robots.txt" && isScraper(req.headers.get("user-agent"))) {
    return new NextResponse("Crawling isn't allowed here. See /robots.txt.", { status: 403, headers: { "Cache-Control": "public, max-age=86400" } });
  }
  return NextResponse.next();
}

export const config = {
  // Pages only: not the build's static files, images or icons.
  matcher: ["/((?!_next/static|_next/image|favicon|icon|apple-icon).*)"],
};
