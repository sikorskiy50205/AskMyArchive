import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Compass } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/logo";

export default async function NotFound() {
  const t = await getTranslations("errors.notFound");

  return (
    <div className="flex min-h-svh flex-col">
      <header className="p-4">
        <Logo />
      </header>
      <main className="flex flex-1 flex-col items-center justify-center gap-6 p-8 text-center">
        <div className="flex size-24 items-center justify-center rounded-full bg-muted">
          <Compass className="size-12 text-muted-foreground" />
        </div>
        <div className="space-y-2">
          <p className="text-6xl font-bold tracking-tight text-muted-foreground">
            404
          </p>
          <h1 className="text-2xl font-semibold">{t("title")}</h1>
          <p className="max-w-md text-muted-foreground">{t("description")}</p>
        </div>
        <Button asChild>
          <Link href="/">{t("goHome")}</Link>
        </Button>
      </main>
    </div>
  );
}
