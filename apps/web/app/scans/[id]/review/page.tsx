"use client";

import { LOW_CONFIDENCE, type ReviewItem, type ScanView } from "@ftc/shared";
import { AlertTriangle, Loader2, Plus, ScanLine } from "lucide-react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ItemChip } from "@/components/ItemChip";
import { StepProgress } from "@/components/StepProgress";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, screenFor } from "@/lib/api";
import { cn } from "@/lib/utils";

// Dry goods live in the cupboard, not the fridge, so the photo never shows them.
const PANTRY = [
  "Rice",
  "Atta",
  "Besan",
  "Toor dal",
  "Moong dal",
  "Poha",
  "Suji",
  "Bread",
];

const unknownItem = (name: string): ReviewItem => ({
  canonicalId: `unknown:${name.toLowerCase()}`,
  name,
  qty: null,
  unit: null,
  confidence: 1,
});

export default function ReviewPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const ms = Number(useSearchParams().get("ms")) || null;
  const [scan, setScan] = useState<ScanView | null>(null);
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [newName, setNewName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getScan(id)
      .then((s) => {
        const screen = screenFor(s);
        if (screen !== "review") return router.replace(`/scans/${id}/${screen}`);
        setScan(s);
        setItems(s.items);
      })
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "Couldn't load scan"),
      );
  }, [id, router]);

  function add(name: string) {
    const trimmed = name.trim();
    if (
      !trimmed ||
      items.some((i) => i.name.toLowerCase() === trimmed.toLowerCase())
    )
      return;
    setItems((prev) => [...prev, unknownItem(trimmed)]);
  }

  async function findRecipes() {
    setSubmitting(true);
    setError(null);
    try {
      await api.review(id, items);
      router.push(`/scans/${id}/recipes`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't get recipes");
      setSubmitting(false);
    }
  }

  /* Loading / error state */
  if (!scan) {
    return error ? (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        {error}
      </div>
    ) : (
      <div className="flex flex-col items-center gap-4 py-20">
        <Loader2 size={32} className="animate-spin text-brand" />
        <p className="text-sm text-stone-500">Loading your scan…</p>
      </div>
    );
  }

  const unsure = items.filter((i) => i.confidence < LOW_CONFIDENCE).length;
  const have = new Set(items.map((i) => i.name.toLowerCase()));

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <StepProgress status={submitting ? "generating" : scan.status} />

      {/* ── Header ───────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl text-stone-900">
            Here&apos;s what we spotted
          </h1>
          <p className="mt-1 text-stone-500">
            {items.length} item{items.length !== 1 ? "s" : ""}
            {ms ? ` · found in ${(ms / 1000).toFixed(1)}s` : ""}
          </p>
          {unsure > 0 && (
            <div className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800">
              <AlertTriangle size={12} />
              Check the {unsure} item{unsure > 1 ? "s" : ""} marked with&nbsp;?
            </div>
          )}
        </div>
        {/* Fridge thumbnail */}
        <img
          src={scan.imageUrl}
          alt="Your fridge"
          className="h-20 w-20 shrink-0 rounded-2xl border border-stone-200 object-cover shadow-sm"
        />
      </div>

      {/* ── Ingredient chips ─────────────────────────── */}
      <div className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm">
        {items.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-stone-100">
              <ScanLine size={22} className="text-stone-400" />
            </div>
            <p className="text-sm text-stone-500">
              Nothing detected. Add items below.
            </p>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {items.map((item, i) => (
              <ItemChip
                key={`${item.canonicalId}-${i}`}
                item={item}
                onChange={(next) =>
                  setItems((prev) => prev.map((p, j) => (j === i ? next : p)))
                }
                onDelete={() =>
                  setItems((prev) => prev.filter((_, j) => j !== i))
                }
              />
            ))}
          </div>
        )}

        {/* Add ingredient form */}
        <form
          className="mt-4 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            add(newName);
            setNewName("");
          }}
        >
          <Input
            placeholder="Add an item, e.g. paneer"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <Button
            type="submit"
            variant="outline"
            size="sm"
            className="h-10 shrink-0"
            aria-label="Add item"
          >
            <Plus size={16} />
          </Button>
        </form>
      </div>

      {/* ── Pantry staples ───────────────────────────── */}
      <div className="space-y-2">
        <p className="text-sm font-medium text-stone-600">
          Also in your cupboard?
        </p>
        <div className="flex flex-wrap gap-2">
          {PANTRY.filter((p) => !have.has(p.toLowerCase())).map((p) => (
            <button
              key={p}
              type="button"
              className={cn(
                "inline-flex items-center gap-1 rounded-full border border-brand/30 bg-brand-muted px-3 py-1 text-sm font-medium text-brand",
                "transition-colors hover:bg-brand hover:text-white",
              )}
              onClick={() => add(p)}
            >
              <Plus size={13} />
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* ── Error + CTA ──────────────────────────────── */}
      {error && (
        <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}
      <Button
        className="h-12 w-full text-base"
        size="lg"
        disabled={submitting || items.length === 0}
        onClick={findRecipes}
        id="btn-find-recipes"
      >
        {submitting && <Loader2 size={18} className="animate-spin" />}
        {submitting ? "Finding recipes…" : "Find recipes"}
      </Button>
    </div>
  );
}
