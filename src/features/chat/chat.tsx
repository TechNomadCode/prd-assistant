"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useState, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { MAX_MESSAGE_LENGTH, type ChatMessage } from "@/lib/chat";
import { Conversation } from "./conversation";

const transport = new DefaultChatTransport<ChatMessage>({ api: "/api/chat" });

/** The chat with the assistant: the conversation, the message box below it. */
export function Chat() {
  const { messages, sendMessage, regenerate, setMessages, status } =
    useChat<ChatMessage>({ transport });
  const [draft, setDraft] = useState("");

  const working = status === "submitted" || status === "streaming";
  const canSend = !working && draft.trim() !== "";

  function send() {
    if (!canSend) return;
    // An answer that broke off never reaches the model as if it were whole.
    if (status === "error" && messages.at(-1)?.role === "assistant") {
      setMessages(messages.slice(0, -1));
    }
    void sendMessage({ text: draft.trim() });
    setDraft("");
  }

  function sendOnEnter(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault();
      send();
    }
  }

  return (
    <section aria-labelledby="chat-title" className="space-y-6">
      <h2 id="chat-title" className="sr-only">
        Chat with the assistant
      </h2>

      <Conversation messages={messages} status={status} />

      {status === "error" && (
        <div
          role="alert"
          className="space-y-3 border-l-2 border-foreground py-1 pl-4"
        >
          <p>
            Something went wrong before the assistant could finish. Try again in
            a moment.
          </p>
          <Button variant="outline" onClick={() => void regenerate()}>
            Try again
          </Button>
        </div>
      )}

      <form
        onSubmit={(event) => {
          event.preventDefault();
          send();
        }}
        className="space-y-2"
      >
        <label htmlFor="chat-message" className="sr-only">
          Your message
        </label>
        <div className="flex items-end gap-3">
          <textarea
            id="chat-message"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={sendOnEnter}
            rows={3}
            maxLength={MAX_MESSAGE_LENGTH}
            aria-describedby="chat-notice"
            placeholder="Ask about the interviews, for example: who wants a notification for every new item?"
            className="min-h-24 w-full resize-y rounded-(--radius-control) border border-border-strong bg-background px-3 py-2 leading-relaxed text-foreground placeholder:text-muted-foreground"
          />
          <Button type="submit" disabled={!canSend}>
            Send
          </Button>
        </div>
        <p id="chat-notice" className="text-sm text-muted-foreground">
          This is a demo with fictional interviews. Don&apos;t enter personal
          information.
        </p>
      </form>

      <p role="status" className="sr-only">
        {working ? "The assistant is working on its answer." : ""}
      </p>
    </section>
  );
}
