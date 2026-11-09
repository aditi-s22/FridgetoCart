import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-9 w-full rounded-md border border-stone-300 bg-white px-3 text-sm",
        "placeholder:text-stone-400 focus-visible:outline-2 focus-visible:outline-brand",
        className,
      )}
      {...props}
    />
  );
}
