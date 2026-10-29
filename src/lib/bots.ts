/**
 * Crawlers that only scrape content (mostly for AI training) and bring no
 * visitors. They're told to stay out in robots.txt, and the ones that tend to
 * ignore it are turned away in middleware with a tiny response, which keeps
 * the site's bandwidth (paid per GB on Render) for people.
 */
export const SCRAPERS = [
  "GPTBot",
  "ChatGPT-User",
  "OAI-SearchBot",
  "CCBot",
  "ClaudeBot",
  "Claude-Web",
  "anthropic-ai",
  "Bytespider",
  "PerplexityBot",
  "Google-Extended",
  "Applebot-Extended",
  "Amazonbot",
  "meta-externalagent",
  "meta-externalfetcher",
  "FacebookBot",
  "Diffbot",
  "ImagesiftBot",
  "Omgilibot",
  "Omgili",
  "cohere-ai",
  "YouBot",
  "Timpibot",
  "DataForSeoBot",
  "AhrefsBot",
  "SemrushBot",
  "MJ12bot",
  "DotBot",
  "PetalBot",
  "BLEXBot",
  "Barkrowler",
  "SeekportBot",
  "serpstatbot",
] as const;

const SCRAPER_RE = new RegExp(SCRAPERS.map((b) => b.replace(/[-.]/g, "\\$&")).join("|"), "i");

export const isScraper = (userAgent: string | null) => !!userAgent && SCRAPER_RE.test(userAgent);
