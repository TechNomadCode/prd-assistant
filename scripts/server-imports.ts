// Lets plain Node run the server code the way Next.js and Vitest do, so the
// measurement (`npm run measure`) can import `chat.ts` without a new
// dependency. Node strips the types itself; these hooks add what the bundlers
// add: `@/` is `src/` (tsconfig.json's `paths`), an import without an
// extension inside `src/` finds its `.ts` file, and `server-only`, which
// throws outside a React server build, is its own empty module, as
// `vitest.config.ts` maps it. Node's synchronous module hooks:
// https://nodejs.org/docs/latest-v24.x/api/module.html#customization-hooks
// (`registerHooks`, read 2026-10-19 through Context7).

import { registerHooks } from "node:module";

const root = new URL("../", import.meta.url);
const src = new URL("src/", root).href;
const serverOnly = new URL("node_modules/server-only/empty.js", root).href;

/** Extensions an import inside `src/` may leave out, tried in order. */
const EXTENSIONS = [".ts", "/index.ts"];

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") {
      return { url: serverOnly, format: "module", shortCircuit: true };
    }
    const target = specifier.startsWith("@/")
      ? new URL(specifier.slice(2), src).href
      : specifier;
    try {
      return nextResolve(target, context);
    } catch (error) {
      const inSrc =
        context.parentURL?.startsWith(src) || target.startsWith(src);
      const relative = target.startsWith(".") || target.startsWith("file:");
      if (!inSrc || !relative || /\.[cm]?[jt]sx?$/.test(target)) throw error;
      for (const extension of EXTENSIONS) {
        try {
          return nextResolve(`${target}${extension}`, context);
        } catch {
          // The next extension, then the first error.
        }
      }
      throw error;
    }
  },
});
