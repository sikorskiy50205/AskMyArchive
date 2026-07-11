"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { chatApi, type Conversation } from "@/lib/chat-api";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export function ConversationList({
  activeId,
  onSelect,
}: {
  activeId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const t = useTranslations("chat");
  const locale = useLocale();
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);

  const { data: conversations, isPending } = useQuery({
    queryKey: ["conversations"],
    queryFn: chatApi.conversations,
  });

  const del = useMutation({
    mutationFn: chatApi.deleteConversation,
    onSuccess: (_, id) => {
      toast.success(t("deleteSuccess"));
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      queryClient.removeQueries({ queryKey: ["messages", id] });
      if (id === activeId) onSelect(null);
    },
    onError: () => toast.error(t("deleteFailed")),
  });

  const rename = useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) =>
      chatApi.renameConversation(id, title),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      setEditingId(null);
    },
    onError: () => toast.error(t("renameFailed")),
  });

  return (
    <div className="flex h-full flex-col">
      <div className="p-3">
        <Button
          variant="outline"
          className="w-full justify-start"
          onClick={() => onSelect(null)}
        >
          <Plus className="size-4" />
          {t("newConversation")}
        </Button>
      </div>
      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 pb-3">
        {isPending ? (
          <>
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
          </>
        ) : conversations?.length === 0 ? (
          <p className="px-2 py-4 text-sm text-muted-foreground">
            {t("noConversations")}
          </p>
        ) : (
          conversations?.map((conversation) => (
            <ConversationRow
              key={conversation.id}
              conversation={conversation}
              active={conversation.id === activeId}
              editing={editingId === conversation.id}
              locale={locale}
              onSelect={() => onSelect(conversation.id)}
              onStartEdit={() => setEditingId(conversation.id)}
              onCancelEdit={() => setEditingId(null)}
              onSaveEdit={(title) => rename.mutate({ id: conversation.id, title })}
              onDelete={() => del.mutate(conversation.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}

function ConversationRow({
  conversation,
  active,
  editing,
  locale,
  onSelect,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onDelete,
}: {
  conversation: Conversation;
  active: boolean;
  editing: boolean;
  locale: string;
  onSelect: () => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: (title: string) => void;
  onDelete: () => void;
}) {
  const t = useTranslations("chat");
  const inputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState(conversation.title);

  useEffect(() => {
    if (editing) {
      setDraft(conversation.title);
      // Focus + select-all so users can just type over the auto-generated title.
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    }
  }, [editing, conversation.title]);

  function commit() {
    const value = draft.trim();
    if (value && value !== conversation.title) onSaveEdit(value);
    else onCancelEdit();
  }

  if (editing) {
    return (
      <div className="rounded-md bg-accent px-2 py-1.5">
        <Input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            else if (e.key === "Escape") onCancelEdit();
          }}
          className="h-7"
          maxLength={200}
        />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "group flex items-center rounded-md",
        active ? "bg-accent" : "hover:bg-accent/50",
      )}
    >
      <button
        type="button"
        className="min-w-0 flex-1 cursor-pointer px-2 py-2 text-left"
        onClick={onSelect}
      >
        <span className="block truncate text-sm">{conversation.title}</span>
        <span className="text-xs text-muted-foreground">
          {formatDateTime(conversation.createdAt, locale)}
        </span>
      </button>
      <Button
        variant="ghost"
        size="icon"
        className="size-7 shrink-0 text-muted-foreground opacity-0 hover:text-foreground group-hover:opacity-100"
        onClick={onStartEdit}
      >
        <Pencil className="size-3.5" />
        <span className="sr-only">{t("renameTitle")}</span>
      </Button>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="mr-1 size-7 shrink-0 text-muted-foreground opacity-0 hover:text-destructive group-hover:opacity-100"
          >
            <Trash2 className="size-3.5" />
            <span className="sr-only">{t("deleteTitle")}</span>
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("deleteDescription", { title: conversation.title })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("deleteCancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={onDelete}>
              {t("deleteConfirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
