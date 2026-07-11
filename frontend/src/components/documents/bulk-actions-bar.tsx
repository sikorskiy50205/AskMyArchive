"use client";

import { useState } from "react";
import { Loader2, Trash2, X } from "lucide-react";
import { useTranslations } from "next-intl";
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
import { Button } from "@/components/ui/button";

export function BulkActionsBar({
  count,
  onClear,
  onConfirmDelete,
  deleting,
}: {
  count: number;
  onClear: () => void;
  onConfirmDelete: () => void;
  deleting: boolean;
}) {
  const t = useTranslations("documents.bulk");
  const [open, setOpen] = useState(false);

  if (count === 0) return null;

  return (
    <div className="sticky top-0 z-10 flex items-center gap-2 rounded-md border bg-accent/70 p-2 backdrop-blur">
      <span className="text-sm font-medium">{t("selected", { count })}</span>
      <div className="ml-auto flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onClear}>
          <X className="size-4" />
          {t("cancel")}
        </Button>
        <AlertDialog open={open} onOpenChange={setOpen}>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" size="sm">
              <Trash2 className="size-4" />
              {t("deleteButton", { count })}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("confirmTitle")}</AlertDialogTitle>
              <AlertDialogDescription>
                {t("confirmDescription", { count })}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t("confirmCancel")}</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  onConfirmDelete();
                }}
                disabled={deleting}
              >
                {deleting && <Loader2 className="size-4 animate-spin" />}
                {t("confirmDelete")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
