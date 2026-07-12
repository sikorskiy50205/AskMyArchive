"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
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
import { GoogleSignInButton } from "@/components/auth/google-sign-in-button";
import { ApiError, authApi } from "@/lib/api";
import { useAuthStore } from "@/lib/auth-store";
import { readEmailFromJwt } from "@/lib/jwt";

export default function LoginPage() {
  const t = useTranslations("auth");
  const router = useRouter();
  const setAuth = useAuthStore((s) => s.setAuth);

  const schema = useMemo(
    () =>
      z.object({
        email: z.email(t("errors.invalidEmail")),
        password: z.string().min(8, t("errors.passwordTooShort")),
      }),
    [t],
  );
  type FormValues = z.infer<typeof schema>;

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const login = useMutation({
    mutationFn: (values: FormValues) =>
      authApi.login(values.email, values.password),
    onSuccess: ({ token }, values) => {
      setAuth(token, values.email.trim().toLowerCase());
      router.replace("/chat");
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 401) {
        toast.error(t("errors.invalidCredentials"));
      } else if (error instanceof ApiError) {
        toast.error(t("errors.serverError"));
      } else {
        toast.error(t("errors.networkError"));
      }
    },
  });

  const googleLogin = useMutation({
    mutationFn: (idToken: string) => authApi.google(idToken),
    onSuccess: ({ token }) => {
      // Email inside the JWT is authoritative; peel it out for display purposes only.
      const email = readEmailFromJwt(token);
      setAuth(token, email ?? "");
      router.replace("/chat");
    },
    onError: (error) => {
      if (error instanceof ApiError) toast.error(t("errors.serverError"));
      else toast.error(t("errors.networkError"));
    },
  });

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-xl">{t("loginTitle")}</CardTitle>
        <CardDescription>{t("loginSubtitle")}</CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit((values) => login.mutate(values))}>
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
          <div className="grid gap-2">
            <Label htmlFor="password">{t("password")}</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              {...register("password")}
            />
            {errors.password && (
              <p className="text-sm text-destructive">
                {errors.password.message}
              </p>
            )}
          </div>
        </CardContent>
        <CardFooter className="mt-6 flex-col gap-4">
          <Button type="submit" className="w-full" disabled={login.isPending}>
            {login.isPending && <Loader2 className="size-4 animate-spin" />}
            {t("loginButton")}
          </Button>
          <div className="flex w-full items-center gap-3 text-xs uppercase text-muted-foreground">
            <div className="h-px flex-1 bg-border" />
            <span>{t("or")}</span>
            <div className="h-px flex-1 bg-border" />
          </div>
          <GoogleSignInButton
            onCredential={(idToken) => googleLogin.mutate(idToken)}
            text="signin_with"
            disabled={googleLogin.isPending}
          />
          <p className="text-sm text-muted-foreground">
            <Link href="/forgot-password" className="text-foreground underline">
              {t("forgotLink")}
            </Link>
          </p>
          <p className="text-sm text-muted-foreground">
            {t("noAccount")}{" "}
            <Link href="/register" className="text-foreground underline">
              {t("registerLink")}
            </Link>
          </p>
        </CardFooter>
      </form>
    </Card>
  );
}

