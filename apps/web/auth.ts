import NextAuth, { type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { z } from "zod";

export const providerFlags = {
  google: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
  // Email-only, no password: strictly a local-dev convenience until Google OAuth keys exist.
  dev: process.env.AUTH_DEV_LOGIN === "true" && process.env.NODE_ENV !== "production",
};

const providers: NextAuthConfig["providers"] = [];
if (providerFlags.google) {
  providers.push(Google({ clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET }));
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
        return { id: `dev:${e}`, email: e, name: e.split("@")[0] };
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
    // A stable user id across sessions: "google:<sub>" or "dev:<email>". The API keys users by it.
    jwt({ token, user, account, profile }) {
      if (account?.provider === "google" && profile?.sub) token.sub = `google:${profile.sub}`;
      else if (account && user?.id) token.sub = user.id;
      return token;
    },
    session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      return session;
    },
  },
});
