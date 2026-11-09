import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const VARIANTS = {
  default: "bg-brand text-brand-foreground hover:bg-brand/90",
  outline: "border border-stone-300 bg-white hover:bg-stone-100",
  ghost: "hover:bg-stone-100",
} as const;

const SIZES = {
  default: "h-11 px-5",
  sm: "h-8 px-3 text-sm",
  icon: "h-8 w-8",
} as const;

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof VARIANTS;
  size?: keyof typeof SIZES;
};

export function Button({ className, variant = "default", size = "default", ...props }: Props) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors",
        "disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-brand",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    />
  );
}
