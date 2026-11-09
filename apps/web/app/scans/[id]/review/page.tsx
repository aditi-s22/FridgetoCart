"use client";

import { LOW_CONFIDENCE, type ReviewItem, type ScanView } from "@ftc/shared";
import { Loader2, Plus } from "lucide-react";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ItemChip } from "@/components/ItemChip";
import { StepProgress } from "@/components/StepProgress";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";

export default function ReviewPage() {
  const { id } = useParams<{ id: string }>();
  const ms = Number(useSearchParams().get("ms")) || null;
  const [scan, setScan] = useState<ScanView | null>(null);
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getScan(id)
      .then((s) => {
        setScan(s);
        setItems(s.items);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Couldn't load scan"));
  }, [id]);

  function add() {
    const name = newName.trim();
    if (!name) return;
    setItems((prev) => [...prev, { canonicalId: `unknown:${name.toLowerCase()}`, name, qty: null, unit: null, confidence: 1 }]);
    setNewName("");
  }

  if (error) return <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>;
  if (!scan) return <Loader2 className="mx-auto mt-12 animate-spin text-stone-400" />;

  const unsure = items.filter((i) => i.confidence < LOW_CONFIDENCE).length;

  return (
    <div className="space-y-6">
      <StepProgress status={scan.status} />
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
          add();
        }}
      >
        <Input placeholder="Add an item, e.g. paneer" value={newName} onChange={(e) => setNewName(e.target.value)} />
        <Button type="submit" variant="outline" size="sm" className="h-9" aria-label="Add item">
          <Plus size={16} />
        </Button>
      </form>

      {/* Submitting the review (POST /scans/:id/review) lands in M2. */}
      <Button className="w-full" disabled title="Recipes arrive in M2">
        Find recipes
      </Button>
    </div>
  );
}
