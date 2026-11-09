import type { ScanStatus } from "@ftc/shared";
import { Camera, ChefHat, ShoppingCart, UtensilsCrossed } from "lucide-react";
import { cn } from "@/lib/utils";

const STEPS: { label: string; icon: React.ReactNode }[] = [
  { label: "Scan", icon: <Camera size={13} /> },
  { label: "Review", icon: <UtensilsCrossed size={13} /> },
  { label: "Recipes", icon: <ChefHat size={13} /> },
  { label: "Cart", icon: <ShoppingCart size={13} /> },
];

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
  const failed = status === "failed";

  return (
    <div className="mb-2">
      {/* Progress track */}
      <div className="flex items-center gap-1 mb-2">
        {STEPS.map((step, i) => (
          <div key={step.label} className="flex flex-1 items-center">
            <div
              className={cn(
                "h-2 flex-1 rounded-full transition-all duration-500",
                failed
                  ? "bg-red-300"
                  : i < current
                    ? "bg-brand"
                    : i === current
                      ? "animate-pulse bg-brand-light"
                      : "bg-stone-200",
              )}
            />
          </div>
        ))}
      </div>

      {/* Step labels with icons */}
      <ol className="flex" aria-label="Progress">
        {STEPS.map((step, i) => {
          const done = !failed && i < current;
          const active = !failed && i === current;
          return (
            <li key={step.label} className="flex-1">
              <div
                className={cn(
                  "flex items-center gap-1 text-xs font-medium",
                  failed && i === 0
                    ? "text-red-500"
                    : done
                      ? "text-brand"
                      : active
                        ? "text-stone-900"
                        : "text-stone-400",
                )}
              >
                <span
                  className={cn(
                    "flex h-4 w-4 items-center justify-center rounded-full",
                    done
                      ? "bg-brand text-white"
                      : active
                        ? "bg-stone-900 text-white ring-4 ring-brand-muted"
                        : "bg-stone-200 text-stone-400",
                  )}
                >
                  {step.icon}
                </span>
                <span className="hidden sm:inline">{step.label}</span>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
