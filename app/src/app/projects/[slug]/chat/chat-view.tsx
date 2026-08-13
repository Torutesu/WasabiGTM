"use client";

import { useEffect, useRef, useState } from "react";
import { Badge, Button, Card, Spinner, Toast } from "@/components/ui";

type Message = {
  id: string;
  role: string;
  content: string;
  contextRefs: Record<string, unknown> | null;
};

type Suggestion = {
  channel: string;
  type: string;
  language: string;
  content: string;
} | null;

const MENTIONS = ["strategy", "product", "info", "competitors", "voice"];

export function ChatView({ slug }: { slug: string }) {
  const [threadId, setThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [suggestions, setSuggestions] = useState<Record<string, Suggestion>>({});
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [showMentions, setShowMentions] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  function flash(message: string) {
    setToast(message);
    setTimeout(() => setToast(null), 4000);
  }

  async function send() {
    const content = input.trim();
    if (!content || busy) return;
    setBusy(true);
    setInput("");

    const optimistic: Message = {
      id: `local-${Date.now()}`,
      role: "user",
      content,
      contextRefs: null,
    };
    setMessages((prev) => [...prev, optimistic]);

    try {
      const response = await fetch(`/api/projects/${slug}/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ threadId, content }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        thread?: { id: string };
        message?: Message;
        suggestion?: Suggestion;
        error?: string;
      };

      if (!response.ok || !data.message) {
        setMessages((prev) => [
          ...prev,
          {
            id: `error-${Date.now()}`,
            role: "assistant",
            content: data.error ?? "Failed. Try again.",
            contextRefs: null,
          },
        ]);
        setInput(content);
        return;
      }

      if (data.thread) setThreadId(data.thread.id);
      setMessages((prev) => [...prev, data.message!]);
      if (data.suggestion) {
        setSuggestions((prev) => ({ ...prev, [data.message!.id]: data.suggestion! }));
      }
    } finally {
      setBusy(false);
    }
  }

  async function addToFeed(messageId: string) {
    const suggestion = suggestions[messageId];
    if (!suggestion) return;
    const response = await fetch(`/api/projects/${slug}/cards`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(suggestion),
    });
    if (response.ok) {
      flash("Added to feed");
      setSuggestions((prev) => {
        const next = { ...prev };
        delete next[messageId];
        return next;
      });
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-auto px-6 py-6 space-y-3">
        {messages.length === 0 ? (
          <Card className="p-4 text-sm text-[var(--text-mute)]">
            <p>
              Ask about strategy, or ask for a draft. Mention a document with{" "}
              <code className="text-[var(--accent)]">@strategy</code>,{" "}
              <code className="text-[var(--accent)]">@voice</code>, and so on to pin it into the
              answer&apos;s context.
            </p>
          </Card>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              data-testid={`chat-message-${message.role}`}
              className={message.role === "user" ? "flex justify-end" : ""}
            >
              <Card
                className={`p-3 max-w-2xl ${
                  message.role === "user" ? "bg-[var(--surface-alt)]" : ""
                }`}
              >
                <pre className="whitespace-pre-wrap text-sm font-[family-name:var(--font-sans)]">
                  {message.content}
                </pre>

                {message.role === "assistant" && message.contextRefs ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {((message.contextRefs.docs as string[]) ?? []).map((doc) => (
                      <Badge key={doc} testId={`context-chip-${doc}`} tone="accent">
                        {doc}
                      </Badge>
                    ))}
                  </div>
                ) : null}

                {suggestions[message.id] ? (
                  <div className="mt-3">
                    <Button
                      testId="chat-add-to-feed"
                      variant="primary"
                      onClick={() => addToFeed(message.id)}
                    >
                      Add to feed
                    </Button>
                  </div>
                ) : null}
              </Card>
            </div>
          ))
        )}
        {busy ? <Spinner label="thinking" /> : null}
        <div ref={endRef} />
      </div>

      <div className="border-t border-[var(--border)] p-4 space-y-2">
        {showMentions ? (
          <div className="flex flex-wrap gap-2">
            {MENTIONS.map((mention) => (
              <Button
                key={mention}
                testId={`mention-${mention}`}
                onClick={() => {
                  setInput((prev) => `${prev}@${mention} `);
                  setShowMentions(false);
                }}
              >
                @{mention}
              </Button>
            ))}
          </div>
        ) : null}
        <div className="flex gap-2">
          <Button testId="chat-mention" onClick={() => setShowMentions(!showMentions)}>
            @
          </Button>
          <input
            data-testid="chat-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            placeholder="Ask me anything…"
            className="flex-1"
          />
          <Button testId="chat-send" variant="primary" onClick={send} disabled={busy}>
            Send
          </Button>
        </div>
      </div>

      <Toast message={toast} testId="chat-toast" />
    </div>
  );
}
