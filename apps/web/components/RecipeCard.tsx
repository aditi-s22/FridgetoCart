"use client";

import type { Recipe } from "@ftc/shared";
import { Check, ChevronDown, Clock, ExternalLink, Loader2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const DIET_LABEL: Record<string, { label: string; className: string }> = {
  jain: { label: "Jain", className: "bg-emerald-100 text-emerald-800" },
  veg: { label: "Veg", className: "bg-green-100 text-green-800" },
  egg: { label: "Egg", className: "bg-amber-100 text-amber-800" },
  nonveg: { label: "Non-veg", className: "bg-red-100 text-red-800" },
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
  const nameOf = (id: string) => recipe.ingredients.find((i) => i.canonicalId === id)?.name ?? id;
  const total = recipe.have.length + recipe.missing.length;
  // dietTags lists every diet that can eat it; the first is the strictest, which is the useful label.
  const diet = DIET_LABEL[recipe.dietTags[0] ?? ""];

  return (
    <article className={cn("rounded-2xl border bg-white p-4 shadow-sm", selected ? "border-brand ring-2 ring-brand/30" : "border-stone-200")}>
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-lg font-semibold leading-snug">{recipe.title}</h2>
        {diet && <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-xs font-medium", diet.className)}>{diet.label}</span>}
      </div>
      <div className="mt-1 flex items-center gap-3 text-sm text-stone-600">
        <span className="inline-flex items-center gap-1">
          <Clock size={14} /> {recipe.timeMins} min
        </span>
        <span className={cn("font-medium", recipe.missing.length === 0 ? "text-brand" : "text-stone-700")}>
          You have {recipe.have.length}/{total}
        </span>
      </div>

      {recipe.note && <p className="mt-2 rounded-lg bg-stone-50 px-3 py-2 text-sm text-stone-700">{recipe.note}</p>}

      <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
        {recipe.have.map((id) => (
          <span key={id} className="rounded-full bg-green-50 px-2 py-0.5 text-green-800">{nameOf(id)}</span>
        ))}
        {recipe.missing.map((id) => (
          <span key={id} className="rounded-full bg-red-50 px-2 py-0.5 font-medium text-red-700">+ {nameOf(id)}</span>
        ))}
      </div>

      <button
        type="button"
        className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-stone-700"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <ChevronDown size={16} className={cn("transition-transform", open && "rotate-180")} /> {open ? "Hide" : "Show"} steps
      </button>
      {open && (
        <div className="mt-2 space-y-3 text-sm text-stone-700">
          <ol className="list-decimal space-y-2 pl-5">
            {recipe.steps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
          {recipe.sourceUrl && (
            <a href={recipe.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-stone-500 underline">
              Original recipe <ExternalLink size={12} />
            </a>
          )}
        </div>
      )}

      <Button className="mt-4 w-full" variant={selected ? "default" : "outline"} disabled={disabled} onClick={onPick}>
        {picking && <Loader2 size={16} className="animate-spin" />}
        {selected ? (
          <>
            <Check size={16} /> Cooking this
          </>
        ) : (
          "Cook this"
        )}
      </Button>
    </article>
  );
}
