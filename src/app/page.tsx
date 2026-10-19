import type { Metadata } from "next";
import { Workspace } from "@/features/workspace/workspace";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: { absolute: site.name },
  description: site.description,
};

export default function HomePage() {
  return <Workspace />;
}
