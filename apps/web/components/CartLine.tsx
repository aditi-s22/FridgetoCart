import type { CartItem, DeepLinks } from "@ftc/shared";
import { ExternalLink, Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

export const rupees = (n: number) =>
  `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

export function StoreLinks({ links }: { links: DeepLinks }) {
  return (
    <div className="flex gap-2">
      <a
        href={links.blinkit}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800 transition-colors hover:bg-amber-100"
      >
        Blinkit <ExternalLink size={10} />
      </a>
      <a
        href={links.zepto}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1 rounded-lg border border-violet-300 bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-800 transition-colors hover:bg-violet-100"
      >
        Zepto <ExternalLink size={10} />
      </a>
    </div>
  );
}

type Props = { item: CartItem; busy: boolean; onQty: (qty: number) => void };

export function CartLine({ item, busy, onQty }: Props) {
  return (
    <li className="py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-stone-900">{item.name}</p>
          <p className="text-sm text-stone-500">
            {item.unit} · {rupees(item.price)} each
          </p>
        </div>
        <p className="shrink-0 text-sm font-semibold text-stone-900">
          {rupees(item.price * item.qty)}
        </p>
      </div>

      <div className="mt-2 flex items-center justify-between">
        {/* Quantity stepper */}
        <div
          className="flex items-center rounded-xl border border-stone-200 bg-stone-50"
          aria-label={`Quantity of ${item.name}`}
        >
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-l-xl rounded-r-none border-r border-stone-200"
            aria-label="Decrease"
            disabled={busy || item.qty <= 1}
            onClick={() => onQty(item.qty - 1)}
          >
            <Minus size={14} />
          </Button>
          <span className="w-8 text-center text-sm font-semibold tabular-nums text-stone-900">
            {item.qty}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-l-none rounded-r-xl border-l border-stone-200"
            aria-label="Increase"
            disabled={busy || item.qty >= 20}
            onClick={() => onQty(item.qty + 1)}
          >
            <Plus size={14} />
          </Button>
        </div>

        <StoreLinks links={item.deepLinks} />
      </div>
    </li>
  );
}
