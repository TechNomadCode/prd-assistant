import type { Metadata } from "next";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: { absolute: site.name },
  description: site.description,
};

export default function HomePage() {
  return (
    <section aria-labelledby="home-title" className="max-w-2xl space-y-6">
      <h1
        id="home-title"
        className="text-4xl font-semibold tracking-tight sm:text-5xl"
      >
        {site.name}
      </h1>
      <p className="text-lg leading-relaxed text-muted-foreground">
        A researcher interviewed six households about a shared grocery list app.
        This app is being built to turn those transcripts into a product
        requirements document in which every statement quotes what someone
        actually said, and the app&apos;s own code checks each quote.
      </p>
      <p className="leading-relaxed text-muted-foreground">
        The drafting assistant isn&apos;t built yet. The transcripts are.
      </p>
      <Link
        href="/transcripts"
        className={buttonVariants({ variant: "outline", size: "large" })}
      >
        Read the transcripts
      </Link>
    </section>
  );
}
