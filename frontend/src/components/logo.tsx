import { Archive } from "lucide-react";
import { cn } from "@/lib/utils";

export function Logo({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-2 font-semibold", className)}>
      <Archive className="size-5" />
      <span>AskMyArchive</span>
    </div>
  );
}
