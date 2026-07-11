"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { FileText } from "lucide-react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
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
}: {
  content: string;
  sources?: Source[];
  pending?: boolean;
}) {
  const t = useTranslations("chat");
  const openPreview = usePreviewStore((s) => s.open);

  return (
    <div className="flex flex-col items-start gap-2">
      <div className="max-w-full rounded-lg border bg-card px-4 py-3">
        {content ? (
          <div className="prose prose-sm dark:prose-invert max-w-none break-words">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
          </div>
        ) : pending ? (
          <span className="animate-pulse text-sm text-muted-foreground">
            {t("thinking")}
          </span>
        ) : null}
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
    </div>
  );
}
