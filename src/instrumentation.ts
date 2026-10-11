/**
 * Runs once when the server starts (Node only; see instrumentation-node.ts).
 * Kept to Next's documented pattern so Node-only modules stay out of the
 * edge build.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./instrumentation-node");
  }
}
