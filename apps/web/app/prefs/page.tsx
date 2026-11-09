"use client";

import type { Diet, UserPrefs } from "@ftc/shared";
import { Check, Loader2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

const DIETS: {
  value: Diet;
  label: string;
  hint: string;
  emoji: string;
  bg: string;
  ring: string;
}[] = [
  {
    value: "veg",
    label: "Vegetarian",
    hint: "No meat, fish or eggs",
    emoji: "🌱",
    bg: "bg-green-50",
    ring: "ring-green-400",
  },
  {
    value: "egg",
    label: "Eggetarian",
    hint: "Vegetarian plus eggs",
    emoji: "🥚",
    bg: "bg-amber-50",
    ring: "ring-amber-400",
  },
  {
    value: "jain",
    label: "Jain",
    hint: "No onion, garlic or root veg",
    emoji: "🕉️",
    bg: "bg-emerald-50",
    ring: "ring-emerald-400",
  },
  {
    value: "nonveg",
    label: "Non-vegetarian",
    hint: "Everything goes",
    emoji: "🍗",
    bg: "bg-red-50",
    ring: "ring-red-400",
  },
];

const TIMES = [15, 20, 30, 45, 60];

export default function PrefsPage() {
  const [prefs, setPrefs] = useState<UserPrefs | null>(null);
  const [avoidText, setAvoidText] = useState("");
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getPrefs()
      .then(setPrefs)
      .catch((err: unknown) =>
        setError(
          err instanceof Error
            ? err.message
            : "Couldn't load your preferences",
        ),
      );
  }, []);

  function update(next: Partial<UserPrefs>) {
    setPrefs((p) => (p ? { ...p, ...next } : p));
    setState("idle");
  }

  function addAvoid() {
    const term = avoidText.trim();
    if (
      prefs &&
      term &&
      !prefs.avoid.some((a) => a.toLowerCase() === term.toLowerCase())
    )
      update({ avoid: [...prefs.avoid, term] });
    setAvoidText("");
  }

  async function save() {
    if (!prefs) return;
    setState("saving");
    setError(null);
    try {
      setPrefs(await api.putPrefs(prefs));
      setState("saved");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save");
      setState("idle");
    }
  }

  if (!prefs) {
    return error ? (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        {error}
      </div>
    ) : (
      <div className="flex flex-col items-center gap-4 py-20">
        <Loader2 size={32} className="animate-spin text-brand" />
        <p className="text-sm text-stone-500">Loading preferences…</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div>
        <h1 className="font-display text-3xl text-stone-900">Preferences</h1>
        <p className="mt-1 text-stone-500">
          Set your diet and ingredient preferences. These affect recipe suggestions.
        </p>
      </div>

      {/* ── Diet cards ───────────────────────────────── */}
      <section className="space-y-3">
        <p className="font-semibold text-stone-900">Diet</p>
        <div className="grid grid-cols-2 gap-3">
          {DIETS.map((d) => {
            const selected = prefs.diet === d.value;
            return (
              <label
                key={d.value}
                className={cn(
                  "relative flex cursor-pointer flex-col gap-2 rounded-2xl border p-4 transition-all duration-150",
                  selected
                    ? `border-brand ring-2 ring-brand/20 ${d.bg}`
                    : "border-stone-200 bg-white hover:border-stone-300 hover:bg-stone-50",
                )}
              >
                <input
                  type="radio"
                  name="diet"
                  className="sr-only"
                  checked={selected}
                  onChange={() => update({ diet: d.value })}
                />
                <div className="flex items-center justify-between">
                  <span className="text-2xl">{d.emoji}</span>
                  {selected && (
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand text-white">
                      <Check size={12} />
                    </span>
                  )}
                </div>
                <div>
                  <span className="block font-semibold text-stone-900">
                    {d.label}
                  </span>
                  <span className="block text-xs text-stone-500">{d.hint}</span>
                </div>
              </label>
            );
          })}
        </div>
      </section>

      {/* ── Ingredients to avoid ─────────────────────── */}
      <section className="space-y-3">
        <p className="font-semibold text-stone-900">Ingredients to avoid</p>
        <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
          {prefs.avoid.length === 0 ? (
            <p className="text-sm text-stone-400">
              No ingredients avoided yet.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {prefs.avoid.map((a) => (
                <span
                  key={a}
                  className="inline-flex animate-pop-in items-center gap-1 rounded-full border border-red-200 bg-red-50 py-1 pl-3 pr-1 text-sm text-red-700"
                >
                  {a}
                  <button
                    type="button"
                    aria-label={`Remove ${a}`}
                    className="flex h-5 w-5 items-center justify-center rounded-full hover:bg-red-200"
                    onClick={() =>
                      update({ avoid: prefs.avoid.filter((x) => x !== a) })
                    }
                  >
                    <X size={11} />
                  </button>
                </span>
              ))}
            </div>
          )}

          <form
            className="mt-3 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              addAvoid();
            }}
          >
            <Input
              placeholder="e.g. baingan, mushroom"
              value={avoidText}
              onChange={(e) => setAvoidText(e.target.value)}
            />
            <Button
              type="submit"
              variant="outline"
              size="sm"
              className="h-10 shrink-0"
            >
              Add
            </Button>
          </form>
        </div>
      </section>

      {/* ── Max cooking time ─────────────────────────── */}
      <section className="space-y-3">
        <p className="font-semibold text-stone-900">Max cooking time</p>
        <div role="radiogroup" aria-label="Max cooking time" className="inline-flex w-full rounded-2xl border border-stone-200 bg-white p-1 shadow-sm sm:w-auto">
          {TIMES.map((t) => (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={prefs.maxTimeMins === t}
              className={cn(
                "flex-1 rounded-xl px-4 py-2 text-sm font-semibold transition-all duration-150 sm:flex-none",
                prefs.maxTimeMins === t ? "bg-brand text-white shadow-sm" : "text-stone-600 hover:bg-stone-100",
              )}
              onClick={() => update({ maxTimeMins: t })}
            >
              {t}
              <span className="hidden sm:inline"> min</span>
            </button>
          ))}
        </div>
      </section>

      {/* ── Error + Save ─────────────────────────────── */}
      {error && (
        <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      <Button
        className="h-12 w-full text-base"
        size="lg"
        disabled={state === "saving"}
        onClick={save}
        id="btn-save-prefs"
      >
        {state === "saving" && <Loader2 size={16} className="animate-spin" />}
        {state === "saved" ? (
          <>
            <Check size={16} /> Preferences saved
          </>
        ) : (
          "Save preferences"
        )}
      </Button>
    </div>
  );
}
