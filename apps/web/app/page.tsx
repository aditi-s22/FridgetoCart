"use client";

import type { ScanSummary } from "@ftc/shared";
import {
  Camera,
  ChefHat,
  CheckCircle,
  ImageUp,
  Loader2,
  ScanLine,
  ShoppingCart,
  Sparkles,
  Upload,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { StepProgress } from "@/components/StepProgress";
import { Button } from "@/components/ui/button";
import { api, screenFor, uploadImage } from "@/lib/api";
import { compressImage } from "@/lib/compress";
import { cn } from "@/lib/utils";

type Phase = "idle" | "uploading" | "detecting";

const HOW_IT_WORKS = [
  {
    icon: <Camera size={22} />,
    title: "Snap your fridge",
    desc: "Take a photo or upload from gallery.",
  },
  {
    icon: <Sparkles size={22} />,
    title: "AI spots ingredients",
    desc: "Gemini Vision detects everything in seconds.",
  },
  {
    icon: <ChefHat size={22} />,
    title: "Pick a recipe",
    desc: "Personalised to your diet and what you have.",
  },
  {
    icon: <ShoppingCart size={22} />,
    title: "Shop the rest",
    desc: "One-tap Blinkit or Zepto links for missing items.",
  },
];

const STATUS_LABEL: Record<string, string> = {
  detecting: "Scanning…",
  awaiting_review: "Review items",
  generating: "Finding recipes…",
  awaiting_pick: "Pick a recipe",
  building_cart: "Building cart…",
  done: "Done",
  failed: "Failed",
};

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });

