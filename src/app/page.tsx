import type { Metadata } from "next";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Workspace } from "@/features/workspace/workspace";
import { site } from "@/lib/site";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: { absolute: site.name },
  description: site.description,
};

export default function HomePage() {
  return (
    <Workspace
      welcome={
        <section aria-labelledby="home-title" className="space-y-3">
          <h1
            id="home-title"
            className="text-2xl font-semibold tracking-tight sm:text-3xl"
          >
            {site.name}
          </h1>
          <p className="leading-relaxed text-muted-foreground">
            A researcher interviewed six households about a shared grocery list
            app. Ask the assistant to draft the first section of a product
            requirements document from those interviews, or ask about them. It
            searches before it writes, and the PRD grows beside the chat.
          </p>
          <Link
            href="/transcripts"
            className={cn(buttonVariants({ variant: "quiet" }), "h-auto px-0")}
          >
            Read the transcripts
          </Link>
        </section>
      }
    />
  );
}
