"use client";

import { Loader2 } from "lucide-react";
import { Header } from "@/components/shell/header";
import { Sidebar } from "@/components/shell/sidebar";
import { useAuthGuard } from "@/lib/use-auth-guard";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ready = useAuthGuard();

  if (!ready) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex min-h-svh">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header />
        <main className="flex flex-1 flex-col p-6">{children}</main>
      </div>
    </div>
  );
}
