"use client";

import { MessagesSquare } from "lucide-react";
import { useTranslations } from "next-intl";
import { EmptyState } from "@/components/empty-state";

export default function ChatPage() {
  const t = useTranslations("chat");

  return (
    <EmptyState
      icon={MessagesSquare}
      title={t("emptyTitle")}
      description={t("emptyDescription")}
    />
  );
}
