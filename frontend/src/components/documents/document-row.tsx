"use client";

import { useMutation } from "@tanstack/react-query";
import { FileText, Loader2, Trash2 } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { documentsApi, type DocumentDto } from "@/lib/documents-api";
import { formatBytes, formatDateTime } from "@/lib/format";
import { usePreviewStore } from "@/lib/preview-store";

function StatusBadge({ doc }: { doc: DocumentDto }) {
  const t = useTranslations("documents.status");
  switch (doc.status) {
    case "Indexed":
      return <Badge>{t("Indexed")}</Badge>;
    case "Indexing":
      return (
        <Badge variant="secondary">
          <Loader2 className="size-3 animate-spin" />
          {t("Indexing")}
        </Badge>
      );
    case "Failed":
      // The raw error is developer-facing; surface it via tooltip only.
      return (
        <Badge variant="destructive" title={doc.error ?? undefined}>
          {t("Failed")}
        </Badge>
      );
    default:
      return <Badge variant="outline">{t("Uploaded")}</Badge>;
  }
}

export function DocumentRow({
  doc,
  onDeleted,
}: {
  doc: DocumentDto;
  onDeleted: () => void;
}) {
  const t = useTranslations("documents");
  const locale = useLocale();
  const openPreview = usePreviewStore((s) => s.open);
  const canPreview = doc.status === "Indexed" || doc.status === "Indexing";

  const del = useMutation({
    mutationFn: () => documentsApi.delete(doc.id),
    onSuccess: () => {
      toast.success(t("deleteSuccess"));
      onDeleted();
    },
    onError: () => toast.error(t("deleteFailed")),
  });

  const meta = [
    formatBytes(doc.sizeBytes, locale),
    formatDateTime(doc.uploadedAt, locale),
    doc.pageCount > 0 ? t("pages", { count: doc.pageCount }) : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="flex items-center gap-3 rounded-md border p-3">
      <FileText className="size-5 shrink-0 text-muted-foreground" />
      <button
        type="button"
        disabled={!canPreview}
        onClick={() =>
          openPreview({ documentId: doc.id, fileName: doc.fileName })
        }
        className="min-w-0 flex-1 cursor-pointer text-left disabled:cursor-default"
      >
        <p className="truncate text-sm font-medium underline-offset-2 group-enabled:hover:underline">
          {doc.fileName}
        </p>
        <p className="text-xs text-muted-foreground">{meta}</p>
      </button>
      <StatusBadge doc={doc} />
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground hover:text-destructive"
            disabled={del.isPending}
          >
            {del.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Trash2 className="size-4" />
            )}
            <span className="sr-only">{t("deleteTitle")}</span>
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("deleteDescription", { name: doc.fileName })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("deleteCancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => del.mutate()}>
              {t("deleteConfirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
