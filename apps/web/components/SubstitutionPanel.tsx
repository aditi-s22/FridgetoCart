"use client";

import type { AppliedSubstitution, SubstitutionOption, SubstitutionSuggestion } from "@ftc/shared";
import { ArrowRight, ArrowRightLeft, Check, Loader2, RotateCcw, ShoppingBasket, Sparkles, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

type Props = {
  scanId: string;
  recipeId: string;
  accepted: AppliedSubstitution[];
  disabled: boolean;
  onChange: (subs: AppliedSubstitution[]) => void;
};

const toApplied = (originalId: string, o: SubstitutionOption): AppliedSubstitution => ({
  originalId,
  substituteId: o.substituteId,
  substituteName: o.substituteName,
  qty: o.qty,
  unit: o.unit,
  stepChanges: o.stepChanges,
});

const amount = (o: Pick<SubstitutionOption, "qty" | "unit">) =>
  o.qty !== null ? `${o.qty}${o.unit ? ` ${o.unit}` : ""}` : null;

/** Lazy-loaded AI substitutions for a recipe's missing ingredients, with accept / reject / other options. */
export function SubstitutionPanel({ scanId, recipeId, accepted, disabled, onChange }: Props) {
  const [suggestions, setSuggestions] = useState<SubstitutionSuggestion[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rejected, setRejected] = useState<Set<string>>(new Set());
  const [optionIdx, setOptionIdx] = useState<Record<string, number>>({});

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setSuggestions((await api.suggestSubstitutions(scanId, recipeId)).suggestions);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't get substitutions");
    } finally {
      setLoading(false);
    }
  }

  const accept = (originalId: string, o: SubstitutionOption) =>
    onChange([...accepted.filter((a) => a.originalId !== originalId), toApplied(originalId, o)]);
  const revert = (originalId: string) => onChange(accepted.filter((a) => a.originalId !== originalId));

  if (suggestions === null) {
    return (
      <div className="mt-4">
        <Button variant="outline" size="sm" disabled={loading || disabled} onClick={load}>
          {loading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
          {loading ? "Finding substitutes…" : "Suggest substitutes for missing items"}
        </Button>
        {error && <p className="mt-2 text-xs text-red-700">{error}</p>}
      </div>
    );
  }

  const visible = suggestions.filter((s) => !rejected.has(s.originalId) || accepted.some((a) => a.originalId === s.originalId));

  return (
    <section className="mt-4 rounded-xl border border-stone-200 bg-stone-50 p-3">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-stone-700">
          <ArrowRightLeft size={14} /> Smart substitutions
        </h3>
        {accepted.length > 0 && (
          <button
            type="button"
            className="inline-flex items-center gap-1 text-xs text-stone-500 hover:text-stone-800"
            onClick={() => onChange([])}
            disabled={disabled}
          >
            <RotateCcw size={12} /> Revert all
          </button>
        )}
      </div>

      {visible.length === 0 && (
        <p className="mt-2 text-xs text-stone-500">
          No suitable substitutes found for your diet and ingredients. You can buy these items instead.
        </p>
      )}

      <ul className="mt-2 space-y-2">
        {visible.map((s) => {
          const done = accepted.find((a) => a.originalId === s.originalId);
          const idx = Math.min(optionIdx[s.originalId] ?? 0, s.options.length - 1);
          const o = s.options[idx];
          if (!o) return null;
          return (
            <li key={s.originalId} className={cn("rounded-lg border bg-white p-3 text-sm", done ? "border-brand/40" : "border-stone-200")}>
              <div className="flex flex-wrap items-center gap-1.5 font-medium text-stone-800">
                <span className="text-red-700 line-through decoration-red-300">{s.originalName}</span>
                <ArrowRight size={13} className="text-stone-400" />
                <span>{done ? done.substituteName : o.substituteName}</span>
                {amount(done ?? o) && <span className="text-xs font-normal text-stone-500">({amount(done ?? o)})</span>}
                <span
                  className={cn(
                    "ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold",
                    o.availability === "in_fridge" ? "bg-brand-muted text-brand" : "bg-amber-50 text-amber-800",
                  )}
                >
                  {o.availability === "in_fridge" ? <Check size={11} /> : <ShoppingBasket size={11} />}
                  {o.availability === "in_fridge" ? "In your fridge" : "Needs buying"}
                </span>
              </div>
              <p className="mt-1.5 text-stone-600">{o.reason}</p>
              {o.flavorImpact && <p className="mt-0.5 text-xs italic text-stone-500">{o.flavorImpact}</p>}
              {o.stepChanges.length > 0 && (
                <p className="mt-0.5 text-xs text-stone-500">Method: {o.stepChanges.join(" ")}</p>
              )}

              <div className="mt-2 flex flex-wrap items-center gap-2">
                {done ? (
                  <Button size="sm" variant="outline" disabled={disabled} onClick={() => revert(s.originalId)}>
                    <RotateCcw size={13} /> Undo
                  </Button>
                ) : (
                  <>
                    <Button size="sm" disabled={disabled} onClick={() => accept(s.originalId, o)}>
                      <Check size={13} /> Accept
                    </Button>
                    <Button size="sm" variant="outline" disabled={disabled} onClick={() => setRejected(new Set(rejected).add(s.originalId))}>
                      <X size={13} /> Reject
                    </Button>
                    {s.options.length > 1 && (
                      <button
                        type="button"
                        className="text-xs font-medium text-stone-500 underline hover:text-stone-800"
                        onClick={() => setOptionIdx({ ...optionIdx, [s.originalId]: (idx + 1) % s.options.length })}
                      >
                        Other options ({idx + 1}/{s.options.length})
                      </button>
                    )}
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
