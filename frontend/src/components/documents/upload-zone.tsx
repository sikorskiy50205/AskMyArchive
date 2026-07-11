"use client";

import { useRef, useState } from "react";
import { UploadCloud } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Progress } from "@/components/ui/progress";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  ALLOWED_EXTENSIONS,
  MAX_FILE_SIZE_BYTES,
  uploadDocument,
} from "@/lib/documents-api";

type Upload = { key: number; name: string; progress: number };

export function UploadZone({ onUploaded }: { onUploaded: () => void }) {
  const t = useTranslations("documents");
  const [dragging, setDragging] = useState(false);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const nextKey = useRef(0);

  function handleFiles(files: FileList | null) {
    if (!files) return;
    for (const file of Array.from(files)) void startUpload(file);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function startUpload(file: File) {
    const extension = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(extension)) {
      toast.error(t("unsupportedType", { name: file.name }));
      return;
    }
    if (file.size === 0 || file.size > MAX_FILE_SIZE_BYTES) {
      toast.error(t("fileTooLarge", { name: file.name }));
      return;
    }

    const key = nextKey.current++;
    setUploads((u) => [...u, { key, name: file.name, progress: 0 }]);
    try {
      await uploadDocument(file, (progress) =>
        setUploads((u) =>
          u.map((x) => (x.key === key ? { ...x, progress } : x)),
        ),
      );
      toast.success(t("uploadSuccess", { name: file.name }));
      onUploaded();
    } catch (error) {
      if (
        error instanceof ApiError &&
        error.status === 400 &&
        error.message.toLowerCase().includes("quota")
      ) {
        toast.error(t("quotaExceeded", { name: file.name }));
      } else {
        toast.error(t("uploadFailed", { name: file.name }));
      }
    } finally {
      setUploads((u) => u.filter((x) => x.key !== key));
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          handleFiles(e.dataTransfer.files);
        }}
        className={cn(
          "flex flex-col items-center gap-2 rounded-lg border-2 border-dashed p-8 text-center transition-colors",
          dragging
            ? "border-primary bg-accent"
            : "border-border hover:bg-accent/50",
        )}
      >
        <UploadCloud className="size-8 text-muted-foreground" />
        <span className="text-sm font-medium">{t("dropHere")}</span>
        <span className="text-xs text-muted-foreground">{t("dropHint")}</span>
      </button>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ALLOWED_EXTENSIONS.join(",")}
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />

      {uploads.map((upload) => (
        <div
          key={upload.key}
          className="flex items-center gap-3 rounded-md border p-3"
        >
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm">{upload.name}</p>
            <Progress value={upload.progress} className="mt-2" />
          </div>
          <span className="text-xs tabular-nums text-muted-foreground">
            {upload.progress}%
          </span>
        </div>
      ))}
    </div>
  );
}
