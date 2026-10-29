import type { MetadataRoute } from "next";
import { SCRAPERS } from "@/lib/bots";

/**
 * Keeps crawlers to the pages worth finding in search. The catalogue has
 * hundreds of thousands of pages (every trophy, tracked PSN player and
 * per-game profile page, plus every filter and sort), and crawlers fetching
 * all of them used up the site's bandwidth. Search engines still get the home
 * page, games, guides, forums, clubs and profiles; AI scrapers get nothing.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: [...SCRAPERS], disallow: "/" },
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          // Filtered, sorted and paged copies of pages: endless and repetitive.
          "/*?",
          // Each trophy and DLC pack (over 200,000 pages); the game page lists them all.
          "/games/*/",
          "/trophies/",
          // Looked-up PSN players: every one costs PlayStation requests too.
          "/psn/",
          // A member's progress on each game.
          "/u/*/",
          "/forums/user/",
          "/compare",
          "/search",
          "/api/",
          "/messages",
          "/settings",
          "/staff",
          "/reports",
          "/login",
          "/register",
          "/verify-email",
        ],
        // Bing and others wait this many seconds between requests (Google ignores it).
        crawlDelay: 10,
      },
    ],
  };
}
