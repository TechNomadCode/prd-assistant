import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The footer's link for engineers points at the README's "How it works"
// heading (src/app/layout.tsx), which GitHub anchors as #how-it-works.

describe("the README", () => {
  it("keeps the How it works heading the footer's link for engineers lands on", () => {
    const readme = readFileSync(join(process.cwd(), "README.md"), "utf8");

    expect(readme).toMatch(/^## How it works$/m);
  });
});
