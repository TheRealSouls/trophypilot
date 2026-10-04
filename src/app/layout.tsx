import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import Link from "next/link";
import { Nav } from "@/components/Nav";
import { SessionProvider, THEME_BOOT } from "@/components/session";
import { MobileNav } from "@/components/NavLinks";
import { isDemoMode } from "@/lib/psn/sync";
import { SITE } from "@/lib/site";
import "./globals.css";

const inter = Inter({
  subsets: ["latin", "latin-ext"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: { default: `${SITE.name}: ${SITE.tagline}`, template: `%s · ${SITE.name}` },
  description:
    "Track your PlayStation trophies, plan platinums with community guides, and see where you rank globally, in your country and among friends.",
  applicationName: SITE.name,
  openGraph: { siteName: SITE.name, type: "website" },
};

export const viewport: Viewport = { themeColor: "#ffffff", colorScheme: "light" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const year = new Date().getFullYear();
  // Light for everyone unless a member picked dark in Settings (never follows the device). The choice is
  // remembered in the browser and applied by THEME_BOOT before the page paints, so the layout stays cacheable.
  return (
    <html lang="en" className={inter.variable} data-theme="light" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
      </head>
      <body className="min-h-screen overflow-x-clip font-sans text-[15px] antialiased">
        <SessionProvider>
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 btn-primary">
          Skip to content
        </a>
        <Nav />
        <main id="main" className="mx-auto w-full max-w-7xl px-4 pb-24 pt-8 sm:px-6">
          {children}
        </main>
        <footer className="border-t border-line pb-24 pt-8 text-xs text-muted lg:pb-8">
          <div className="mx-auto grid max-w-7xl gap-6 px-4 sm:px-6 md:grid-cols-[1fr_auto]">
            <div className="space-y-2">
              <p>
                <span className="font-bold text-text">{SITE.name}</span> is an independent fan project for trophy hunters.
              </p>
              <p className="max-w-xl text-faint">
                Not affiliated with, endorsed or sponsored by Sony Interactive Entertainment. PlayStation, PSN and the
                PlayStation logos are trademarks of Sony Interactive Entertainment Inc.
              </p>
            </div>
            <nav aria-label="Footer" className="grid grid-cols-2 gap-x-8 sm:grid-cols-3 [&>a]:inline-flex [&>a]:min-h-7 [&>a]:items-center">
              <Link href="/games" className="hover:text-text">Games</Link>
              <Link href="/guides" className="hover:text-text">Guides</Link>
              <Link href="/forums" className="hover:text-text">Forums</Link>
              <Link href="/community" className="hover:text-text">Community</Link>
              <Link href="/clubs" className="hover:text-text">Clubs</Link>
              <Link href="/leaderboards" className="hover:text-text">Leaderboards</Link>
              <Link href="/sessions" className="hover:text-text">Sessions</Link>
              <Link href="/terms" className="hover:text-text">Terms of service</Link>
              <Link href="/privacy" className="hover:text-text">Privacy policy</Link>
              <Link href="/contact" className="hover:text-text">Contact</Link>
              <Link href="/accessibility" className="hover:text-text">Accessibility</Link>
            </nav>
          </div>
          <div className="mx-auto mt-6 max-w-7xl px-4 text-faint sm:px-6">
            © {year} {SITE.name}
            {isDemoMode() && (
              <span className="mt-1 block">
                Demo mode. No PSN_NPSSO is configured, so PSN linking and syncing use a simulated provider and a fictional
                game catalogue.
              </span>
            )}
          </div>
        </footer>
        <MobileNav />
        </SessionProvider>
      </body>
    </html>
  );
}
