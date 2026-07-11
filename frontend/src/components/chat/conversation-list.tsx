"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
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
import { Skeleton } from "@/components/ui/skeleton";
import { chatApi } from "@/lib/chat-api";
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
            <div
              key={conversation.id}
              className={cn(
                "group flex items-center rounded-md",
                conversation.id === activeId
                  ? "bg-accent"
                  : "hover:bg-accent/50",
              )}
            >
              <button
                type="button"
                className="min-w-0 flex-1 px-2 py-2 text-left"
                onClick={() => onSelect(conversation.id)}
              >
                <span className="block truncate text-sm">
                  {conversation.title}
                </span>
                <span className="text-xs text-muted-foreground">
                  {formatDateTime(conversation.createdAt, locale)}
                </span>
              </button>
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
                    <AlertDialogAction
                      onClick={() => del.mutate(conversation.id)}
                    >
                      {t("deleteConfirm")}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
