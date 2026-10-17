import type { Metadata } from "next";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Chat } from "@/features/chat/chat";
import { site } from "@/lib/site";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: { absolute: site.name },
  description: site.description,
};

export default function HomePage() {
  return (
    <div className="max-w-3xl space-y-10">
      <section aria-labelledby="home-title" className="space-y-4">
        <h1
          id="home-title"
          className="text-4xl font-semibold tracking-tight sm:text-5xl"
        >
          {site.name}
        </h1>
        <p className="text-lg leading-relaxed text-muted-foreground">
          A researcher interviewed six households about a shared grocery list
          app. This app is being built to turn those transcripts into a product
          requirements document in which every statement quotes what someone
          actually said, and the app&apos;s own code checks each quote.
        </p>
        <p className="leading-relaxed text-muted-foreground">
          For now, ask the assistant about the interviews. It searches them
          before it answers, and each search shows as a line that opens to the
          passages it found. Drafting the document comes next.
        </p>
        <Link
          href="/transcripts"
          className={cn(buttonVariants({ variant: "quiet" }), "h-auto px-0")}
        >
          Read the transcripts
        </Link>
      </section>
      <Chat />
    </div>
  );
}
