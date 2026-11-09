"use client";

import { Camera, ImageUp, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { StepProgress } from "@/components/StepProgress";
import { Button } from "@/components/ui/button";
import { api, uploadImage } from "@/lib/api";
import { compressImage } from "@/lib/compress";

type Phase = "idle" | "uploading" | "detecting";

export default function UploadPage() {
  const router = useRouter();
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

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

  const busy = phase !== "idle";

  return (
    <div className="space-y-6">
      <StepProgress status="detecting" />
      <div>
        <h1 className="text-2xl font-bold">What&apos;s in your fridge?</h1>
        <p className="mt-1 text-stone-600">Snap one photo. We&apos;ll list what you have and what you can cook.</p>
      </div>

      <div className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-stone-300 bg-white">
        {preview ? (
          <img src={preview} alt="Selected fridge photo" className="h-full w-full object-cover" />
        ) : (
          <span className="text-sm text-stone-400">No photo yet</span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Button variant="outline" disabled={busy} onClick={() => cameraRef.current?.click()}>
          <Camera size={18} /> Camera
        </Button>
        <Button variant="outline" disabled={busy} onClick={() => fileRef.current?.click()}>
          <ImageUp size={18} /> Gallery
        </Button>
      </div>
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => pick(e.target.files?.[0])} />
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => pick(e.target.files?.[0])} />

      <Button className="w-full" disabled={!file || busy} onClick={scan}>
        {busy && <Loader2 size={18} className="animate-spin" />}
        {phase === "uploading" ? "Uploading…" : phase === "detecting" ? "Spotting items…" : "Scan"}
      </Button>
      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    </div>
  );
}
