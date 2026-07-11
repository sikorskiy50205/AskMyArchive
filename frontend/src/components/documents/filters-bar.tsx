"use client";

import { forwardRef } from "react";
import { Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { DocumentStatus } from "@/lib/documents-api";

export type StatusFilter = "all" | DocumentStatus;
export type DateFilter = "all" | "today" | "week" | "month";

export const FiltersBar = forwardRef<
  HTMLInputElement,
  {
    search: string;
    onSearchChange: (v: string) => void;
    status: StatusFilter;
    onStatusChange: (v: StatusFilter) => void;
    date: DateFilter;
    onDateChange: (v: DateFilter) => void;
  }
>(function FiltersBar(
  { search, onSearchChange, status, onStatusChange, date, onDateChange },
  searchRef,
) {
  const t = useTranslations("documents");

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-52 flex-1">
        <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={searchRef}
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={t("searchPlaceholder")}
          className="pl-8 pr-14"
        />
        <kbd className="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 select-none rounded border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground sm:inline-block">
          Ctrl K
        </kbd>
      </div>
      <Select value={status} onValueChange={(v) => onStatusChange(v as StatusFilter)}>
        <SelectTrigger className="w-40">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t("filter.statusAll")}</SelectItem>
          <SelectItem value="Indexed">{t("status.Indexed")}</SelectItem>
          <SelectItem value="Indexing">{t("status.Indexing")}</SelectItem>
          <SelectItem value="Failed">{t("status.Failed")}</SelectItem>
        </SelectContent>
      </Select>
      <Select value={date} onValueChange={(v) => onDateChange(v as DateFilter)}>
        <SelectTrigger className="w-40">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t("filter.dateAll")}</SelectItem>
          <SelectItem value="today">{t("filter.dateToday")}</SelectItem>
          <SelectItem value="week">{t("filter.dateWeek")}</SelectItem>
          <SelectItem value="month">{t("filter.dateMonth")}</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
});

// Client-side date-window check so we don't need a backend range filter.
export function matchesDateFilter(iso: string, filter: DateFilter): boolean {
  if (filter === "all") return true;
  const uploaded = new Date(iso);

  if (filter === "today") {
    // Same local calendar day — "since midnight", not "last 24 hours".
    const now = new Date();
    return (
      uploaded.getFullYear() === now.getFullYear() &&
      uploaded.getMonth() === now.getMonth() &&
      uploaded.getDate() === now.getDate()
    );
  }

  const day = 24 * 60 * 60 * 1000;
  const windowMs = filter === "week" ? 7 * day : 30 * day;
  return Date.now() - uploaded.getTime() <= windowMs;
}
