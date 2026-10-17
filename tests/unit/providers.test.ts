import { describe, expect, it } from "vitest";
import { FAKE_CHAT_MODEL } from "@/server/ai/fake-chat-model";
import { CHAT_MODEL, EMBEDDING_MODEL } from "@/server/ai/models";
import { createChatModel, createEmbedder } from "@/server/ai/providers";
import { providerSettings, readChatEnv, readLoaderEnv } from "@/server/env";

const cloudflare = {
  provider: "cloudflare",
  cloudflareAccountId: "0123456789abcdef0123456789abcdef",
  cloudflareApiToken: "test",
};

describe("choosing the AI adapter", () => {
  it("uses the fake embedder for AI_PROVIDER=fake", () => {
    expect(createEmbedder({ provider: "fake" }).model).toBe(
      "fake-word-overlap",
    );
  });

  it("uses the pinned Cloudflare model for AI_PROVIDER=cloudflare, without calling it", () => {
    const embedder = createEmbedder(cloudflare);
    expect(embedder.model).toBe(EMBEDDING_MODEL);
    expect(embedder.dimensions).toBe(1024);
  });

  it.each([
    [{ cloudflareApiToken: undefined }, /CLOUDFLARE_API_TOKEN is empty/],
    [{ cloudflareAccountId: undefined }, /CLOUDFLARE_ACCOUNT_ID is empty/],
    [
      { cloudflareAccountId: undefined, cloudflareApiToken: undefined },
      /CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN are empty/,
    ],
  ])(
    "needs the account ID and the token for Cloudflare: %o",
    (gap, message) => {
      expect(() => createEmbedder({ ...cloudflare, ...gap })).toThrow(message);
      expect(() => createChatModel({ ...cloudflare, ...gap })).toThrow(message);
    },
  );

  it.each([["mistral"], ["openai"], ["Fake"], [undefined]])(
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
        AI_PROVIDER: "mistral",
      }),
    ).toThrow(/AI_PROVIDER/);
  });

  it("refuses an account ID that isn't one, such as a pasted token", () => {
    expect(() =>
      readChatEnv({
        AI_PROVIDER: "cloudflare",
        CLOUDFLARE_ACCOUNT_ID: "not-an-account-id",
        CLOUDFLARE_API_TOKEN: "test",
      }),
    ).toThrow(/CLOUDFLARE_ACCOUNT_ID/);
  });

  it("passes the checked settings on to the providers", () => {
    const env = readChatEnv({
      AI_PROVIDER: "cloudflare",
      CLOUDFLARE_ACCOUNT_ID: cloudflare.cloudflareAccountId,
      CLOUDFLARE_API_TOKEN: "test",
    });
    expect(providerSettings(env)).toEqual(cloudflare);
  });
});

describe("choosing the chat model", () => {
  it("uses the scripted fake for AI_PROVIDER=fake", () => {
    expect(createChatModel({ provider: "fake" }).modelId).toBe(FAKE_CHAT_MODEL);
  });

  it("uses the pinned Cloudflare model for AI_PROVIDER=cloudflare, without calling it", () => {
    const model = createChatModel(cloudflare);
    expect(model.provider).toMatch(/^cloudflare-workers-ai/);
    expect(model.modelId).toBe(CHAT_MODEL);
  });

  it.each([["mistral"], ["openai"], ["Fake"], [undefined]])(
    "rejects an unknown adapter name: %s",
    (provider) => {
      expect(() => createChatModel({ provider })).toThrow(
        /Unknown AI_PROVIDER/,
      );
    },
  );

  it("rejects an unknown adapter name in the chat's settings", () => {
    expect(() => readChatEnv({ AI_PROVIDER: "mistral" })).toThrow(
      /AI_PROVIDER/,
    );
  });
});
