# Server code: rules for working here

## Plain Node imports
`scripts/load-notes.ts` runs `ai/providers.ts`, `env.ts` and everything they import under plain Node, which strips the types and runs the rest. In those files and their imports: relative imports with the `.ts` extension, no `@/` alias outside `import type`, and only TypeScript that can be erased (no `enum`, no parameter properties).

## The AI SDK (version 7)
Versions: `ai` 7.0.143, `@ai-sdk/openai-compatible` 3.0.71 and `@ai-sdk/react` 4.0.147, the releases that depend on exactly that `ai`'s `@ai-sdk/provider` (4.0.29) and `@ai-sdk/provider-utils` (5.0.62). Upgrade them together; `npm view <package>@<version> dependencies` shows what a release needs.

- **Version 7 names:** the system prompt goes in `instructions` (version 7 refuses system messages inside `messages`), `isStepCount` limits the model calls, `onEnd` replaces `onFinish`, and the standalone `toUIMessageStream({ stream: result.stream })` replaces `result.toUIMessageStreamResponse()`.
- **The chat model's interface** is the SDK's `LanguageModel`, specification v4 (`ai/chat-model.ts`). The type comes from `ai` itself, so the fake needs no extra package.
- **Failures** (`chat.ts`, `streamAnswer`):
  - A provider error, before the first word or partway, arrives as an error part: `streamText`'s `onError` logs it, and the stream carries on to its end.
  - A broken stream throws instead. `createUIMessageStream` catches it in `execute` and writes an error chunk; its `onError` logs it.
  - `toUIMessageStream`'s `onError` writes the text the browser sees, for stream errors and for tool errors. Only our own plain messages pass; anything else becomes one generic sentence.
  - An answer with no text and no error (a model that only reasoned, then stopped) gets an error chunk and a logged finish reason, so the visitor sees the error and "Try again" instead of nothing.
- **Tool errors:** the model gets the thrown error's message, so a refused query (`SearchQueryError`) lets it try again. Any other search failure is logged and replaced by `SearchFailedError`, so neither the model nor the browser sees internals.
- **Token usage:** `onEnd` doesn't run when a stream breaks, and after a failed call it reports only that call. So `onStepEnd` collects each finished call's usage, and the `finally` in `execute` logs the sum once per answer.
- **Retries:** the SDK retries a retryable provider error twice by default (`maxRetries`). The fake's failures are not retryable, or the retry would hide them.
- **Reasoning:** `gpt-oss-20b` streams its reasoning, and `toUIMessageStream` sends reasoning to the browser by default. `sendReasoning: false` keeps it on the server, so it never comes back with later messages either.

## The system prompt (`prompts/system-prompt.ts`)
- **Source:** a copy of the toolkit's PRD prompt with the traceability rules of its research prompt, both at the toolkit's commit cb7956e (links in the file). The file's header says what was kept, changed and added; `docs/plan.md` (slice 4) lists the rules it must hold.
- **Versions:** any change to the text, even a comma, gets the next `version` and its SHA-256 fingerprint in `FINGERPRINTS` (`tests/unit/system-prompt.test.ts`). The test fails until both are there; earlier fingerprints stay. A new version reaches production only after the quality check (slice 9) passes twice in a row on staging; until that check exists, the owner tries it on staging by hand.
- **Trying a change:** real models run only on staging, which is private. Cloudflare's page for gpt-oss-20b links no playground (checked 2026-10-17), and a playground couldn't run `searchNotes` anyway.
- **Plain text:** the chat shows the model's text as it is, so the prompt asks for no Markdown and uses plain labels itself, since a model copies the style it's given.
- **Searches:** the prompt asks for at most three searches a reply, and `MAX_STEPS` in `chat.ts` allows five model calls, so one search more than asked still leaves room for the reply. Change them together.
- **Tokens:** every model call sends the whole prompt, about 1,550 tokens at four characters a token (the short prompt before it: about 190), and an answer makes at least two calls. Keep it tight.

