import type { Metadata, Viewport } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "FridgeToCart",
  description: "Snap your fridge, get meals you can cook now, and a cart for whatever's missing.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="border-b border-stone-200 bg-white">
          <div className="mx-auto flex max-w-md items-center px-4 py-3">
            <Link href="/" className="text-lg font-bold">
              Fridge<span className="text-brand">To</span>Cart
            </Link>
          </div>
        </header>
        <main className="mx-auto max-w-md px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
