import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const VARIANTS = {
  default:
    "bg-brand text-brand-foreground shadow-sm hover:bg-brand/90 active:scale-[0.98]",
  outline:
    "border border-stone-300 bg-white text-stone-700 shadow-sm hover:bg-stone-50 hover:border-stone-400 active:scale-[0.98]",
  ghost: "text-stone-700 hover:bg-stone-100 hover:text-stone-900",
  destructive:
    "bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 active:scale-[0.98]",
} as const;

const SIZES = {
  default: "h-11 px-5 text-sm",
  sm: "h-8 px-3 text-xs",
  lg: "h-12 px-6 text-base",
  icon: "h-8 w-8",
} as const;

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof VARIANTS;
  size?: keyof typeof SIZES;
};

export function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: Props) {
  return (
    <button
      className={cn(
        "inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl font-medium",
        "transition-all duration-150",
        "disabled:pointer-events-none disabled:opacity-50",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    />
  );
}
