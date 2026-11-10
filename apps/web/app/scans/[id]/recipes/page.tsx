"use client";

import type { AppliedSubstitution, ScanView } from "@ftc/shared";
import { ChefHat, Loader2 } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { RecipeCard } from "@/components/RecipeCard";
import { StepProgress } from "@/components/StepProgress";
import { api, screenFor } from "@/lib/api";

function RecipeSkeleton() {
  return (
    <div className="animate-pulse overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
      <div className="h-28 bg-stone-200" />
      <div className="space-y-3 p-5">
        <div className="h-4 w-3/4 rounded-full bg-stone-200" />
        <div className="h-3 w-1/2 rounded-full bg-stone-100" />
        <div className="flex gap-2">
          <div className="h-5 w-16 rounded-full bg-stone-100" />
          <div className="h-5 w-20 rounded-full bg-stone-100" />
          <div className="h-5 w-14 rounded-full bg-stone-100" />
        </div>
        <div className="h-10 w-full rounded-xl bg-stone-100" />
      </div>
    </div>
  );
}

export default function RecipesPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [scan, setScan] = useState<ScanView | null>(null);
  const [picking, setPicking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Accepted substitutions per recipe id; sent with the pick. */
  const [subs, setSubs] = useState<Record<string, AppliedSubstitution[]>>({});

  useEffect(() => {
    api
      .getScan(id)
      .then((s) => {
        const screen = screenFor(s);
        if (screen === "recipes") setScan(s);
        else router.replace(`/scans/${id}/${screen}`);
      })
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "Couldn't load scan"),
      );
  }, [id, router]);

  async function pick(recipeId: string) {
    setPicking(recipeId);
    setError(null);
    try {
      await api.pick(id, recipeId, subs[recipeId] ?? []);
      router.push(`/scans/${id}/cart`);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Couldn't pick that recipe",
      );
      setPicking(null);
    }
  }

  /* Loading skeleton */
  if (!scan) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        {error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3">
              <Loader2 size={20} className="animate-spin text-brand" />
              <p className="text-stone-600">Loading recipes…</p>
            </div>
            <div className="space-y-4">
              <RecipeSkeleton />
              <RecipeSkeleton />
            </div>
          </>
        )}
      </div>
    );
  }

  // A recipe can be selected while the scan still awaits a pick: an earlier attempt failed while building
  // the cart. Then any recipe can be picked again; otherwise a selection means the cart is done.
  const retry = scan.status === "awaiting_pick" && scan.selectedRecipeId !== null;
  const picked = scan.selectedRecipeId !== null && !retry;
  const haveIds = new Set(scan.confirmed.map((i) => i.canonicalId));

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <StepProgress status={scan.status} />

      {/* ── Header ───────────────────────────────────── */}
      <div>
        <h1 className="font-display text-3xl text-stone-900">
          What you can cook
        </h1>
        <p className="mt-1 text-stone-500">
          {picking
            ? "Building your cart…"
            : `Based on ${scan.confirmed.length} confirmed ingredient${scan.confirmed.length !== 1 ? "s" : ""}.`}
        </p>
      </div>

      {retry && (
        <p role="status" className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Your cart wasn&apos;t finished last time. Pick any recipe to try again.
        </p>
      )}

      {/* ── Empty state ──────────────────────────────── */}
      {scan.recipes.length === 0 && (
        <div className="flex flex-col items-center gap-4 rounded-3xl border border-amber-200 bg-amber-50 px-6 py-10 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100">
            <ChefHat size={26} className="text-amber-600" />
          </div>
          <div>
            <p className="font-semibold text-amber-900">No recipes found</p>
            <p className="mt-1 text-sm text-amber-700">
              No recipes match your diet, time limit, and ingredients.
              Try adding more items or adjusting your preferences.
            </p>
          </div>
          <Link
            href="/"
            className="rounded-xl bg-amber-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-amber-700"
          >
            Start a new scan
          </Link>
        </div>
      )}

      {/* ── Recipe cards ─────────────────────────────── */}
      <div className="space-y-5">
        {scan.recipes.map((r) => (
          <RecipeCard
            key={r.id}
            recipe={r}
            scanId={id}
            haveIds={haveIds}
            substitutions={subs[r.id] ?? []}
            onSubstitutionsChange={(next) => setSubs((prev) => ({ ...prev, [r.id]: next }))}
            selected={!retry && scan.selectedRecipeId === r.id}
            disabled={picked || picking !== null}
            picking={picking === r.id}
            onPick={() => pick(r.id)}
          />
        ))}
      </div>

      {error && (
        <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      <p className="text-center text-xs text-stone-400">
        Recipes adapted from the Indian Food Recipes Dataset (Archana&apos;s Kitchen), CC BY 4.0.
      </p>
    </div>
  );
}
