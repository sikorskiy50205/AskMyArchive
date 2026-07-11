"use client";

import { useQuery } from "@tanstack/react-query";
import { HardDrive } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Progress } from "@/components/ui/progress";
import { documentsApi } from "@/lib/documents-api";
import { formatBytes } from "@/lib/format";

export function StorageQuotaCard() {
  const t = useTranslations("documents.quota");
  const locale = useLocale();

  const { data } = useQuery({
    queryKey: ["documents", "storage"],
    queryFn: documentsApi.storage,
  });

  if (!data) return null;

  const percent = Math.min(
    100,
    Math.round((data.usedBytes / data.limitBytes) * 100),
  );

  return (
    <div className="flex items-center gap-3 rounded-md border bg-card px-3 py-2">
      <HardDrive className="size-4 text-muted-foreground" />
      <span className="text-sm text-muted-foreground">{t("label")}</span>
      <span className="text-sm tabular-nums">
        {formatBytes(data.usedBytes, locale)} / {formatBytes(data.limitBytes, locale)}
      </span>
      <Progress value={percent} className="ml-auto h-2 w-32" />
    </div>
  );
}