export default function UploadPage() {
  const router = useRouter();
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [recentScans, setRecentScans] = useState<ScanSummary[]>([]);

  // Revoke object URL on cleanup
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );

  // Load recent scans (silent fail — user might not be authed yet)
  useEffect(() => {
    api
      .listScans()
      .then((r) => setRecentScans(r.scans.slice(0, 3)))
      .catch(() => {});
  }, []);

  function pick(f: File | undefined) {
    if (!f) return;
    setError(null);
    setFile(f);
    setPreview(URL.createObjectURL(f));
  }

  async function scan() {
    if (!file) return;
    setError(null);
    const started = performance.now();
    try {
      setPhase("uploading");
      const imageUrl = await uploadImage(await compressImage(file));
      setPhase("detecting");
      const { scanId } = await api.createScan(imageUrl);
      const ms = Math.round(performance.now() - started);
      router.push(`/scans/${scanId}/review?ms=${ms}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setPhase("idle");
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    pick(e.dataTransfer.files[0]);
  }

  const busy = phase !== "idle";

  return (
    <div className="mx-auto max-w-2xl space-y-10">
      {/* ── Hero ────────────────────────────────────── */}
      <div className="space-y-3 pt-2">
        <h1 className="font-display text-4xl leading-tight text-stone-900 sm:text-5xl">
          Cook what&apos;s already
          <br />
          in your fridge.
        </h1>
        <p className="text-lg text-stone-500">
          Snap a photo. Get personalised recipes. Shop for the rest.
        </p>
      </div>

      {/* ── Upload card ─────────────────────────────── */}
      <div className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
        {/* Progress (only show when scanning) */}
        {busy && (
          <div className="mb-6">
            <StepProgress status={phase === "uploading" ? "detecting" : "detecting"} />
          </div>
        )}

        {/* Drop zone */}
        <div
          className={cn(
            "relative flex min-h-56 cursor-pointer flex-col items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed transition-all duration-200",
            dragging
              ? "border-brand bg-brand-muted"
              : preview
                ? "border-transparent"
                : "border-stone-200 bg-stone-50 hover:border-stone-300 hover:bg-stone-100",
          )}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => !preview && fileRef.current?.click()}
          role="button"
          aria-label="Upload fridge photo"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") fileRef.current?.click();
          }}
        >
          {preview ? (
            <>
              <img
                src={preview}
                alt="Selected fridge photo"
                className="h-full w-full object-cover"
              />
              {/* Overlay to re-pick */}
              <button
                type="button"
                className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 opacity-0 transition-opacity hover:opacity-100"
                onClick={(e) => {
                  e.stopPropagation();
                  fileRef.current?.click();
                }}
              >
                <Upload size={28} className="text-white" />
                <span className="mt-2 text-sm font-medium text-white">
                  Change photo
                </span>
              </button>
            </>
          ) : (
            <div className="flex flex-col items-center gap-3 p-6 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-muted">
                <ScanLine size={28} className="text-brand" />
              </div>
              <div>
                <p className="font-medium text-stone-700">
                  {dragging ? "Drop to upload" : "Drop a fridge photo here"}
                </p>
                <p className="mt-1 text-sm text-stone-400">
                  or use the buttons below
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Hidden inputs */}
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={(e) => pick(e.target.files?.[0])}
        />
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => pick(e.target.files?.[0])}
        />

        {/* Buttons */}
        <div className="mt-4 grid grid-cols-2 gap-3">
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => cameraRef.current?.click()}
            id="btn-camera"
          >
            <Camera size={17} />
            Camera
          </Button>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
            id="btn-gallery"
          >
            <ImageUp size={17} />
            Gallery
          </Button>
        </div>

        {/* Error */}
        {error && (
          <p className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        )}

        {/* Primary CTA */}
        <Button
          className="mt-4 h-12 w-full text-base"
          size="lg"
          disabled={!file || busy}
          onClick={scan}
          id="btn-scan"
        >
          {busy && <Loader2 size={18} className="animate-spin" />}
          {phase === "uploading"
            ? "Uploading…"
            : phase === "detecting"
              ? "Spotting ingredients…"
              : "Scan my fridge"}
        </Button>
      </div>

      {/* ── Recent scans ────────────────────────────── */}
      {recentScans.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-stone-900">Recent scans</h2>
            <Link
              href="/history"
              className="text-sm font-medium text-brand hover:underline"
            >
              View all
            </Link>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {recentScans.map((s) => (
              <Link
                key={s.scanId}
                href={`/scans/${s.scanId}/${screenFor(s)}`}
                className="group flex items-center gap-3 overflow-hidden rounded-2xl border border-stone-200 bg-white p-3 shadow-sm transition-shadow hover:shadow-md"
              >
                <img
                  src={s.imageUrl}
                  alt="Fridge scan"
                  className="h-12 w-12 shrink-0 rounded-xl object-cover"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-stone-900">
                    {s.recipeTitle ?? "Fridge scan"}
                  </p>
                  <p className="text-xs text-stone-500">{when(s.createdAt)}</p>
                  <span
                    className={cn(
                      "mt-0.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold",
                      s.status === "done"
                        ? "bg-brand-muted text-brand"
                        : s.status === "failed"
                          ? "bg-red-50 text-red-700"
                          : "bg-amber-50 text-amber-800",
                    )}
                  >
                    {STATUS_LABEL[s.status] ?? s.status}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* ── How it works ────────────────────────────── */}
      <section className="space-y-4">
        <h2 className="font-semibold text-stone-900">How it works</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {HOW_IT_WORKS.map((step, i) => (
            <div
              key={step.title}
              className="flex flex-col gap-3 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm"
            >
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-brand-muted text-brand">
                  {step.icon}
                </span>
                <span className="text-xs font-bold text-stone-400">
                  0{i + 1}
                </span>
              </div>
              <div>
                <p className="text-sm font-semibold text-stone-900">
                  {step.title}
                </p>
                <p className="mt-0.5 text-xs text-stone-500">{step.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Footer note ─────────────────────────────── */}
      <p className="text-center text-xs text-stone-400">
        Recipes from the Indian Food Recipes Dataset (Archana&apos;s Kitchen), CC BY 4.0.
      </p>
    </div>
  );
}
