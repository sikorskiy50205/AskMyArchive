"use client";

import { useMutation } from "@tanstack/react-query";
import { MailWarning, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { profileApi } from "@/lib/profile-api";

export function EmailConfirmationBanner() {
  const t = useTranslations("profile.emailConfirm");

  const resend = useMutation({
    mutationFn: profileApi.sendConfirmation,
    onSuccess: () => toast.success(t("resentToast")),
    onError: () => toast.error(t("resendFailed")),
  });

  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-lg border border-amber-400/40 bg-amber-50/60 p-4 text-sm dark:border-amber-500/30 dark:bg-amber-500/10"
    >
      <MailWarning className="mt-0.5 size-5 shrink-0 text-amber-600 dark:text-amber-400" />
      <div className="flex-1">
        <p className="font-medium text-amber-900 dark:text-amber-100">
          {t("title")}
        </p>
        <p className="mt-0.5 text-amber-800/80 dark:text-amber-100/80">
          {t("description")}
        </p>
      </div>
      <Button
        size="sm"
        variant="outline"
        onClick={() => resend.mutate()}
        disabled={resend.isPending}
      >
        {resend.isPending && <Loader2 className="size-4 animate-spin" />}
        {t("resend")}
      </Button>
    </div>
  );
}
