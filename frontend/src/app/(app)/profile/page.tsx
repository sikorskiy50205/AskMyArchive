"use client";

import { useQuery } from "@tanstack/react-query";
import { FileText, Mail, MessagesSquare, Calendar } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { ChangePasswordCard } from "@/components/profile/change-password-card";
import { DeleteAccountCard } from "@/components/profile/delete-account-card";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateTime } from "@/lib/format";
import { profileApi } from "@/lib/profile-api";

export default function ProfilePage() {
  const t = useTranslations("profile");
  const locale = useLocale();

  const { data, isPending } = useQuery({
    queryKey: ["profile"],
    queryFn: profileApi.me,
  });

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <h1 className="text-xl font-semibold">{t("title")}</h1>

      <Card>
        <CardHeader>
          <CardTitle>{t("overview")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm">
          {isPending || !data ? (
            <>
              <Skeleton className="h-5" />
              <Skeleton className="h-5" />
              <Skeleton className="h-5" />
            </>
          ) : (
            <>
              <Row icon={<Mail className="size-4" />} label={t("emailLabel")}>
                <span className="font-medium">{data.email}</span>
              </Row>
              <Row
                icon={<Calendar className="size-4" />}
                label={t("joinedLabel")}
              >
                {formatDateTime(data.createdAt, locale)}
              </Row>
              <Row
                icon={<FileText className="size-4" />}
                label={t("documentsLabel")}
              >
                {data.documentCount}
              </Row>
              <Row
                icon={<MessagesSquare className="size-4" />}
                label={t("questionsLabel")}
              >
                {data.questionCount}
              </Row>
            </>
          )}
        </CardContent>
      </Card>

      <ChangePasswordCard />
      <DeleteAccountCard />
    </div>
  );
}

function Row({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex size-8 items-center justify-center rounded-md bg-muted text-muted-foreground">
        {icon}
      </span>
      <span className="text-muted-foreground">{label}</span>
      <span className="ml-auto">{children}</span>
    </div>
  );
}
