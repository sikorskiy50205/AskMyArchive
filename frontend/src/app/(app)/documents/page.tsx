"use client";

import { FileText } from "lucide-react";
import { useTranslations } from "next-intl";
import { EmptyState } from "@/components/empty-state";

export default function DocumentsPage() {
  const t = useTranslations("documents");

  return (
    <EmptyState
      icon={FileText}
      title={t("emptyTitle")}
      description={t("emptyDescription")}
    />
  );
}
