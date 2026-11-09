import { Leaf } from "lucide-react";
import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { auth, providerFlags, signIn } from "@/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { publicDemoCredentials, signInErrorMessage } from "@/lib/demoAuth";

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await auth()) redirect("/");
  const errorMessage = signInErrorMessage((await searchParams).error);
  // Only the tester account is ever shown; admin credentials never leave the server.
  const demo = publicDemoCredentials(process.env);

  async function login(formData: FormData) {
    "use server";
    try {
      await signIn("credentials", {
        email: formData.get("email"),
        password: formData.get("password"),
        redirectTo: "/",
      });
    } catch (err) {
      // Auth.js reports a failed login as an AuthError; the success redirect is rethrown as-is.
      if (err instanceof AuthError) redirect("/signin?error=CredentialsSignin");
      throw err;
    }
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

        {errorMessage && (
          <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {errorMessage}
          </div>
        )}

        {/* Email + password */}
        {providerFlags.demo && (
          <form action={login} className="space-y-3">
            <div className="space-y-1.5">
              <label htmlFor="input-email" className="text-xs font-medium text-stone-600">
                Email
              </label>
              <Input
                id="input-email"
                name="email"
                type="email"
                required
                autoComplete="username"
                placeholder="you@example.com"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="input-password" className="text-xs font-medium text-stone-600">
                Password
              </label>
              <Input
                id="input-password"
                name="password"
                type="password"
                required
                autoComplete="current-password"
              />
            </div>
            <Button className="h-11 w-full" type="submit" id="btn-signin">
              Sign in
            </Button>
          </form>
        )}

        {/* Dev login (local only) */}
        {providerFlags.demo && providerFlags.dev && (
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-stone-200" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-white px-2 text-stone-400">or</span>
            </div>
          </div>
        )}

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

        {/* No sign-in method configured */}
        {!providerFlags.demo && !providerFlags.dev && (
          <div className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-800">
            No sign-in method is configured. Set{" "}
            <code className="rounded bg-amber-100 px-1 font-mono text-xs">
              DEMO_USER_PASSWORD
            </code>{" "}
            (at least 8 characters) in the environment.
          </div>
        )}
      </div>

      {/* Public demo account */}
      {demo && (
        <div className="w-full rounded-2xl border border-stone-200 bg-stone-50 p-4 text-sm" id="demo-credentials">
          <p className="font-semibold text-stone-700">Try the demo</p>
          <p className="mt-0.5 text-xs text-stone-500">
            Shared tester account for portfolio visitors:
          </p>
          <dl className="mt-2 space-y-1 text-stone-700">
            <div className="flex gap-2">
              <dt className="w-16 shrink-0 text-stone-500">Email</dt>
              <dd className="break-all font-mono text-xs">{demo.email}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-16 shrink-0 text-stone-500">Password</dt>
              <dd className="break-all font-mono text-xs">{demo.password}</dd>
            </div>
          </dl>
        </div>
      )}
    </div>
  );
}
