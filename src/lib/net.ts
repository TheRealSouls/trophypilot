import dns from "dns";

/**
 * Remembers DNS answers for a few minutes. Every new connection to PSN
 * otherwise starts with a lookup, and on a slow resolver that was most of a
 * request's time (about 1.7 s of 1.9 s in testing). Installed once at
 * start-up (instrumentation.ts); fetch and everything else that resolves
 * names through dns.lookup benefits.
 */
const TTL_MS = 5 * 60_000;

type Entry = { at: number; args: unknown[] };

export function installDnsCache() {
  const g = globalThis as unknown as { __tpDns?: boolean };
  if (g.__tpDns) return;
  g.__tpDns = true;

  const original = dns.lookup;
  const cache = new Map<string, Entry>();
  const inflight = new Map<string, ((err: unknown, ...rest: unknown[]) => void)[]>();

  const patched = function lookup(hostname: string, options: unknown, callback?: unknown) {
    const cb = (typeof options === "function" ? options : callback) as (err: unknown, ...rest: unknown[]) => void;
    const opts = typeof options === "function" || options == null ? {} : options;
    const key = `${hostname}|${JSON.stringify(opts)}`;
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < TTL_MS) {
      process.nextTick(() => cb(null, ...hit.args));
      return;
    }
    // Several connections opening at once share one lookup.
    const waiting = inflight.get(key);
    if (waiting) {
      waiting.push(cb);
      return;
    }
    inflight.set(key, [cb]);
    original(hostname, opts as dns.LookupOptions, (err: unknown, ...rest: unknown[]) => {
      if (!err) cache.set(key, { at: Date.now(), args: rest });
      const cbs = inflight.get(key) ?? [];
      inflight.delete(key);
      for (const c of cbs) c(err, ...rest);
    });
  };
  (dns as unknown as { lookup: unknown }).lookup = patched;
}
