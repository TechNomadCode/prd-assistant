import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { site, siteUrl } from "@/lib/site";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: siteUrl(),
  title: { default: site.name, template: `%s · ${site.name}` },
  description: site.description,
  applicationName: site.name,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="group/body flex min-h-full flex-col lg:has-[[data-workspace]]:h-dvh">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:top-1 focus:left-3 focus:bg-foreground focus:px-3 focus:py-1.5 focus:text-background"
        >
          Skip to content
        </a>
        <header className="border-b border-border">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-6 px-4 py-2.5 group-has-[[data-workspace]]/body:max-w-workspace sm:px-6">
            <Link href="/" className="text-base font-semibold tracking-tight">
              {site.name}
            </Link>
            <nav aria-label="Main">
              <Link
                href="/transcripts"
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                Transcripts
              </Link>
            </nav>
          </div>
        </header>
        <main
          id="main"
          className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 has-[[data-workspace]]:max-w-workspace sm:px-6 lg:has-[[data-workspace]]:min-h-0 lg:has-[[data-workspace]]:py-4"
        >
          {children}
        </main>
        <footer className="border-t border-border">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-4 py-6 text-sm text-muted-foreground group-has-[[data-workspace]]/body:max-w-workspace sm:px-6 lg:group-has-[[data-workspace]]/body:py-2">
            <p>A portfolio demo. The interviews are fictional.</p>
            {/* For engineers: the README's explanation, then the code. */}
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              <a
                href={`${site.links.repository}#how-it-works`}
                className="underline underline-offset-4 hover:text-foreground"
              >
                How the search and the check work
              </a>
              <a
                href={site.links.repository}
                className="underline underline-offset-4 hover:text-foreground"
              >
                Source code on GitHub
              </a>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
