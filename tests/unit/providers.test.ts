import { describe, expect, it } from "vitest";
import { FAKE_CHAT_MODEL } from "@/server/ai/fake-chat-model";
import { CHAT_MODEL, EMBEDDING_MODEL } from "@/server/ai/models";
import { createChatModel, createEmbedder } from "@/server/ai/providers";
import { REPLAY_CHAT_MODEL } from "@/server/ai/replay-chat-model";
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

  it("runs the chat on gpt-oss-120b (docs/decisions.md, 2026-10-18)", () => {
    expect(createChatModel(cloudflare).modelId).toBe("@cf/openai/gpt-oss-120b");
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

describe("the chat model on its own adapter", () => {
  const realChat = {
    ...cloudflare,
    provider: "fake",
    chatProvider: "cloudflare",
  };

  it("runs the chat on Cloudflare while the embedder stays fake", () => {
    expect(createChatModel(realChat).modelId).toBe(CHAT_MODEL);
    expect(createEmbedder(realChat).model).toBe("fake-word-overlap");
  });

  it("reads AI_CHAT_PROVIDER, and refuses a name it doesn't know", () => {
    const env = readChatEnv({
      AI_PROVIDER: "fake",
      AI_CHAT_PROVIDER: "cloudflare",
      CLOUDFLARE_ACCOUNT_ID: cloudflare.cloudflareAccountId,
      CLOUDFLARE_API_TOKEN: "test",
    });
    expect(providerSettings(env)).toEqual(realChat);
    expect(
      providerSettings(
        readChatEnv({ AI_PROVIDER: "fake", AI_CHAT_PROVIDER: "" }),
      ).chatProvider,
    ).toBeUndefined();
    expect(() =>
      readChatEnv({ AI_PROVIDER: "fake", AI_CHAT_PROVIDER: "mistral" }),
    ).toThrow(/AI_CHAT_PROVIDER/);
  });

  it.each([["mistral"], ["Fake"], [""]])(
    "rejects an unknown chat adapter name by its own variable: %s",
    (chatProvider) => {
      expect(() => createChatModel({ provider: "fake", chatProvider })).toThrow(
        `Unknown AI_CHAT_PROVIDER "${chatProvider}"`,
      );
    },
  );

  it("replays recorded answers as the chat model alone, at the speed asked", () => {
    expect(
      createChatModel({ provider: "fake", chatProvider: "replay" }).modelId,
    ).toBe(REPLAY_CHAT_MODEL);
    expect(() => createChatModel({ provider: "replay" })).toThrow(
      'Unknown AI_PROVIDER "replay"',
    );
    expect(() => createEmbedder({ provider: "replay" })).toThrow(
      /Unknown AI_PROVIDER/,
    );

    const env = readChatEnv({
      AI_PROVIDER: "fake",
      AI_CHAT_PROVIDER: "replay",
      REPLAY_SPEED: "100",
    });
    expect(providerSettings(env)).toMatchObject({
      chatProvider: "replay",
      replaySpeed: 100,
    });
    expect(() =>
      readChatEnv({ AI_PROVIDER: "fake", REPLAY_SPEED: "0.5" }),
    ).toThrow(/REPLAY_SPEED/);
  });

  it("needs the token for the real chat model", () => {
    expect(() =>
      createChatModel({ provider: "fake", chatProvider: "cloudflare" }),
    ).toThrow(/CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN are empty/);
  });
});
