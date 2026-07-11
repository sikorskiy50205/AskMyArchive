"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Check, Copy, FileText, RotateCcw } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Source } from "@/lib/chat-api";
import { usePreviewStore } from "@/lib/preview-store";

export function UserMessage({ content }: { content: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] whitespace-pre-wrap rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground">
        {content}
      </div>
    </div>
  );
}

export function AssistantMessage({
  content,
  sources,
  pending,
  onRegenerate,
}: {
  content: string;
  sources?: Source[];
  pending?: boolean;
  onRegenerate?: () => void;
}) {
  const t = useTranslations("chat");
  const openPreview = usePreviewStore((s) => s.open);
  const [copied, setCopied] = useState(false);
  const canAct = !pending && content.length > 0;

  async function copy() {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error(t("copyFailed"));
    }
  }

  return (
    <div className="group flex flex-col items-start gap-2">
      <div className="max-w-full rounded-lg border bg-card px-4 py-3">
        {content ? (
          <div className="prose prose-sm dark:prose-invert max-w-none break-words">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
          </div>
        ) : pending ? (
          <span className="animate-pulse text-sm text-muted-foreground">
            {t("thinking")}
          </span>
        ) : (
          <span className="text-sm italic text-muted-foreground">
            {t("stopped")}
          </span>
        )}
      </div>
      {sources && sources.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {sources.map((source, index) => (
            <button
              key={index}
              type="button"
              onClick={() =>
                openPreview({
                  documentId: source.documentId,
                  fileName: source.fileName,
                  page: source.page,
                })
              }
            >
              <Badge
                variant="outline"
                className="cursor-pointer gap-1 font-normal hover:bg-accent"
              >
                <FileText className="size-3" />
                {source.fileName}
                {source.page != null &&
                  ` · ${t("page", { page: source.page })}`}
              </Badge>
            </button>
          ))}
        </div>
      )}
      {canAct && (
        <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 text-xs text-muted-foreground"
            onClick={copy}
          >
            {copied ? (
              <Check className="size-3.5" />
            ) : (
              <Copy className="size-3.5" />
            )}
            {copied ? t("copied") : t("copy")}
          </Button>
          {onRegenerate && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 text-xs text-muted-foreground"
              onClick={onRegenerate}
            >
              <RotateCcw className="size-3.5" />
              {t("regenerate")}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
