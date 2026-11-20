"use client";

import { useEffect, useRef, useState } from "react";
import { CheckIcon } from "./icons";

const COLOURS = ["#dc332a", "#f5b82e", "#3d6590", "#2c7239", "#ffffff", "#e09a6c"];

/**
 * A burst of confetti over the page and a small "Email confirmed" card for two
 * seconds, after the verification link. Drawn on one canvas, no library. People
 * who ask for less motion get the card without the confetti. The `?verified=1`
 * comes off the address so a refresh doesn't play it again.
 */
export function Celebration({ title, body }: { title: string; body: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.has("verified")) {
      url.searchParams.delete("verified");
      window.history.replaceState(window.history.state, "", url);
    }
    const close = setTimeout(() => setOpen(false), 2000);
    return () => clearTimeout(close);
  }, []);

  useEffect(() => {
    const c = canvas.current;
    if (!c || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      c.width = window.innerWidth * dpr;
      c.height = window.innerHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const w = () => window.innerWidth;
    const h = () => window.innerHeight;
    // Two bursts from the bottom corners, aimed up and inwards.
    const pieces = Array.from({ length: 160 }, (_, i) => {
      const left = i % 2 === 0;
      const angle = (left ? -60 : -120) * (Math.PI / 180) + (Math.random() - 0.5) * 0.9;
      const speed = 9 + Math.random() * 9;
      return {
        x: left ? w() * 0.05 : w() * 0.95,
        y: h() + 10,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: 6 + Math.random() * 6,
        spin: Math.random() * Math.PI,
        vspin: (Math.random() - 0.5) * 0.3,
        colour: COLOURS[i % COLOURS.length],
        round: Math.random() < 0.3,
      };
    });

    const start = performance.now();
    let frame = 0;
    const draw = (t: number) => {
      const elapsed = t - start;
      ctx.clearRect(0, 0, w(), h());
      ctx.globalAlpha = elapsed > 2600 ? Math.max(0, 1 - (elapsed - 2600) / 900) : 1;
      for (const p of pieces) {
        p.vy += 0.28;
        p.vx *= 0.985;
        p.vy *= 0.985;
        p.x += p.vx;
        p.y += p.vy;
        p.spin += p.vspin;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.spin);
        ctx.fillStyle = p.colour;
        if (p.round) {
          ctx.beginPath();
          ctx.arc(0, 0, p.size / 2.4, 0, Math.PI * 2);
          ctx.fill();
        } else {
          // Flat strips that flutter as they turn.
          ctx.fillRect(-p.size / 2, -p.size / 4, p.size, (p.size / 2) * Math.abs(Math.cos(p.spin * 2)) + 1);
        }
        ctx.restore();
      }
      if (elapsed < 3500) frame = requestAnimationFrame(draw);
      else ctx.clearRect(0, 0, w(), h());
    };
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <>
      <canvas ref={canvas} aria-hidden className="pointer-events-none fixed inset-0 z-[70] h-full w-full" />
      {open && (
        <div className="pointer-events-none fixed inset-0 z-[60] flex items-center justify-center bg-text/20 p-4">
          <div role="status" aria-live="polite" className="celebrate-pop pointer-events-auto w-full max-w-xs rounded-2xl border border-line bg-surface p-6 text-center shadow-[var(--shadow-raised)]">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-accent text-white">
              <CheckIcon size={26} />
            </span>
            <h2 className="mt-3 text-lg font-bold">{title}</h2>
            <p className="mt-1 text-sm text-muted">{body}</p>
          </div>
        </div>
      )}
    </>
  );
}
