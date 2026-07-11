"use client";

import { useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api";
import { profileApi } from "@/lib/profile-api";

export function ChangePasswordCard() {
  const t = useTranslations("profile.password");
  const tAuth = useTranslations("auth.errors");

  const schema = useMemo(
    () =>
      z
        .object({
          currentPassword: z.string().min(1, t("currentRequired")),
          newPassword: z.string().min(8, tAuth("passwordTooShort")),
          confirmPassword: z.string(),
        })
        .refine((v) => v.newPassword === v.confirmPassword, {
          message: tAuth("passwordsDontMatch"),
          path: ["confirmPassword"],
        }),
    [t, tAuth],
  );
  type FormValues = z.infer<typeof schema>;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const change = useMutation({
    mutationFn: (v: FormValues) =>
      profileApi.changePassword(v.currentPassword, v.newPassword),
    onSuccess: () => {
      toast.success(t("success"));
      reset();
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 400) {
        toast.error(t("wrongCurrent"));
      } else {
        toast.error(tAuth("serverError"));
      }
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={handleSubmit((v) => change.mutate(v))}
          className="grid gap-4"
        >
          <div className="grid gap-2">
            <Label htmlFor="currentPassword">{t("current")}</Label>
            <Input
              id="currentPassword"
              type="password"
              autoComplete="current-password"
              {...register("currentPassword")}
            />
            {errors.currentPassword && (
              <p className="text-sm text-destructive">
                {errors.currentPassword.message}
              </p>
            )}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="newPassword">{t("new")}</Label>
            <Input
              id="newPassword"
              type="password"
              autoComplete="new-password"
              {...register("newPassword")}
            />
            {errors.newPassword && (
              <p className="text-sm text-destructive">
                {errors.newPassword.message}
              </p>
            )}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="confirmPassword">{t("confirm")}</Label>
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
          <Button type="submit" className="w-fit" disabled={change.isPending}>
            {change.isPending && <Loader2 className="size-4 animate-spin" />}
            {t("submit")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
