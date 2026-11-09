import type { ScanStatus } from "@ftc/shared";
import { cn } from "@/lib/utils";

const STEPS = ["Scan", "Review", "Recipes", "Cart"] as const;

const STEP_OF: Record<ScanStatus, number> = {
  detecting: 0,
  awaiting_review: 1,
  generating: 2,
  awaiting_pick: 2,
  building_cart: 3,
  done: 4,
  failed: -1,
};

export function StepProgress({ status }: { status: ScanStatus | null }) {
  const current = status ? STEP_OF[status] : 0;
  return (
    <ol className="flex gap-1.5" aria-label="Progress">
      {STEPS.map((label, i) => (
        <li key={label} className="flex-1">
          <div
            className={cn(
              "h-1.5 rounded-full",
              status === "failed" ? "bg-red-300" : i < current ? "bg-brand" : i === current ? "bg-brand/50" : "bg-stone-200",
            )}
          />
          <span className={cn("mt-1 block text-xs", i === current ? "font-semibold" : "text-stone-500")}>{label}</span>
        </li>
      ))}
    </ol>
  );
}
