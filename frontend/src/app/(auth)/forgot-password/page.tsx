"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Loader2, MailCheck } from "lucide-react";
import { toast } from "sonner";
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
import { authApi } from "@/lib/api";

export default function ForgotPasswordPage() {
  const t = useTranslations("auth");
  const [sent, setSent] = useState(false);

  const schema = useMemo(
    () => z.object({ email: z.email(t("errors.invalidEmail")) }),
    [t],
  );
  type FormValues = z.infer<typeof schema>;

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const forgot = useMutation({
    mutationFn: (values: FormValues) => authApi.forgotPassword(values.email),
    // Backend always returns 204 (no user enumeration), so we always land here.
    onSuccess: () => setSent(true),
    onError: () => toast.error(t("errors.networkError")),
  });

  if (sent) {
    return (
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <div className="mb-2 flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <MailCheck className="size-6" />
          </div>
          <CardTitle className="text-xl">{t("forgot.sentTitle")}</CardTitle>
          <CardDescription>{t("forgot.sentDescription")}</CardDescription>
        </CardHeader>
        <CardFooter className="mt-4">
          <Button asChild variant="outline" className="w-full">
            <Link href="/login">{t("loginButton")}</Link>
          </Button>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-xl">{t("forgot.title")}</CardTitle>
        <CardDescription>{t("forgot.subtitle")}</CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit((values) => forgot.mutate(values))}>
        <CardContent className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="email">{t("email")}</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder={t("emailPlaceholder")}
              {...register("email")}
            />
            {errors.email && (
              <p className="text-sm text-destructive">{errors.email.message}</p>
            )}
          </div>
        </CardContent>
        <CardFooter className="mt-6 flex-col gap-4">
          <Button type="submit" className="w-full" disabled={forgot.isPending}>
            {forgot.isPending && <Loader2 className="size-4 animate-spin" />}
            {t("forgot.submit")}
          </Button>
          <p className="text-sm text-muted-foreground">
            <Link href="/login" className="text-foreground underline">
              {t("forgot.backToLogin")}
            </Link>
          </p>
        </CardFooter>
      </form>
    </Card>
  );
}
