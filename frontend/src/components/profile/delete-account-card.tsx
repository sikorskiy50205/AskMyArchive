"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
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
import { useAuthStore } from "@/lib/auth-store";
import { profileApi } from "@/lib/profile-api";

export function DeleteAccountCard() {
  const t = useTranslations("profile.delete");
  const router = useRouter();
  const clearAuth = useAuthStore((s) => s.clear);
  const [password, setPassword] = useState("");
  const [open, setOpen] = useState(false);

  const del = useMutation({
    mutationFn: () => profileApi.deleteAccount(password),
    onSuccess: () => {
      toast.success(t("success"));
      clearAuth();
      router.replace("/login");
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 400) {
        toast.error(t("wrongPassword"));
      } else {
        toast.error(t("failed"));
      }
    },
  });

  return (
    <Card className="border-destructive/40">
      <CardHeader>
        <CardTitle className="text-destructive">{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <AlertDialog
          open={open}
          onOpenChange={(next) => {
            setOpen(next);
            if (!next) setPassword("");
          }}
        >
          <AlertDialogTrigger asChild>
            <Button variant="destructive">{t("button")}</Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("confirmTitle")}</AlertDialogTitle>
              <AlertDialogDescription>
                {t("confirmDescription")}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="grid gap-2">
              <Label htmlFor="deletePassword">{t("passwordLabel")}</Label>
              <Input
                id="deletePassword"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  // Keep the dialog open on error so the toast is visible.
                  e.preventDefault();
                  if (password) del.mutate();
                }}
                disabled={!password || del.isPending}
              >
                {del.isPending && <Loader2 className="size-4 animate-spin" />}
                {t("confirmButton")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
