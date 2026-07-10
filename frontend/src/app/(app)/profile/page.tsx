"use client";

import { useTranslations } from "next-intl";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useAuthStore } from "@/lib/auth-store";

export default function ProfilePage() {
  const t = useTranslations("profile");
  const email = useAuthStore((s) => s.email);

  return (
    <div className="mx-auto w-full max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">{t("title")}</CardTitle>
          <CardDescription>{t("settingsSoon")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-sm">
            <span className="text-muted-foreground">{t("emailLabel")}: </span>
            <span className="font-medium">{email}</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
