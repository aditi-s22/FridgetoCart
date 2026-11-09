"use client";

import type { Cart, ScanView } from "@ftc/shared";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CartLine, StoreLinks, rupees } from "@/components/CartLine";
import { StepProgress } from "@/components/StepProgress";
import { api, screenFor } from "@/lib/api";

export default function CartPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [scan, setScan] = useState<ScanView | null>(null);
  const [cart, setCart] = useState<Cart | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getScan(id)
      .then((s) => {
        const screen = screenFor(s);
        if (screen !== "cart") return router.replace(`/scans/${id}/${screen}`);
        setScan(s);
        setCart(s.cart);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Couldn't load cart"));
  }, [id, router]);

  async function setQty(productId: string, qty: number) {
    setBusy(productId);
    setError(null);
    try {
      setCart(await api.setCartQty(id, productId, qty));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't update the cart");
    } finally {
      setBusy(null);
    }
  }

  if (!scan) {
    return error ? <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p> : <Loader2 className="mx-auto mt-12 animate-spin text-stone-400" />;
  }

  const recipe = scan.recipes.find((r) => r.id === scan.selectedRecipeId);
  const items = cart?.items ?? [];
  const unavailable = cart?.unavailable ?? [];

  return (
    <div className="space-y-6">
      <StepProgress status={scan.status} />
      <div>
        <h1 className="text-2xl font-bold">Your cart</h1>
        <p className="mt-1 text-stone-600">For {recipe?.title ?? "your recipe"}.</p>
      </div>

      {!cart && <p className="rounded-lg bg-green-50 p-3 text-sm text-green-800">You already have everything. Happy cooking!</p>}

      {items.length > 0 && (
        <section className="rounded-2xl border border-stone-200 bg-white px-4">
          <ul className="divide-y divide-stone-100">
            {items.map((item) => (
              <CartLine key={item.productId} item={item} busy={busy !== null} onQty={(qty) => setQty(item.productId, qty)} />
            ))}
          </ul>
          <div className="flex items-center justify-between border-t border-stone-200 py-3 text-lg font-bold">
            <span>Total</span>
            <span>{rupees(cart?.total ?? 0)}</span>
          </div>
        </section>
      )}
      {cart && items.length === 0 && unavailable.length === 0 && <p className="text-sm text-stone-500">Your cart is empty.</p>}

      {unavailable.length > 0 && (
        <section>
          <h2 className="mb-2 font-semibold">Not in our store — buy online</h2>
          <ul className="divide-y divide-stone-100 rounded-2xl border border-stone-200 bg-white px-4">
            {unavailable.map((u) => (
              <li key={u.canonicalId} className="flex items-center justify-between gap-3 py-3">
                <div>
                  <p className="font-medium">{u.name}</p>
                  <p className="text-sm text-stone-500">{u.reason === "out_of_stock" ? "Out of stock" : "Not stocked"}</p>
                </div>
                <StoreLinks links={u.deepLinks} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <p className="text-center text-xs text-stone-400">
        Demo store: no checkout. Use the Blinkit/Zepto buttons to order. <Link href="/" className="underline">New scan</Link>
      </p>
    </div>
  );
}
