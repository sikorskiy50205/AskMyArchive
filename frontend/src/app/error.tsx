"use client";

import { useEffect } from "react";
import { AlertTriangle, RefreshCcw } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/logo";

// App Router error boundary: catches render errors in the descendant tree.
// A client component by convention, so it can re-run render via `reset`.
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("errors.server");

  useEffect(() => {
    console.error("[App error boundary]", error);
  }, [error]);

  return (
    <div className="flex min-h-svh flex-col">
      <header className="p-4">
        <Logo />
      </header>
      <main className="flex flex-1 flex-col items-center justify-center gap-6 p-8 text-center">
        <div className="flex size-24 items-center justify-center rounded-full bg-destructive/10">
          <AlertTriangle className="size-12 text-destructive" />
        </div>
        <div className="space-y-2">
          <p className="text-6xl font-bold tracking-tight text-muted-foreground">
            500
          </p>
          <h1 className="text-2xl font-semibold">{t("title")}</h1>
          <p className="max-w-md text-muted-foreground">{t("description")}</p>
          {error.digest && (
            <p className="text-xs text-muted-foreground">
              {t("digest", { digest: error.digest })}
            </p>
          )}
        </div>
        <Button onClick={reset}>
          <RefreshCcw className="size-4" />
          {t("retry")}
        </Button>
      </main>
    </div>
  );
}
