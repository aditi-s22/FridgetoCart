import { API_TOKEN_AUDIENCE, API_TOKEN_ISSUER } from "@ftc/shared";
import { SignJWT } from "jose";
import { auth } from "@/auth";

const TTL_SECONDS = 15 * 60;

/** Exchanges the NextAuth session for a short-lived token the API verifies with API_JWT_SECRET. */
export async function GET() {
  const session = await auth();
  const user = session?.user;
  if (!user?.id || !user.email) {
    return Response.json({ error: { code: "unauthenticated", message: "Sign in to continue" } }, { status: 401 });
  }
  const secret = process.env.API_JWT_SECRET;
  if (!secret) return Response.json({ error: { code: "misconfigured", message: "API_JWT_SECRET is not set" } }, { status: 500 });

  const expiresAt = Date.now() + TTL_SECONDS * 1000;
  const token = await new SignJWT({ email: user.email, ...(user.name ? { name: user.name } : {}) })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuer(API_TOKEN_ISSUER)
    .setAudience(API_TOKEN_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt / 1000))
    .sign(new TextEncoder().encode(secret));
  return Response.json({ token, expiresAt }, { headers: { "Cache-Control": "no-store" } });
}
