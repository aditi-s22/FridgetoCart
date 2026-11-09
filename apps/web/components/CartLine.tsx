import type { CartItem, DeepLinks } from "@ftc/shared";
import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

export const rupees = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

export function StoreLinks({ links }: { links: DeepLinks }) {
  const cls = "rounded-md border border-stone-300 px-2 py-1 text-xs font-medium hover:bg-stone-100";
  return (
    <div className="flex gap-1.5">
      <a href={links.blinkit} target="_blank" rel="noreferrer" className={cls}>Blinkit</a>
      <a href={links.zepto} target="_blank" rel="noreferrer" className={cls}>Zepto</a>
    </div>
  );
}

type Props = { item: CartItem; busy: boolean; onQty: (qty: number) => void };

export function CartLine({ item, busy, onQty }: Props) {
  return (
    <li className="flex flex-col gap-2 py-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium">{item.name}</p>
          <p className="text-sm text-stone-500">{item.unit} · {rupees(item.price)}</p>
        </div>
        <p className="font-semibold">{rupees(item.price * item.qty)}</p>
      </div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2" aria-label={`Quantity of ${item.name}`}>
          <Button variant="outline" size="icon" aria-label="Decrease" disabled={busy} onClick={() => onQty(item.qty - 1)}>
            <Minus size={14} />
          </Button>
          <span className="w-6 text-center tabular-nums">{item.qty}</span>
          <Button variant="outline" size="icon" aria-label="Increase" disabled={busy || item.qty >= 20} onClick={() => onQty(item.qty + 1)}>
            <Plus size={14} />
          </Button>
        </div>
        <StoreLinks links={item.deepLinks} />
      </div>
    </li>
  );
}
