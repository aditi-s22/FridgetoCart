"use client";

import type { ScanView } from "@ftc/shared";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { RecipeCard } from "@/components/RecipeCard";
import { StepProgress } from "@/components/StepProgress";
import { api, screenFor } from "@/lib/api";

export default function RecipesPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [scan, setScan] = useState<ScanView | null>(null);
  const [picking, setPicking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getScan(id)
      .then((s) => (screenFor(s) === "review" ? router.replace(`/scans/${id}/review`) : setScan(s)))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Couldn't load scan"));
  }, [id, router]);

  async function pick(recipeId: string) {
    setPicking(recipeId);
    setError(null);
    try {
      const { status } = await api.pick(id, recipeId);
      setScan((s) => (s ? { ...s, status, selectedRecipeId: recipeId } : s));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't pick that recipe");
    } finally {
      setPicking(null);
    }
  }

  if (!scan) {
    return error ? <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p> : <Loader2 className="mx-auto mt-12 animate-spin text-stone-400" />;
  }

  const picked = scan.selectedRecipeId !== null;

  return (
    <div className="space-y-6">
      <StepProgress status={scan.status} />
      <div>
        <h1 className="text-2xl font-bold">{picked ? "Good choice" : "What you can cook"}</h1>
        <p className="mt-1 text-stone-600">
          {picked
            ? "Your cart for the missing items is coming in the next update."
            : `Based on ${scan.confirmed.length} items. Missing ingredients are in red.`}
        </p>
      </div>

      {scan.recipes.length === 0 && (
        <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
          No recipes match your diet, time limit and items. Try adding a few more items.{" "}
          <Link href="/" className="underline">Start a new scan</Link>
        </p>
      )}

      <div className="space-y-4">
        {scan.recipes.map((r) => (
          <RecipeCard
            key={r.id}
            recipe={r}
            selected={scan.selectedRecipeId === r.id}
            disabled={picked || picking !== null}
            picking={picking === r.id}
            onPick={() => pick(r.id)}
          />
        ))}
      </div>
      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <p className="text-center text-xs text-stone-400">
        Recipes adapted from the 6000+ Indian Food Recipes Dataset (Archana&apos;s Kitchen), CC BY 4.0.
      </p>
    </div>
  );
}
