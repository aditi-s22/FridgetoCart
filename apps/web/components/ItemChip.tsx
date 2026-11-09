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
    onChange({ ...renamed(item, trimmed), qty: qty.trim() && Number.isFinite(n) ? n : null, unit: unit.trim() || null });
    setEditing(false);
  }

  if (editing) {
    return (
      <form
        className="flex w-full items-center gap-2 rounded-xl border border-brand bg-white p-2"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <Input aria-label="Name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        <Input aria-label="Quantity" className="w-16" inputMode="decimal" value={qty} placeholder="qty" onChange={(e) => setQty(e.target.value)} />
        <Input aria-label="Unit" className="w-20" value={unit} placeholder="unit" onChange={(e) => setUnit(e.target.value)} />
        <Button type="submit" size="icon" aria-label="Save">
          <Check size={16} />
        </Button>
      </form>
    );
  }

  return (
    <div
      className={cn(
        "flex items-center gap-1 rounded-full border py-1 pl-3 pr-1 text-sm",
        lowConf ? "border-amber-400 bg-amber-50" : "border-stone-300 bg-white",
      )}
      title={lowConf ? `Not sure about this one (${Math.round(item.confidence * 100)}%)` : undefined}
    >
      <span className="font-medium">{item.name}</span>
      {qtyLabel(item) && <span className="text-stone-500">· {qtyLabel(item)}</span>}
      {lowConf && <span className="text-amber-600">?</span>}
      <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full" aria-label={`Edit ${item.name}`} onClick={() => setEditing(true)}>
        <Pencil size={14} />
      </Button>
      <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full" aria-label={`Remove ${item.name}`} onClick={onDelete}>
        <X size={14} />
      </Button>
    </div>
  );
}
