"use client";

import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { API_URL } from "@/lib/api";
import { useAuthStore } from "@/lib/auth-store";
import { usePreviewStore } from "@/lib/preview-store";

// Fetch through the auth store so JWT-guarded /file responses reach the iframe
// as an authenticated blob URL. Public URLs would need query-string tokens.
async function fetchAuthed(path: string): Promise<Response> {
  const token = useAuthStore.getState().token;
  const response = await fetch(`${API_URL}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) throw new Error(`Failed: ${response.status}`);
  return response;
}

function getExtension(fileName: string): string {
  return fileName.slice(fileName.lastIndexOf(".")).toLowerCase();
}

export function DocumentViewer() {
  const t = useTranslations("preview");
  const { target, close } = usePreviewStore();

  return (
    <Dialog open={!!target} onOpenChange={(open) => !open && close()}>
      <DialogContent className="flex h-[90vh] max-w-4xl flex-col p-0">
        <DialogHeader className="border-b px-4 py-3">
          <DialogTitle className="truncate">{target?.fileName}</DialogTitle>
        </DialogHeader>
        {target && <ViewerBody target={target} onError={close} />}
      </DialogContent>
    </Dialog>
  );
}

function ViewerBody({
  target,
  onError,
}: {
  target: { documentId: string; fileName: string; page?: number | null };
  onError: () => void;
}) {
  const t = useTranslations("preview");
  const extension = getExtension(target.fileName);
  const isPdf = extension === ".pdf";

  if (isPdf) return <PdfBody target={target} onError={onError} />;
  return <TextBody target={target} extension={extension} onError={onError} />;
}

function PdfBody({
  target,
  onError,
}: {
  target: { documentId: string; page?: number | null };
  onError: () => void;
}) {
  const t = useTranslations("preview");
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let createdUrl: string | null = null;
    (async () => {
      try {
        const response = await fetchAuthed(
          `/api/documents/${target.documentId}/file`,
        );
        const blob = await response.blob();
        createdUrl = URL.createObjectURL(blob);
        if (!cancelled) setBlobUrl(createdUrl);
      } catch {
        if (!cancelled) onError();
      }
    })();
    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [target.documentId, onError]);

  if (!blobUrl) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // #page=N is a PDF Open Parameters convention supported by Chrome/Edge/Firefox.
  const pageAnchor = target.page ? `#page=${target.page}` : "";
  return (
    <iframe
      src={`${blobUrl}${pageAnchor}`}
      className="min-h-0 flex-1 border-0"
      title={t("pdfViewer")}
    />
  );
}

function TextBody({
  target,
  extension,
  onError,
}: {
  target: { documentId: string; fileName: string };
  extension: string;
  onError: () => void;
}) {
  const t = useTranslations("preview");
  const [text, setText] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Raw file works for txt/md; docx and xlsx need the parsed-text endpoint
        // because the browser has no viewer for those formats.
        const needsParsed = extension === ".docx" || extension === ".xlsx";
        const endpoint = needsParsed ? "text" : "file";
        const response = await fetchAuthed(
          `/api/documents/${target.documentId}/${endpoint}`,
        );
        const value = await response.text();
        if (!cancelled) setText(value);
      } catch {
        if (!cancelled) onError();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [target.documentId, extension, onError]);

  const isMarkdown = extension === ".md";
  const trimmed = useMemo(() => text?.trim() ?? "", [text]);

  if (text === null) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!trimmed) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        {t("empty")}
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-6">
      {isMarkdown ? (
        <div className="prose prose-sm dark:prose-invert max-w-none">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
        </div>
      ) : (
        <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed">
          {text}
        </pre>
      )}
    </div>
  );
}
