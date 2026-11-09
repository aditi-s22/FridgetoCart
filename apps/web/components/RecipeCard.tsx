"use client";

import type { Recipe } from "@ftc/shared";
import { Check, ChevronDown, Clock, ExternalLink, Loader2, Users } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const DIET_CONFIG: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  jain: { label: "Jain", bg: "bg-emerald-50", text: "text-emerald-800", dot: "bg-emerald-500" },
  veg: { label: "Veg", bg: "bg-green-50", text: "text-green-800", dot: "bg-green-500" },
  egg: { label: "Egg", bg: "bg-amber-50", text: "text-amber-800", dot: "bg-amber-500" },
  nonveg: { label: "Non-veg", bg: "bg-red-50", text: "text-red-800", dot: "bg-red-500" },
};

/** Gradient header palette keyed by diet */
const HEADER_GRADIENTS: Record<string, string> = {
  jain: "from-emerald-700 to-teal-600",
  veg: "from-brand to-brand-light",
  egg: "from-amber-600 to-orange-500",
  nonveg: "from-rose-600 to-red-500",
};

type Props = {
  recipe: Recipe;
  selected: boolean;
  disabled: boolean;
  picking: boolean;
  onPick: () => void;
};

export function RecipeCard({ recipe, selected, disabled, picking, onPick }: Props) {
  const [open, setOpen] = useState(false);
  const nameOf = (id: string) =>
    recipe.ingredients.find((i) => i.canonicalId === id)?.name ?? id;
  const total = recipe.have.length + recipe.missing.length;
  const diet = DIET_CONFIG[recipe.dietTags[0] ?? ""];
  const gradient = HEADER_GRADIENTS[recipe.dietTags[0] ?? ""] ?? "from-stone-600 to-stone-500";
  const haveRatio = total > 0 ? recipe.have.length / total : 0;
  const allHave = recipe.missing.length === 0;

  return (
    <article
      className={cn(
        "overflow-hidden rounded-2xl border bg-white shadow-sm transition-shadow duration-200 hover:shadow-md",
        selected
          ? "border-brand ring-2 ring-brand/20"
          : "border-stone-200",
      )}
    >
      {/* Gradient banner */}
      <div className={cn("relative bg-gradient-to-r px-5 py-5", gradient)}>
        <div className="flex items-start justify-between gap-3">
          <h2 className="font-display text-xl font-normal leading-snug text-white">
            {recipe.title}
          </h2>
          {diet && (
            <span
              className={cn(
                "shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold",
                "bg-white/20 text-white backdrop-blur-sm",
              )}
            >
              {diet.label}
            </span>
          )}
        </div>
        <div className="mt-2 flex items-center gap-4 text-sm text-white/80">
          <span className="inline-flex items-center gap-1.5">
            <Clock size={13} />
            {recipe.timeMins} min
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Users size={13} />
            {recipe.have.length}/{total} ingredients
          </span>
        </div>

        {/* Ingredient ratio bar */}
        <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/30">
          <div
            className="h-full rounded-full bg-white transition-all duration-700"
            style={{ width: `${Math.round(haveRatio * 100)}%` }}
          />
        </div>
      </div>

      {/* Body */}
      <div className="px-5 py-4">
        {recipe.note && (
          <p className="mb-3 rounded-xl bg-stone-50 px-3 py-2 text-xs text-stone-600 italic">
            {recipe.note}
          </p>
        )}

        {/* Ingredient pills */}
        <div className="flex flex-wrap gap-1.5">
          {recipe.have.map((id) => (
            <span
              key={id}
              className="rounded-full bg-brand-muted px-2.5 py-0.5 text-xs font-medium text-brand"
            >
              {nameOf(id)}
            </span>
          ))}
          {recipe.missing.map((id) => (
            <span
              key={id}
              className="rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-medium text-red-700"
            >
              + {nameOf(id)}
            </span>
          ))}
        </div>

        {/* Steps accordion */}
        <button
          type="button"
          className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-stone-600 hover:text-stone-900"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          <ChevronDown
            size={16}
            className={cn("transition-transform duration-200", open && "rotate-180")}
          />
          {open ? "Hide" : "Show"} steps ({recipe.steps.length})
        </button>

        {open && (
          <div className="mt-3 space-y-2 text-sm">
            <ol className="space-y-2 pl-0">
              {recipe.steps.map((s, i) => (
                <li key={i} className="flex gap-3">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-stone-100 text-[10px] font-bold text-stone-500">
                    {i + 1}
                  </span>
                  <span className="text-stone-700">{s}</span>
                </li>
              ))}
            </ol>
            {recipe.sourceUrl && (
              <a
                href={recipe.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs text-stone-400 underline hover:text-stone-600"
              >
                Original recipe <ExternalLink size={11} />
              </a>
            )}
          </div>
        )}

        {/* CTA */}
        <Button
          className="mt-4 w-full"
          variant={selected ? "default" : allHave ? "default" : "outline"}
          disabled={disabled}
          onClick={onPick}
        >
          {picking && <Loader2 size={16} className="animate-spin" />}
          {selected ? (
            <>
              <Check size={16} /> Cooking this
            </>
          ) : (
            "Cook this"
          )}
        </Button>
      </div>
    </article>
  );
}
