import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Input({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-10 w-full rounded-xl border border-stone-200 bg-white px-3 text-sm text-stone-900",
        "placeholder:text-stone-400",
        "transition-colors duration-150",
        "hover:border-stone-300",
        "focus-visible:border-brand focus-visible:outline-2 focus-visible:outline-brand/30",
        className,
      )}
      {...props}
    />
  );
}
