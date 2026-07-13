"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ChevronDown, ChevronUp, Loader2, Search, X } from "lucide-react";
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
      <DialogContent className="flex h-[90vh] w-[95vw] max-w-[80rem] flex-col p-0 sm:max-w-[80rem]">
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
        // Raw file works for txt/md; docx, xlsx and images (post-OCR) need the
        // parsed-text endpoint — the image bytes would just render as garbage.
        const parsedFormats = [".docx", ".xlsx", ".png", ".jpg", ".jpeg", ".webp"];
        const needsParsed = parsedFormats.includes(extension);
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
  const [query, setQuery] = useState("");
  const [matchIndex, setMatchIndex] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  const matches = useMemo(() => {
    const q = query.trim();
    if (!q || !text) return [];
    const results: number[] = [];
    const hay = text.toLowerCase();
    const needle = q.toLowerCase();
    let i = 0;
    while ((i = hay.indexOf(needle, i)) !== -1) {
      results.push(i);
      i += needle.length;
    }
    return results;
  }, [text, query]);

  // Reset the pointer when the match set changes so we don't stay on a stale index.
  useEffect(() => {
    setMatchIndex(0);
  }, [query]);

  // Scroll the current match into the middle of the visible area.
  useLayoutEffect(() => {
    if (matches.length === 0) return;
    const el = scrollRef.current?.querySelector<HTMLElement>(
      `[data-match="${matchIndex}"]`,
    );
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [matchIndex, matches.length]);

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

  function step(dir: 1 | -1) {
    if (matches.length === 0) return;
    setMatchIndex((i) => (i + dir + matches.length) % matches.length);
  }

  // When searching, drop markdown rendering — highlighting a React tree of typed
  // <h1>/<p>/<code> nodes is hairy; plain-text mode with <mark> is bulletproof.
  const searching = matches.length > 0;
  const content = searching
    ? renderHighlighted(text, query, matchIndex)
    : isMarkdown
      ? (
          <div className="prose prose-sm dark:prose-invert max-w-none">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
          </div>
        )
      : (
          <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed">
            {text}
          </pre>
        );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <SearchBar
        query={query}
        onChange={setQuery}
        onNext={() => step(1)}
        onPrev={() => step(-1)}
        matchCount={matches.length}
        currentIndex={matchIndex}
      />
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto p-6">
        {content}
      </div>
    </div>
  );
}

function SearchBar({
  query,
  onChange,
  onNext,
  onPrev,
  matchCount,
  currentIndex,
}: {
  query: string;
  onChange: (value: string) => void;
  onNext: () => void;
  onPrev: () => void;
  matchCount: number;
  currentIndex: number;
}) {
  const t = useTranslations("preview.search");
  const hasQuery = query.trim().length > 0;
  return (
    <div className="flex items-center gap-2 border-b bg-background px-4 py-2">
      <Search className="size-4 text-muted-foreground" />
      <input
        value={query}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t("placeholder")}
        className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            e.shiftKey ? onPrev() : onNext();
          } else if (e.key === "Escape" && hasQuery) {
            e.preventDefault();
            onChange("");
          }
        }}
      />
      {hasQuery && (
        <>
          <span className="tabular-nums text-xs text-muted-foreground">
            {matchCount > 0
              ? t("counter", { current: currentIndex + 1, total: matchCount })
              : t("noMatches")}
          </span>
          <button
            type="button"
            onClick={onPrev}
            disabled={matchCount === 0}
            className="rounded p-1 text-muted-foreground hover:bg-accent disabled:opacity-40"
            aria-label={t("prev")}
          >
            <ChevronUp className="size-4" />
          </button>
          <button
            type="button"
            onClick={onNext}
            disabled={matchCount === 0}
            className="rounded p-1 text-muted-foreground hover:bg-accent disabled:opacity-40"
            aria-label={t("next")}
          >
            <ChevronDown className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => onChange("")}
            className="rounded p-1 text-muted-foreground hover:bg-accent"
            aria-label={t("clear")}
          >
            <X className="size-4" />
          </button>
        </>
      )}
    </div>
  );
}

function renderHighlighted(
  text: string,
  query: string,
  currentIndex: number,
): React.ReactNode {
  const q = query.trim();
  const hay = text.toLowerCase();
  const needle = q.toLowerCase();
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  let matchNo = 0;
  let i = 0;
  while ((i = hay.indexOf(needle, i)) !== -1) {
    if (cursor < i) parts.push(text.substring(cursor, i));
    const isCurrent = matchNo === currentIndex;
    parts.push(
      <mark
        key={matchNo}
        data-match={matchNo}
        className={
          isCurrent
            ? "rounded bg-amber-400 text-black dark:bg-amber-500"
            : "rounded bg-amber-200/70 text-inherit dark:bg-amber-500/30"
        }
      >
        {text.substring(i, i + needle.length)}
      </mark>,
    );
    cursor = i + needle.length;
    i = cursor;
    matchNo++;
  }
  if (cursor < text.length) parts.push(text.substring(cursor));
  return (
    <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed">
      {parts}
    </pre>
  );
}
