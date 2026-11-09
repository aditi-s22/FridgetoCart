import NextAuth, { type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import { type Role, demoLoginConfigured, verifyDemoLogin } from "@/lib/demoAuth";

declare module "next-auth" {
  interface User {
    role?: Role;
  }
  interface Session {
    user: { id: string; role: Role } & import("next-auth").DefaultSession["user"];
  }
}

export const providerFlags = {
  /** The two configured email + password accounts (see lib/demoAuth.ts). */
  demo: demoLoginConfigured(process.env),
  // Email-only, no password: strictly a local-dev convenience. Never available in production.
  dev: process.env.AUTH_DEV_LOGIN === "true" && process.env.NODE_ENV !== "production",
};

const providers: NextAuthConfig["providers"] = [];
if (providerFlags.demo) {
  providers.push(
    Credentials({
      id: "credentials",
      name: "Email and password",
      credentials: { email: { label: "Email", type: "email" }, password: { label: "Password", type: "password" } },
      authorize: (creds) => {
        const parsed = z.object({ email: z.string().max(254), password: z.string().max(200) }).safeParse(creds);
        if (!parsed.success) return null;
        return verifyDemoLogin(parsed.data.email, parsed.data.password, process.env);
      },
    }),
  );
}
if (providerFlags.dev) {
  providers.push(
    Credentials({
      id: "dev",
      name: "Dev login",
      credentials: { email: { label: "Email", type: "email" } },
      authorize: (creds) => {
        const email = z.string().email().safeParse(creds?.email);
        if (!email.success) return null;
        const e = email.data.toLowerCase();
        return { id: `dev:${e}`, email: e, name: e.split("@")[0], role: "user" as const };
      },
    }),
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: process.env.NEXTAUTH_SECRET,
  providers,
  session: { strategy: "jwt" },
  pages: { signIn: "/signin" },
  callbacks: {
    // A stable user id across sessions ("demo:tester", "demo:admin" or "dev:<email>"). The API keys users by it.
    // The role is stored in the signed JWT; it is not used for any admin feature yet.
    jwt({ token, user }) {
      if (user?.id) {
        token.sub = user.id;
        token.role = user.role ?? "user";
      }
      return token;
    },
    session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      // The JWT is signed with NEXTAUTH_SECRET, so the stored role is trusted; anything unexpected falls back to "user".
      session.user.role = token.role === "admin" ? "admin" : "user";
      return session;
    },
  },
});
