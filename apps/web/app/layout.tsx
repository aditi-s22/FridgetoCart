import type { Metadata, Viewport } from "next";
import { Inter, Instrument_Serif } from "next/font/google";
import Link from "next/link";
import type { ReactNode } from "react";
import { History, Leaf, Settings } from "lucide-react";
import { auth, signOut } from "@/auth";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-display",
  display: "swap",
});

export const metadata: Metadata = {
  title: "FridgeToCart : Cook smarter, shop less",
  description:
    "Snap your fridge, get meals you can cook right now, and a cart for whatever's missing.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default async function RootLayout({ children }: { children: ReactNode }) {
  const session = await auth();

  async function logout() {
    "use server";
    await signOut({ redirectTo: "/signin" });
  }

  const initials = (
    session?.user?.name?.[0] ?? session?.user?.email?.[0] ?? "U"
  ).toUpperCase();

  return (
    <html
      lang="en"
      className={`${inter.variable} ${instrumentSerif.variable}`}
    >
      <body>
        {/* ── Header ───────────────────────────────── */}
        <header className="sticky top-0 z-40 border-b border-stone-200/70 bg-[#FAF7F2]/90 backdrop-blur-sm">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
            {/* Logo */}
            <Link href="/" className="group flex items-center gap-2">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand text-white shadow-sm transition-transform duration-200 group-hover:scale-105">
                <Leaf size={16} strokeWidth={2.5} />
              </div>
              <span className="text-lg font-semibold tracking-tight text-stone-900">
                Fridge<span className="text-brand">To</span>Cart
              </span>
            </Link>

            {/* Navigation */}
            {session ? (
              <nav className="flex items-center gap-0.5">
                <Link
                  href="/history"
                  className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-stone-600 hover:bg-stone-100 hover:text-stone-900"
                >
                  <History size={15} />
                  <span className="hidden sm:inline">History</span>
                </Link>
                <Link
                  href="/prefs"
                  className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-stone-600 hover:bg-stone-100 hover:text-stone-900"
                >
                  <Settings size={15} />
                  <span className="hidden sm:inline">Preferences</span>
                </Link>

                {/* Avatar + sign-out */}
                <form action={logout} className="ml-1">
                  <button
                    type="submit"
                    title={`Sign out (${session.user?.email ?? ""})`}
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-brand text-xs font-bold text-white shadow-sm transition-opacity hover:opacity-80 focus-visible:outline-2 focus-visible:outline-brand"
                  >
                    {initials}
                  </button>
                </form>
              </nav>
            ) : (
              <Link
                href="/signin"
                className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand/90"
              >
                Sign in
              </Link>
            )}
          </div>
        </header>

        {/* ── Main ─────────────────────────────────── */}
        <main className="mx-auto min-h-[calc(100vh-8rem)] max-w-5xl px-4 py-8 sm:px-6">
          {children}
        </main>

        {/* ── Footer ───────────────────────────────── */}
        <footer className="border-t border-stone-200/70">
          <div className="mx-auto flex max-w-5xl flex-col gap-2 px-4 py-6 text-xs text-stone-500 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <p className="flex items-center gap-1.5">
              <Leaf size={12} className="text-brand" /> FridgeToCart · Cook smarter, shop less
            </p>
            <p>
              Recipes adapted from the 6000+ Indian Food Recipes Dataset (CC BY 4.0) · Demo store, no checkout
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
