"use client";

import type { Cart, ScanView } from "@ftc/shared";
import {
  CheckCircle2,
  Loader2,
  PackageOpen,
  ShoppingBasket,
} from "lucide-react";
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
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "Couldn't load cart"),
      );
  }, [id, router]);

  async function setQty(productId: string, qty: number) {
    setBusy(productId);
    setError(null);
    try {
      setCart(await api.setCartQty(id, productId, qty));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Couldn't update the cart",
      );
    } finally {
      setBusy(null);
    }
  }

  if (!scan) {
    return (
      <div className="mx-auto max-w-2xl">
        {error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4 py-20">
            <Loader2 size={32} className="animate-spin text-brand" />
            <p className="text-sm text-stone-500">Loading your cart…</p>
          </div>
        )}
      </div>
    );
  }

  const recipe = scan.recipes.find((r) => r.id === scan.selectedRecipeId);
  const items = cart?.items ?? [];
  const unavailable = cart?.unavailable ?? [];

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <StepProgress status={scan.status} />

      {/* ── Header ───────────────────────────────────── */}
      <div>
        <h1 className="font-display text-3xl text-stone-900">
          Your grocery cart
        </h1>
        <p className="mt-1 text-stone-500">
          Missing ingredients for{" "}
          <span className="font-medium text-stone-700">
            {recipe?.title ?? "your recipe"}
          </span>
          .
        </p>
      </div>

      {/* ── All-in-pantry state ──────────────────────── */}
      {!cart && (
        <div className="flex flex-col items-center gap-4 rounded-3xl border border-brand/20 bg-brand-muted px-6 py-10 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand/10">
            <CheckCircle2 size={28} className="text-brand" />
          </div>
          <div>
            <p className="font-semibold text-brand">You have everything!</p>
            <p className="mt-1 text-sm text-stone-600">
              All ingredients for {recipe?.title ?? "this recipe"} are already
              in your fridge. Happy cooking!
            </p>
          </div>
          <Link
            href="/"
            className="rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand/90"
          >
            New scan
          </Link>
        </div>
      )}

      {/* ── Cart items ───────────────────────────────── */}
      {items.length > 0 && (
        <section className="rounded-3xl border border-stone-200 bg-white shadow-sm">
          <div className="border-b border-stone-100 px-5 py-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-stone-700">
              <ShoppingBasket size={15} />
              Items to buy
            </h2>
          </div>
          <ul className="divide-y divide-stone-100 px-5">
            {items.map((item) => (
              <CartLine
                key={item.productId}
                item={item}
                busy={busy !== null}
                onQty={(qty) => setQty(item.productId, qty)}
              />
            ))}
          </ul>
          {/* Total */}
          <div className="sticky bottom-0 z-10 flex items-center justify-between border-t border-stone-200 bg-stone-50/95 px-5 py-4 backdrop-blur-sm sm:static">
            <span className="font-semibold text-stone-700">Total</span>
            <span className="text-xl font-bold text-stone-900">
              {rupees(cart?.total ?? 0)}
            </span>
          </div>
        </section>
      )}

      {/* ── Empty cart ───────────────────────────────── */}
      {cart && items.length === 0 && unavailable.length === 0 && (
        <div className="flex flex-col items-center gap-3 rounded-3xl border border-stone-200 bg-white py-10 text-center">
          <ShoppingBasket size={28} className="text-stone-300" />
          <p className="text-sm text-stone-500">Your cart is empty.</p>
        </div>
      )}

      {/* ── Unavailable items ────────────────────────── */}
      {unavailable.length > 0 && (
        <section className="overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-sm">
          <div className="border-b border-stone-100 px-5 py-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-stone-700">
              <PackageOpen size={15} />
              Not in our demo store — buy online
            </h2>
          </div>
          <ul className="divide-y divide-stone-100 px-5">
            {unavailable.map((u) => (
              <li
                key={u.canonicalId}
                className="flex items-center justify-between gap-3 py-4"
              >
                <div>
                  <p className="font-medium text-stone-900">{u.name}</p>
                  <p className="text-xs text-stone-500">
                    {u.reason === "out_of_stock"
                      ? "Out of stock in demo store"
                      : "Not stocked in demo store"}
                  </p>
                </div>
                <StoreLinks links={u.deepLinks} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {error && (
        <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="flex items-center justify-between pt-2">
        <p className="text-xs text-stone-400">
          Demo store — no real checkout. Use Blinkit/Zepto to order.
        </p>
        <Link
          href="/"
          className="text-sm font-medium text-brand hover:underline"
        >
          New scan →
        </Link>
      </div>
    </div>
  );
}
