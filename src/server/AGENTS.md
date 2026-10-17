# Server code: rules for working here

## Plain Node imports
`scripts/load-notes.ts` runs `ai/providers.ts`, `env.ts` and everything they import under plain Node, which strips the types and runs the rest. In those files and their imports: relative imports with the `.ts` extension, no `@/` alias outside `import type`, and only TypeScript that can be erased (no `enum`, no parameter properties).

## The AI SDK (version 7)
Versions: `ai` 7.0.143, `@ai-sdk/mistral` 4.0.66, and `@ai-sdk/react` 4.0.147, the release that depends on exactly that `ai`. Upgrade them together; `npm view @ai-sdk/react@<version> dependencies` shows which `ai` a release needs.

- **Version 7 names:** the system prompt goes in `instructions` (version 7 refuses system messages inside `messages`), `isStepCount` limits the model calls, `onEnd` replaces `onFinish`, and the standalone `toUIMessageStream({ stream: result.stream })` replaces `result.toUIMessageStreamResponse()`.
- **The chat model's interface** is the SDK's `LanguageModel`, specification v4 (`ai/chat-model.ts`). The type comes from `ai` itself, so the fake needs no extra package.
- **Failures** (`chat.ts`, `streamAnswer`):
  - A provider error, before the first word or partway, arrives as an error part: `streamText`'s `onError` logs it, and the stream carries on to its end.
  - A broken stream throws instead. `createUIMessageStream` catches it in `execute` and writes an error chunk; its `onError` logs it.
  - `toUIMessageStream`'s `onError` writes the text the browser sees, for stream errors and for tool errors. Only our own plain messages pass; anything else becomes one generic sentence.
- **Tool errors:** the model gets the thrown error's message, so a refused query (`SearchQueryError`) lets it try again. Any other search failure is logged and replaced by `SearchFailedError`, so neither the model nor the browser sees internals.
- **Token usage:** `onEnd` doesn't run when a stream breaks, and after a failed call it reports only that call. So `onStepEnd` collects each finished call's usage, and the `finally` in `execute` logs the sum once per answer.
- **Retries:** the SDK retries a retryable provider error twice by default (`maxRetries`). The fake's failures are not retryable, or the retry would hide them.

## Sources (read 2026-10-17)
- Migration guide, version 7: https://ai-sdk.dev/docs/migration-guides/migration-guide-7-0
- Chatbot and error handling: https://ai-sdk.dev/docs/ai-sdk-ui/chatbot, https://ai-sdk.dev/docs/ai-sdk-ui/error-handling
- Tools over several steps: https://ai-sdk.dev/cookbook/next/call-tools-multiple-steps
- The installed types, which settle the details: `node_modules/ai/dist/index.d.ts`
- Function duration (`maxDuration` on the chat route; Hobby allows 300 seconds): https://vercel.com/docs/functions/configuring-functions/duration
