"use client";

import { LOW_CONFIDENCE, type ReviewItem } from "@ftc/shared";
import { Check, Pencil, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Props = {
  item: ReviewItem;
  onChange: (item: ReviewItem) => void;
  onDelete: () => void;
};

function qtyLabel({ qty, unit }: ReviewItem): string {
  if (qty === null) return unit ?? "";
  return unit ? `${qty} ${unit}` : String(qty);
}

/** Renamed items lose their canonical match; the server re-normalizes them on review. */
export function renamed(item: ReviewItem, name: string): ReviewItem {
  if (name === item.name) return item;
  return { ...item, name, canonicalId: `unknown:${name.toLowerCase()}` };
}

export function ItemChip({ item, onChange, onDelete }: Props) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(item.name);
  const [qty, setQty] = useState(item.qty === null ? "" : String(item.qty));
  const [unit, setUnit] = useState(item.unit ?? "");
  const lowConf = item.confidence < LOW_CONFIDENCE;

  function save() {
    const trimmed = name.trim();
    if (!trimmed) return;
    const n = Number(qty);
    onChange({
      ...renamed(item, trimmed),
      qty: qty.trim() && Number.isFinite(n) ? n : null,
      unit: unit.trim() || null,
    });
    setEditing(false);
  }

  if (editing) {
    return (
      <form
        className="flex w-full items-center gap-2 rounded-2xl border-2 border-brand bg-white p-2 shadow-sm"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <Input
          aria-label="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
          className="flex-1"
        />
        <Input
          aria-label="Quantity"
          className="w-16 shrink-0"
          inputMode="decimal"
          value={qty}
          placeholder="qty"
          onChange={(e) => setQty(e.target.value)}
        />
        <Input
          aria-label="Unit"
          className="w-20 shrink-0"
          value={unit}
          placeholder="unit"
          onChange={(e) => setUnit(e.target.value)}
        />
        <Button type="submit" size="icon" aria-label="Save">
          <Check size={16} />
        </Button>
      </form>
    );
  }

  return (
    <div
      className={cn(
        "group flex items-center gap-1 rounded-full border py-1.5 pl-3.5 pr-1 text-sm font-medium transition-shadow duration-150 hover:shadow-sm",
        lowConf
          ? "border-amber-300 bg-amber-50 text-amber-900"
          : "border-stone-200 bg-white text-stone-800",
      )}
      title={
        lowConf
          ? `Low confidence (${Math.round(item.confidence * 100)}%) — please verify`
          : undefined
      }
    >
      <span>{item.name}</span>
      {qtyLabel(item) && (
        <span
          className={cn(
            "text-xs",
            lowConf ? "text-amber-700" : "text-stone-500",
          )}
        >
          · {qtyLabel(item)}
        </span>
      )}
      {lowConf && (
        <span className="ml-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-amber-200 text-[10px] font-bold text-amber-800">
          ?
        </span>
      )}
      <Button
        variant="ghost"
        size="icon"
        className="ml-0.5 h-6 w-6 rounded-full opacity-60 group-hover:opacity-100"
        aria-label={`Edit ${item.name}`}
        onClick={() => setEditing(true)}
      >
        <Pencil size={12} />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 rounded-full opacity-60 group-hover:opacity-100 hover:bg-red-50 hover:text-red-600"
        aria-label={`Remove ${item.name}`}
        onClick={onDelete}
      >
        <X size={12} />
      </Button>
    </div>
  );
}
