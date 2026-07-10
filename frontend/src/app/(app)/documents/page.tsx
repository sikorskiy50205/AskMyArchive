"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { EmptyState } from "@/components/empty-state";
import { DocumentRow } from "@/components/documents/document-row";
import { UploadZone } from "@/components/documents/upload-zone";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { documentsApi, hasPendingDocuments } from "@/lib/documents-api";

export default function DocumentsPage() {
  const t = useTranslations("documents");
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");

  const { data: documents, isPending } = useQuery({
    queryKey: ["documents"],
    queryFn: documentsApi.list,
    // Poll while anything is still being indexed so status badges update live.
    refetchInterval: (query) =>
      hasPendingDocuments(query.state.data) ? 2000 : false,
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["documents"] });

  const filtered = (documents ?? []).filter((d) =>
    d.fileName.toLowerCase().includes(search.trim().toLowerCase()),
  );

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">{t("title")}</h1>
        <div className="relative w-full max-w-56">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("searchPlaceholder")}
            className="pl-8"
          />
        </div>
      </div>

      <UploadZone onUploaded={invalidate} />

      {isPending ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
      ) : documents?.length === 0 ? (
        <EmptyState
          icon={FileText}
          title={t("emptyTitle")}
          description={t("emptyDescription")}
        />
      ) : filtered.length === 0 ? (
        <p className="p-8 text-center text-sm text-muted-foreground">
          {t("noResults", { search: search.trim() })}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((doc) => (
            <DocumentRow key={doc.id} doc={doc} onDeleted={invalidate} />
          ))}
        </div>
      )}
    </div>
  );
}
