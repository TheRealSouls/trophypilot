/**
 * Runs once when the server starts. Loads the first games list pages into the
 * cache a little after start-up, so the first visitor after a deploy or a
 * restart doesn't wait for them.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NEXT_PHASE === "phase-production-build") return;
  setTimeout(() => {
    import("./lib/games-list")
      .then((m) => m.warmGamesList())
      .catch((err) => console.error("[startup] games list warm-up failed", err));
  }, 5_000);
}
