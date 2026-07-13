"use client";

import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { API_URL } from "@/lib/api";
import { useAuthStore } from "@/lib/auth-store";
import { documentsApi } from "@/lib/documents-api";
import { useOcrStore } from "@/lib/ocr-store";

export function OcrModal() {
  const { target, close } = useOcrStore();
  return (
    <Dialog open={!!target} onOpenChange={(open) => !open && close()}>
      <DialogContent className="flex h-[90vh] w-[95vw] max-w-[80rem] flex-col gap-4 sm:max-w-[80rem]">
        {target && <OcrBody target={target} onDone={close} />}
      </DialogContent>
    </Dialog>
  );
}

function OcrBody({
  target,
  onDone,
}: {
  target: { documentId: string; fileName: string };
  onDone: () => void;
}) {
  const t = useTranslations("documents.ocr");
  const queryClient = useQueryClient();
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [text, setText] = useState("");
  const [ocrDone, setOcrDone] = useState(false);
  const [ocrError, setOcrError] = useState<string | null>(null);

  // Load the image bytes with a bearer token, hand a blob URL to <img> and to Tesseract.
  useEffect(() => {
    let cancelled = false;
    let createdUrl: string | null = null;

    (async () => {
      try {
        const token = useAuthStore.getState().token;
        const res = await fetch(
          `${API_URL}/api/documents/${target.documentId}/file`,
          { headers: token ? { Authorization: `Bearer ${token}` } : {} },
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        createdUrl = URL.createObjectURL(blob);
        if (!cancelled) setImageUrl(createdUrl);
      } catch (e) {
        console.error("OcrModal: failed to load image", e);
        if (!cancelled) setImageError(e instanceof Error ? e.message : String(e));
      }
    })();

    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [target.documentId]);

  // Start OCR only once the image blob is ready. Separated from the image effect
  // so a Tesseract failure never blocks the image preview.
  useEffect(() => {
    if (!imageUrl) return;
    let cancelled = false;

    (async () => {
      try {
        // Dynamic import keeps ~2 MB of WASM out of the initial bundle.
        const Tesseract = await import("tesseract.js");
        const result = await Tesseract.recognize(imageUrl, "rus+eng", {
          logger: (m: { status: string; progress: number }) => {
            if (cancelled) return;
            if (m.status === "recognizing text") {
              setProgress(Math.round(m.progress * 100));
            }
          },
        });
        if (cancelled) return;
        setText(result.data.text.trim());
        setProgress(100);
        setOcrDone(true);
      } catch (e) {
        console.error("OcrModal: Tesseract failed", e);
        if (!cancelled) {
          setOcrError(e instanceof Error ? e.message : String(e));
          setOcrDone(true); // unlock the textarea so the user can type manually
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [imageUrl]);

  const accept = useMutation({
    mutationFn: () => documentsApi.updateOcrText(target.documentId, text),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      queryClient.invalidateQueries({ queryKey: ["documents", "storage"] });
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      toast.success(t("saved"));
      onDone();
    },
    onError: () => toast.error(t("saveFailed")),
  });

  const cancel = useMutation({
    mutationFn: () => documentsApi.delete(target.documentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      queryClient.invalidateQueries({ queryKey: ["documents", "storage"] });
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      onDone();
    },
    onError: () => toast.error(t("deleteFailed")),
  });

  return (
    <>
      <DialogHeader>
        <DialogTitle className="truncate">{target.fileName}</DialogTitle>
      </DialogHeader>

      {/* min-h-0 + flex-1 lets the middle panel actually shrink so the footer stays inside the modal. */}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 md:grid-cols-2">
        <div className="flex min-h-0 items-center justify-center overflow-hidden rounded-md border bg-muted">
          {imageError ? (
            <div className="flex flex-col items-center gap-2 p-4 text-center text-sm text-destructive">
              <AlertCircle className="size-5" />
              <span>{t("imageLoadFailed", { message: imageError })}</span>
            </div>
          ) : imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- blob URL, no next/image loader
            <img
              src={imageUrl}
              alt={target.fileName}
              className="max-h-full max-w-full object-contain"
            />
          ) : (
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          )}
        </div>

        <div className="flex min-h-0 flex-col gap-2">
          <label className="text-sm font-medium">{t("recognizedLabel")}</label>
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={ocrDone ? t("emptyRecognition") : t("recognizing")}
            className="min-h-0 flex-1 resize-none font-mono text-sm"
          />
          {ocrError ? (
            <p className="text-sm text-destructive">
              {t("ocrFailed", { message: ocrError })}
            </p>
          ) : !ocrDone ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Progress value={progress} className="h-1 flex-1" />
              <span className="w-10 text-right tabular-nums">{progress}%</span>
            </div>
          ) : null}
        </div>
      </div>

      <DialogFooter>
        <Button
          variant="outline"
          onClick={() => cancel.mutate()}
          disabled={cancel.isPending || accept.isPending}
        >
          {cancel.isPending && <Loader2 className="size-4 animate-spin" />}
          {t("cancel")}
        </Button>
        <Button
          onClick={() => accept.mutate()}
          disabled={!text.trim() || accept.isPending || cancel.isPending}
        >
          {accept.isPending && <Loader2 className="size-4 animate-spin" />}
          {t("save")}
        </Button>
      </DialogFooter>
    </>
  );
}
