"use client";

import type { ScanStatus, ScanSummary } from "@ftc/shared";
import { ChevronRight, Loader2, ScanLine } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api, screenFor } from "@/lib/api";
import { cn } from "@/lib/utils";

const STATUS: Record<
  ScanStatus,
  { label: string; className: string }
> = {
  detecting: {
    label: "Scanning",
    className: "bg-stone-100 text-stone-600",
  },
  awaiting_review: {
    label: "Review items",
    className: "bg-amber-50 text-amber-800 border border-amber-200",
  },
  generating: {
    label: "Finding recipes",
    className: "bg-stone-100 text-stone-600",
  },
  awaiting_pick: {
    label: "Pick a recipe",
    className: "bg-amber-50 text-amber-800 border border-amber-200",
  },
  building_cart: {
    label: "Building cart",
    className: "bg-stone-100 text-stone-600",
  },
  done: {
    label: "Done",
    className: "bg-brand-muted text-brand border border-brand/20",
  },
  failed: {
    label: "Failed",
    className: "bg-red-50 text-red-700 border border-red-200",
  },
};

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });

export default function HistoryPage() {
  const [scans, setScans] = useState<ScanSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .listScans()
      .then((r) => setScans(r.scans))
      .catch((err: unknown) =>
        setError(
          err instanceof Error ? err.message : "Couldn't load your scans",
        ),
      );
  }, []);

  if (error)
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        {error}
      </div>
    );

  if (!scans)
    return (
      <div className="flex flex-col items-center gap-4 py-20">
        <Loader2 size={32} className="animate-spin text-brand" />
        <p className="text-sm text-stone-500">Loading your history…</p>
      </div>
    );

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl text-stone-900">
            Your scan history
          </h1>
          <p className="mt-1 text-stone-500">
            {scans.length} scan{scans.length !== 1 ? "s" : ""} total.
          </p>
        </div>
        <Link
          href="/"
          className="rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand/90"
        >
          New scan
        </Link>
      </div>

      {/* Empty state */}
      {scans.length === 0 && (
        <div className="flex flex-col items-center gap-5 rounded-3xl border border-stone-200 bg-white py-16 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-stone-100">
            <ScanLine size={30} className="text-stone-400" />
          </div>
          <div>
            <p className="font-semibold text-stone-700">No scans yet</p>
            <p className="mt-1 text-sm text-stone-500">
              Snap your fridge to get started.
            </p>
          </div>
          <Link
            href="/"
            className="rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand/90"
          >
            Scan your fridge
          </Link>
        </div>
      )}

      {/* Grid of scan cards */}
      {scans.length > 0 && (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {scans.map((s) => {
            const status = STATUS[s.status];
            const linkable = s.status !== "failed";
            const href = `/scans/${s.scanId}/${screenFor(s)}`;

            const CardContent = (
              <div className="flex flex-col gap-0 overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm transition-shadow">
                {/* Image */}
                <div className="relative aspect-video overflow-hidden bg-stone-100">
                  <img
                    src={s.imageUrl}
                    alt="Fridge scan"
                    className="h-full w-full object-cover"
                  />
                  <div className="absolute right-2 top-2">
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[10px] font-semibold",
                        status.className,
                      )}
                    >
                      {status.label}
                    </span>
                  </div>
                </div>
                {/* Info */}
                <div className="flex items-center justify-between gap-2 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-stone-900">
                      {s.recipeTitle ?? "Fridge scan"}
                    </p>
                    <p className="text-xs text-stone-500">{when(s.createdAt)}</p>
                  </div>
                  {linkable && (
                    <ChevronRight size={16} className="shrink-0 text-stone-400" />
                  )}
                </div>
              </div>
            );

            return (
              <li key={s.scanId}>
                {linkable ? (
                  <Link href={href} className="block hover:shadow-md transition-shadow rounded-2xl">
                    {CardContent}
                  </Link>
                ) : (
                  CardContent
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
