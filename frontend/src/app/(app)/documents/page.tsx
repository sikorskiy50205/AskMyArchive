"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { EmptyState } from "@/components/empty-state";
import { BulkActionsBar } from "@/components/documents/bulk-actions-bar";
import { DocumentRow } from "@/components/documents/document-row";
import {
  FiltersBar,
  matchesDateFilter,
  type DateFilter,
  type StatusFilter,
} from "@/components/documents/filters-bar";
import { StorageQuotaCard } from "@/components/documents/storage-quota-card";
import { UploadZone } from "@/components/documents/upload-zone";
import { Skeleton } from "@/components/ui/skeleton";
import { documentsApi, hasPendingDocuments } from "@/lib/documents-api";
import { useHotkey } from "@/lib/use-hotkey";

export default function DocumentsPage() {
  const t = useTranslations("documents");
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const searchRef = useRef<HTMLInputElement>(null);
  useHotkey(
    "k",
    useCallback(() => searchRef.current?.focus(), []),
    { ctrl: true },
  );

  const { data: documents, isPending } = useQuery({
    queryKey: ["documents"],
    queryFn: documentsApi.list,
    // Poll while anything is still being indexed so status badges update live.
    refetchInterval: (query) =>
      hasPendingDocuments(query.state.data) ? 2000 : false,
  });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["documents"] });
    queryClient.invalidateQueries({ queryKey: ["documents", "storage"] });
    queryClient.invalidateQueries({ queryKey: ["profile"] });
  }

  const bulkDelete = useMutation({
    mutationFn: (ids: string[]) => documentsApi.deleteBatch(ids),
    onSuccess: (result) => {
      toast.success(t("bulk.deleteSuccess", { count: result.deleted }));
      setSelected(new Set());
      invalidate();
    },
    onError: () => toast.error(t("bulk.deleteFailed")),
  });

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (documents ?? []).filter((doc) => {
      if (query && !doc.fileName.toLowerCase().includes(query)) return false;
      if (statusFilter !== "all" && doc.status !== statusFilter) return false;
      if (!matchesDateFilter(doc.uploadedAt, dateFilter)) return false;
      return true;
    });
  }, [documents, search, statusFilter, dateFilter]);

  // Prune stale selections when the list changes (delete, filter change, etc.).
  const visibleIds = useMemo(() => new Set(filtered.map((d) => d.id)), [filtered]);
  const validSelected = useMemo(
    () => new Set([...selected].filter((id) => visibleIds.has(id))),
    [selected, visibleIds],
  );

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    // Fixed-height column: header widgets stay pinned, only the list scrolls.
    // Prevents the outer <main> from also scrolling and producing a double scrollbar.
    <div className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">{t("title")}</h1>
      </div>

      <StorageQuotaCard />

      <UploadZone onUploaded={invalidate} />

      <FiltersBar
        ref={searchRef}
        search={search}
        onSearchChange={setSearch}
        status={statusFilter}
        onStatusChange={setStatusFilter}
        date={dateFilter}
        onDateChange={setDateFilter}
      />

      <BulkActionsBar
        count={validSelected.size}
        onClear={() => setSelected(new Set())}
        onConfirmDelete={() => bulkDelete.mutate([...validSelected])}
        deleting={bulkDelete.isPending}
      />

      {/* relative: rows contain absolutely-positioned sr-only spans; see conversation-list. */}
      <div className="relative flex min-h-0 flex-1 flex-col overflow-y-auto">
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
            {t("noResults", { search: search.trim() || "…" })}
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {filtered.map((doc) => (
              <DocumentRow
                key={doc.id}
                doc={doc}
                selected={validSelected.has(doc.id)}
                onToggleSelect={() => toggle(doc.id)}
                onDeleted={invalidate}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
