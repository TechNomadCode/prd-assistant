// Site-wide facts in one place. Every page builds its metadata from these.

export const site = {
  name: "PRD Assistant",
  description:
    "Turns research notes into a product requirements document where every statement cites the passage it comes from, and the app's own code checks each citation.",
  links: {
    repository: "https://github.com/TechNomadCode/prd-assistant",
  },
  /**
   * The chat model as visitors see it under the message box: a name that
   * says what it is, linked to the page of the exact model in
   * `src/server/ai/models.ts`.
   */
  model: {
    name: "OpenAI open model",
    page: "https://developers.cloudflare.com/workers-ai/models/gpt-oss-120b/",
  },
} as const;

/**
 * The app's public address: SITE_URL when set, otherwise the production
 * domain Vercel gives the project, otherwise the local dev server.
 */
export function siteUrl(
  env: Record<string, string | undefined> = process.env,
): URL {
  if (env.SITE_URL) return new URL(env.SITE_URL);
  if (env.VERCEL_PROJECT_PRODUCTION_URL) {
    return new URL(`https://${env.VERCEL_PROJECT_PRODUCTION_URL}`);
  }
  return new URL("http://localhost:3000");
}
