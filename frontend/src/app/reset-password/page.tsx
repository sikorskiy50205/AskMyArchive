"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, authApi } from "@/lib/api";

// Standalone layout — rendered outside (auth) so a signed-in user clicking the email link
// isn't bounced to /chat before they can complete the reset.
export default function ResetPasswordPage() {
  return (
    <div className="flex min-h-svh flex-col">
      <header className="p-4">
        <Logo />
      </header>
      <main className="flex flex-1 items-center justify-center p-4">
        <Suspense fallback={null}>
          <ResetForm />
        </Suspense>
      </main>
    </div>
  );
}

function ResetForm() {
  const t = useTranslations("auth");
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [done, setDone] = useState(false);

  const schema = useMemo(
    () =>
      z
        .object({
          password: z.string().min(8, t("errors.passwordTooShort")),
          confirmPassword: z.string(),
        })
        .refine((v) => v.password === v.confirmPassword, {
          message: t("errors.passwordsDontMatch"),
          path: ["confirmPassword"],
        }),
    [t],
  );
  type FormValues = z.infer<typeof schema>;

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const reset = useMutation({
    mutationFn: (values: FormValues) =>
      authApi.resetPassword(token, values.password),
    onSuccess: () => setDone(true),
    onError: (error) => {
      if (error instanceof ApiError) toast.error(t("reset.invalid"));
      else toast.error(t("errors.networkError"));
    },
  });

  if (!token) {
    return (
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">{t("reset.invalidTitle")}</CardTitle>
          <CardDescription>{t("reset.invalid")}</CardDescription>
        </CardHeader>
        <CardFooter>
          <Button asChild className="w-full">
            <Link href="/forgot-password">{t("reset.requestNew")}</Link>
          </Button>
        </CardFooter>
      </Card>
    );
  }

  if (done) {
    return (
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <div className="mb-2 flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <CheckCircle2 className="size-6" />
          </div>
          <CardTitle className="text-xl">{t("reset.successTitle")}</CardTitle>
          <CardDescription>{t("reset.successDescription")}</CardDescription>
        </CardHeader>
        <CardFooter>
          <Button className="w-full" onClick={() => router.replace("/login")}>
            {t("loginButton")}
          </Button>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-xl">{t("reset.title")}</CardTitle>
        <CardDescription>{t("reset.subtitle")}</CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit((values) => reset.mutate(values))}>
        <CardContent className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="password">{t("reset.newPassword")}</Label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              {...register("password")}
            />
            {errors.password && (
              <p className="text-sm text-destructive">
                {errors.password.message}
              </p>
            )}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="confirmPassword">{t("confirmPassword")}</Label>
            <Input
              id="confirmPassword"
              type="password"
              autoComplete="new-password"
              {...register("confirmPassword")}
            />
            {errors.confirmPassword && (
              <p className="text-sm text-destructive">
                {errors.confirmPassword.message}
              </p>
            )}
          </div>
        </CardContent>
        <CardFooter className="mt-6">
          <Button type="submit" className="w-full" disabled={reset.isPending}>
            {reset.isPending && <Loader2 className="size-4 animate-spin" />}
            {t("reset.submit")}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
