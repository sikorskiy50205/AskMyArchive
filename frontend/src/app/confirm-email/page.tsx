"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ApiError, authApi } from "@/lib/api";

export default function ConfirmEmailPage() {
  return (
    <div className="flex min-h-svh flex-col">
      <header className="p-4">
        <Logo />
      </header>
      <main className="flex flex-1 items-center justify-center p-4">
        <Suspense fallback={null}>
          <ConfirmContent />
        </Suspense>
      </main>
    </div>
  );
}

type State = { kind: "pending" } | { kind: "ok" } | { kind: "error" };

function ConfirmContent() {
  const t = useTranslations("auth");
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [state, setState] = useState<State>(token ? { kind: "pending" } : { kind: "error" });
  // React 19 Strict Mode double-invokes effects; a ref keeps the token from being consumed twice.
  const started = useRef(false);

  useEffect(() => {
    if (!token || started.current) return;
    started.current = true;
    authApi
      .confirmEmail(token)
      .then(() => setState({ kind: "ok" }))
      .catch((e) => setState({ kind: e instanceof ApiError ? "error" : "error" }));
  }, [token]);

  if (state.kind === "pending") {
    return (
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
          <CardTitle className="text-xl">{t("confirm.pendingTitle")}</CardTitle>
        </CardHeader>
      </Card>
    );
  }

  if (state.kind === "ok") {
    return (
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <div className="mb-2 flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <CheckCircle2 className="size-6" />
          </div>
          <CardTitle className="text-xl">{t("confirm.successTitle")}</CardTitle>
          <CardDescription>{t("confirm.successDescription")}</CardDescription>
        </CardHeader>
        <CardFooter>
          <Button asChild className="w-full">
            <Link href="/chat">{t("confirm.continue")}</Link>
          </Button>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader className="items-center text-center">
        <div className="mb-2 flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <AlertCircle className="size-6" />
        </div>
        <CardTitle className="text-xl">{t("confirm.errorTitle")}</CardTitle>
        <CardDescription>{t("confirm.errorDescription")}</CardDescription>
      </CardHeader>
      <CardContent />
      <CardFooter>
        <Button asChild variant="outline" className="w-full">
          <Link href="/profile">{t("confirm.goToProfile")}</Link>
        </Button>
      </CardFooter>
    </Card>
  );
}
