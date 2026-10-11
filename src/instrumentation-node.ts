import { installDnsCache } from "./lib/net";

/**
 * Server start-up, Node runtime only:
 * - caches DNS answers, so new connections to PSN skip a slow lookup;
 * - signs in to PSN straight away and keeps the sign-in fresh in the
 *   background, so visitors never wait for a token exchange;
 * - loads the first games list pages into the cache.
 */
if (process.env.NEXT_PHASE !== "phase-production-build") {
  installDnsCache();

  setTimeout(() => {
    import("./lib/games-list")
      .then((m) => m.warmGamesList())
      .catch((err) => console.error("[startup] games list warm-up failed", err));
  }, 5_000);

  if (process.env.PSN_NPSSO?.trim()) {
    setTimeout(() => {
      import("./lib/psn/real")
        .then((m) => {
          void m.keepPsnSignedIn();
          setInterval(() => void m.keepPsnSignedIn(), 5 * 60_000).unref();
        })
        .catch((err) => console.error("[startup] PSN sign-in warm-up failed", err));
    }, 2_000);
  }
}
