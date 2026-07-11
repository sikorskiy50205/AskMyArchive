import { Skeleton } from "@/components/ui/skeleton";

// Placeholder shown while a conversation's message history loads on first open.
// The staggered widths hint at the alternating user/assistant rhythm.
export function MessageSkeletons() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Skeleton className="h-9 w-56" />
      </div>
      <Skeleton className="h-24 w-4/5 max-w-2xl" />
      <div className="flex justify-end">
        <Skeleton className="h-9 w-44" />
      </div>
      <Skeleton className="h-32 w-4/5 max-w-2xl" />
    </div>
  );
}
