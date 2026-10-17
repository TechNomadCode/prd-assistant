import { describe, expect, it } from "vitest";
import { EMBEDDING_MODEL } from "@/server/ai/models";
import { createEmbedder } from "@/server/ai/providers";
import { readLoaderEnv } from "@/server/env";

describe("choosing the AI adapter", () => {
  it("uses the fake embedder for AI_PROVIDER=fake", () => {
    expect(createEmbedder({ provider: "fake" }).model).toBe(
      "fake-word-overlap",
    );
  });

  it("uses the pinned Mistral model for AI_PROVIDER=mistral, without calling it", () => {
    const embedder = createEmbedder({
      provider: "mistral",
      mistralApiKey: "test",
    });
    expect(embedder.model).toBe(EMBEDDING_MODEL);
    expect(embedder.dimensions).toBe(1024);
  });

  it("needs a key for Mistral", () => {
    expect(() => createEmbedder({ provider: "mistral" })).toThrow(
      /MISTRAL_API_KEY/,
    );
  });

  it.each([["openai"], ["Fake"], [undefined]])(
    "rejects an unknown adapter name: %s",
    (provider) => {
      expect(() => createEmbedder({ provider })).toThrow(/Unknown AI_PROVIDER/);
    },
  );

  it("rejects an unknown adapter name in the loader's settings", () => {
    expect(() =>
      readLoaderEnv({
        SUPABASE_URL: "http://127.0.0.1:57321",
        SUPABASE_SECRET_KEY: "local",
        AI_PROVIDER: "openai",
      }),
    ).toThrow(/AI_PROVIDER/);
  });
});
