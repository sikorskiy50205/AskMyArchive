"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { History, MessagesSquare, SendHorizontal, Square } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { EmptyState } from "@/components/empty-state";
import {
  AssistantMessage,
  UserMessage,
} from "@/components/chat/chat-message";
import { ConversationList } from "@/components/chat/conversation-list";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { askStream, chatApi, type Source } from "@/lib/chat-api";

// A question/answer pair produced in this session; history loaded from the
// server never overlaps with these (messages queries have staleTime: Infinity).
type Exchange = {
  question: string;
  answer: string;
  sources: Source[];
  pending: boolean;
};

export default function ChatPage() {
  const t = useTranslations("chat");
  const queryClient = useQueryClient();

  const [activeId, setActiveId] = useState<string | null>(null);
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const messagesQuery = useQuery({
    queryKey: ["messages", activeId],
    queryFn: () => chatApi.messages(activeId!),
    enabled: !!activeId,
    staleTime: Infinity,
  });

  function selectConversation(id: string | null) {
    if (streaming || id === activeId) return;
    // Local exchanges are dropped, so always refetch the full history:
    // the cache may hold the empty seed from when the conversation was created.
    if (id) queryClient.removeQueries({ queryKey: ["messages", id] });
    setActiveId(id);
    setExchanges([]);
    setHistoryOpen(false);
  }

  const updateLast = (patch: (e: Exchange) => Exchange) =>
    setExchanges((list) =>
      list.map((e, i) => (i === list.length - 1 ? patch(e) : e)),
    );

  async function send(overrideQuestion?: string) {
    const question = (overrideQuestion ?? input).trim();
    if (!question || streaming) return;

    if (!overrideQuestion) setInput("");
    setStreaming(true);
    setExchanges((list) => [
      ...list,
      { question, answer: "", sources: [], pending: true },
    ]);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      await askStream(
        question,
        activeId,
        {
          onMeta: (meta) => {
            // Chunks may repeat a file/page pair; show each source once.
            const unique = meta.sources.filter(
              (s, i, all) =>
                all.findIndex(
                  (x) => x.fileName === s.fileName && x.page === s.page,
                ) === i,
            );
            updateLast((e) => ({ ...e, sources: unique }));
            if (!activeId) {
              // Brand-new conversation: the exchange lives locally, so seed an
              // empty history to prevent a refetch from duplicating it.
              queryClient.setQueryData(["messages", meta.conversationId], []);
              setActiveId(meta.conversationId);
              queryClient.invalidateQueries({ queryKey: ["conversations"] });
            }
          },
          onToken: (text) =>
            updateLast((e) => ({ ...e, answer: e.answer + text })),
          onError: () => toast.error(t("askFailed")),
        },
        controller.signal,
      );
      updateLast((e) => ({ ...e, pending: false }));
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        // User stopped the stream — keep whatever tokens arrived so far.
        updateLast((e) => ({ ...e, pending: false }));
      } else {
        toast.error(t("askFailed"));
        // Drop the failed exchange and give the question back for a retry.
        setExchanges((list) => list.slice(0, -1));
        setInput(question);
      }
    } finally {
      abortRef.current = null;
      setStreaming(false);
    }
  }

  function stop() {
    abortRef.current?.abort();
  }

  async function regenerate() {
    if (streaming || !activeId) return;

    // Prefer the last local exchange; fall back to the tail of persisted history.
    let question: string | undefined;
    if (exchanges.length > 0) {
      question = exchanges[exchanges.length - 1].question;
      setExchanges((list) => list.slice(0, -1));
    } else {
      const history = messagesQuery.data ?? [];
      const lastUser = [...history].reverse().find((m) => m.role === "user");
      question = lastUser?.content;
      // Drop the tail user+assistant pair; the fresh answer will land in exchanges.
      queryClient.setQueryData(["messages", activeId], history.slice(0, -2));
    }
    if (!question) return;

    try {
      await chatApi.deleteLastExchange(activeId);
    } catch {
      toast.error(t("regenerateFailed"));
      queryClient.invalidateQueries({ queryKey: ["messages", activeId] });
      return;
    }
    await send(question);
  }

  const history = messagesQuery.data ?? [];
  const isEmpty = !activeId && exchanges.length === 0;
  // Regenerate only lives on the very last assistant message and only when idle.
  const canRegenerateLastExchange =
    !streaming && exchanges.length > 0 && !exchanges[exchanges.length - 1].pending;
  const canRegenerateLastHistory =
    !streaming &&
    exchanges.length === 0 &&
    !!activeId &&
    history.length >= 2 &&
    history[history.length - 1].role === "assistant";

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [history.length, exchanges]);

  return (
    <div className="flex min-h-0 flex-1 gap-4">
      <aside className="hidden w-64 shrink-0 rounded-lg border md:block">
        <ConversationList activeId={activeId} onSelect={selectConversation} />
      </aside>

      <section className="flex min-w-0 flex-1 flex-col rounded-lg border">
        <div className="flex items-center border-b p-2 md:hidden">
          <Sheet open={historyOpen} onOpenChange={setHistoryOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="sm">
                <History className="size-4" />
                {t("history")}
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-0">
              <SheetHeader className="border-b p-4">
                <SheetTitle>{t("history")}</SheetTitle>
              </SheetHeader>
              <ConversationList
                activeId={activeId}
                onSelect={selectConversation}
              />
            </SheetContent>
          </Sheet>
        </div>

        <div
          ref={scrollRef}
          className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4"
        >
          {isEmpty ? (
            <EmptyState
              icon={MessagesSquare}
              title={t("emptyTitle")}
              description={t("emptyDescription")}
            />
          ) : (
            <>
              {history.map((message, index) => {
                const isLast = index === history.length - 1;
                if (message.role === "user")
                  return <UserMessage key={message.id} content={message.content} />;
                return (
                  <AssistantMessage
                    key={message.id}
                    content={message.content}
                    onRegenerate={
                      isLast && canRegenerateLastHistory ? regenerate : undefined
                    }
                  />
                );
              })}
              {exchanges.map((exchange, index) => {
                const isLast = index === exchanges.length - 1;
                return (
                  <div key={index} className="contents">
                    <UserMessage content={exchange.question} />
                    <AssistantMessage
                      content={exchange.answer}
                      sources={exchange.sources}
                      pending={exchange.pending}
                      onRegenerate={
                        isLast && canRegenerateLastExchange ? regenerate : undefined
                      }
                    />
                  </div>
                );
              })}
            </>
          )}
        </div>

        <form
          className="flex items-end gap-2 border-t p-3"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            placeholder={t("inputPlaceholder")}
            rows={1}
            className="max-h-40 min-h-10 flex-1 resize-none"
            disabled={streaming}
          />
          {streaming ? (
            <Button
              type="button"
              size="icon"
              variant="secondary"
              onClick={stop}
            >
              <Square className="size-4 fill-current" />
              <span className="sr-only">{t("stop")}</span>
            </Button>
          ) : (
            <Button type="submit" size="icon" disabled={!input.trim()}>
              <SendHorizontal className="size-4" />
              <span className="sr-only">{t("send")}</span>
            </Button>
          )}
        </form>
      </section>
    </div>
  );
}