## Cloudflare Workers AI (`ai/cloudflare.ts`)
- **Endpoint:** `createOpenAICompatible` with `baseURL` `https://api.cloudflare.com/client/v4/accounts/<account ID>/ai/v1` and the token as `apiKey` (sent as `Authorization: Bearer`). Chat goes to `/chat/completions` (`chatModel`), embeddings to `/embeddings` (`embeddingModel`). Settings: `CLOUDFLARE_ACCOUNT_ID` (32 hexadecimal characters, checked in `env.ts`) and `CLOUDFLARE_API_TOKEN`.
- **Whole replies for chat:** streamed, Cloudflare sends gpt-oss's tool call as `reasoning_content` text (the bare JSON arguments, no tool name, no `tool_calls`) and ends with `finish_reason: "stop"`, so the search never runs (staging, 2026-10-17; raw stream in `docs/plan.md` history). Whole replies carry proper `tool_calls`, as the owner's first test showed. `createCloudflareChatModel` wraps the model in `simulateStreamingMiddleware` (https://ai-sdk.dev/docs/reference/ai-sdk-core/simulate-streaming-middleware), so `streamText` still works and each reply arrives in one piece. Cloudflare's own `workers-ai-provider` 4.0.0 also falls back to non-streaming for gpt-oss. Recheck before streaming again.
- **Text in every message:** Cloudflare's input schema requires each message's `content` to be a string or a list of text parts (`sync-input.json` of the model). The package sends `content: null` on an assistant message that only calls a tool, so the follow-up after a search got 400, code 5006 (staging, 2026-10-17). `withTextContent` in `transformRequestBody` sends `""` instead.
- **`includeUsage: true`** makes streamed replies report tokens; kept for when streaming returns.
- **No token count for embeddings:** on staging (2026-10-17) Cloudflare's `/embeddings` reply had no `usage`, and the AI SDK then reports `NaN` tokens. `cloudflare-embedder.ts` logs "Cloudflare reported no token count" instead.
- **Embedding batches:** Cloudflare's bge models take at most 100 texts a call; the package would send 2,048, so `cloudflare-embedder.ts` splits them.
- **512 input tokens:** the docs don't say whether a longer text is refused or cut. `ai/embedding-input.ts` bounds the tokens without a tokenizer (lowercase, remove accents, count non-space characters, add the two markers) and refuses any text over 512 before a call. The loader names every passage over the bound and loads nothing.
- **Pooling:** the OpenAI-compatible endpoint uses the model's default, `mean`. Cloudflare suggests `cls` for long inputs, but the two can't be mixed: switching means re-embedding every passage and changing the query side too.
- **Tests:** `CloudflareSettings.fetch` takes a recording fetch, so `tests/unit/cloudflare.test.ts` checks the requests with no network. Real calls happen only on staging.

## Sources (read 2026-10-17)
- Migration guide, version 7: https://ai-sdk.dev/docs/migration-guides/migration-guide-7-0
- Chatbot and error handling: https://ai-sdk.dev/docs/ai-sdk-ui/chatbot, https://ai-sdk.dev/docs/ai-sdk-ui/error-handling
- Tools over several steps: https://ai-sdk.dev/cookbook/next/call-tools-multiple-steps
- The installed types, which settle the details: `node_modules/ai/dist/index.d.ts`
- Function duration (`maxDuration` on the chat route; Hobby allows 300 seconds): https://vercel.com/docs/functions/configuring-functions/duration
- OpenAI-compatible providers: https://ai-sdk.dev/providers/openai-compatible-providers, and `node_modules/@ai-sdk/openai-compatible/dist/index.d.ts`
- Cloudflare's OpenAI-compatible endpoints: https://developers.cloudflare.com/workers-ai/configuration/open-ai-compatibility/
- Token and account ID: https://developers.cloudflare.com/workers-ai/get-started/rest-api/
- bge-large-en-v1.5 (512 input tokens, 1,024 dimensions, batches of 100, pooling): https://developers.cloudflare.com/workers-ai/models/bge-large-en-v1.5/ and its `sync-input.json`
- gpt-oss-20b (function calling, reasoning, 128,000-token context): https://developers.cloudflare.com/workers-ai/models/gpt-oss-20b/
