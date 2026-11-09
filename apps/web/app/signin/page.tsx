import { Leaf } from "lucide-react";
import { redirect } from "next/navigation";
import { auth, providerFlags, signIn } from "@/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default async function SignInPage() {
  if (await auth()) redirect("/");

  async function google() {
    "use server";
    await signIn("google", { redirectTo: "/" });
  }
  async function dev(formData: FormData) {
    "use server";
    await signIn("dev", { email: formData.get("email"), redirectTo: "/" });
  }

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-sm flex-col items-center justify-center gap-8 py-12">
      {/* Brand mark */}
      <div className="flex flex-col items-center gap-3">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand shadow-md">
          <Leaf size={30} strokeWidth={2} className="text-white" />
        </div>
        <div className="text-center">
          <h1 className="font-display text-4xl text-stone-900">
            Fridge<span className="text-brand">To</span>Cart
          </h1>
          <p className="mt-1.5 text-base text-stone-500">
            Cook smarter, shop less.
          </p>
        </div>
      </div>

      {/* Sign-in card */}
      <div className="w-full space-y-4 rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
        <div className="text-center">
          <h2 className="font-semibold text-stone-900">Sign in to continue</h2>
          <p className="mt-1 text-sm text-stone-500">
            Your scans, recipes and preferences are saved to your account.
          </p>
        </div>

        {/* Google */}
        {providerFlags.google && (
          <form action={google}>
            <Button
              className="h-11 w-full border border-stone-300 bg-white text-stone-900 shadow-sm hover:bg-stone-50"
              variant="outline"
              type="submit"
              id="btn-google-signin"
            >
              {/* Google G icon */}
              <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
                <path
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  fill="#4285F4"
                />
                <path
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  fill="#34A853"
                />
                <path
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  fill="#FBBC05"
                />
                <path
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  fill="#EA4335"
                />
              </svg>
              Continue with Google
            </Button>
          </form>
        )}

        {/* Divider */}
        {providerFlags.google && providerFlags.dev && (
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-stone-200" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-white px-2 text-stone-400">or</span>
            </div>
          </div>
        )}

        {/* Dev login */}
        {providerFlags.dev && (
          <form action={dev} className="space-y-3">
            <div className="rounded-2xl border border-dashed border-stone-300 bg-stone-50 p-4">
              <p className="text-xs font-semibold text-stone-600">
                Dev login
              </p>
              <p className="mb-3 mt-0.5 text-xs text-stone-400">
                Local development only. Any email, no password.
              </p>
              <div className="space-y-2">
                <Input
                  name="email"
                  type="email"
                  required
                  placeholder="you@example.com"
                  id="input-dev-email"
                />
                <Button
                  variant="outline"
                  className="h-10 w-full"
                  type="submit"
                  id="btn-dev-signin"
                >
                  Continue
                </Button>
              </div>
            </div>
          </form>
        )}

        {/* No providers configured */}
        {!providerFlags.google && !providerFlags.dev && (
          <div className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-800">
            No sign-in method is configured. Set{" "}
            <code className="rounded bg-amber-100 px-1 font-mono text-xs">
              GOOGLE_CLIENT_ID
            </code>{" "}
            and{" "}
            <code className="rounded bg-amber-100 px-1 font-mono text-xs">
              GOOGLE_CLIENT_SECRET
            </code>{" "}
            in .env, or set{" "}
            <code className="rounded bg-amber-100 px-1 font-mono text-xs">
              AUTH_DEV_LOGIN=true
            </code>
            .
          </div>
        )}
      </div>
    </div>
  );
}
