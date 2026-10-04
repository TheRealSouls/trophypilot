export const dynamic = "force-dynamic";

/**
 * Keep-awake ping for an uptime service (cron-job.org, UptimeRobot) every
 * 10 minutes. Render's free plan puts the site to sleep after 15 minutes
 * without visitors, and waking it takes about 40 seconds; regular pings
 * stop that. It doesn't touch the database, so Neon can still sleep.
 */
export function GET() {
  return new Response("ok", { headers: { "Cache-Control": "no-store", "Content-Type": "text/plain" } });
}
