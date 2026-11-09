"use client";

import { LOW_CONFIDENCE, type ReviewItem, type ScanView } from "@ftc/shared";
import { Loader2, Plus } from "lucide-react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ItemChip } from "@/components/ItemChip";
import { StepProgress } from "@/components/StepProgress";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, screenFor } from "@/lib/api";

// Dry goods live in the cupboard, not the fridge, so the photo never shows them.
const PANTRY = ["Rice", "Atta", "Besan", "Toor dal", "Moong dal", "Poha", "Suji", "Bread"];

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
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Couldn't load scan"));
  }, [id, router]);

  function add(name: string) {
    const trimmed = name.trim();
    if (!trimmed || items.some((i) => i.name.toLowerCase() === trimmed.toLowerCase())) return;
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

  if (!scan) {
    return error ? <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p> : <Loader2 className="mx-auto mt-12 animate-spin text-stone-400" />;
  }

  const unsure = items.filter((i) => i.confidence < LOW_CONFIDENCE).length;
  const have = new Set(items.map((i) => i.name.toLowerCase()));

  return (
    <div className="space-y-6">
      <StepProgress status={submitting ? "generating" : scan.status} />
      <div>
        <h1 className="text-2xl font-bold">Here&apos;s what we spotted</h1>
        <p className="mt-1 text-stone-600">
          {items.length} items{ms ? ` · found in ${(ms / 1000).toFixed(1)}s` : ""}.{" "}
          {unsure > 0 && <span className="text-amber-700">Check the {unsure} marked “?”.</span>}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {items.map((item, i) => (
          <ItemChip
            key={`${item.canonicalId}-${i}`}
            item={item}
            onChange={(next) => setItems((prev) => prev.map((p, j) => (j === i ? next : p)))}
            onDelete={() => setItems((prev) => prev.filter((_, j) => j !== i))}
          />
        ))}
        {items.length === 0 && <p className="text-sm text-stone-500">Nothing detected. Add items below.</p>}
      </div>

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          add(newName);
          setNewName("");
        }}
      >
        <Input placeholder="Add an item, e.g. paneer" value={newName} onChange={(e) => setNewName(e.target.value)} />
        <Button type="submit" variant="outline" size="sm" className="h-9" aria-label="Add item">
          <Plus size={16} />
        </Button>
      </form>

      <div>
        <p className="mb-2 text-sm text-stone-600">In your cupboard too?</p>
        <div className="flex flex-wrap gap-2">
          {PANTRY.filter((p) => !have.has(p.toLowerCase())).map((p) => (
            <Button key={p} variant="outline" size="sm" className="rounded-full" onClick={() => add(p)}>
              <Plus size={14} /> {p}
            </Button>
          ))}
        </div>
      </div>

      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <Button className="w-full" disabled={submitting || items.length === 0} onClick={findRecipes}>
        {submitting && <Loader2 size={18} className="animate-spin" />}
        {submitting ? "Finding recipes…" : "Find recipes"}
      </Button>
    </div>
  );
}
