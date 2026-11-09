/**
 * Prints an API token for local testing with curl (same claims the web app mints).
 *
 *   pnpm dev:token you@example.com
 *   curl -H "Authorization: Bearer $(pnpm -s dev:token you@example.com)" localhost:4000/scans
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { API_TOKEN_AUDIENCE, API_TOKEN_ISSUER } from "@ftc/shared";
import { config } from "dotenv";
import { SignJWT } from "jose";

config({ path: join(dirname(fileURLToPath(import.meta.url)), "../.env"), quiet: true });
const email = (process.argv[2] ?? "dev@fridgetocart.local").toLowerCase();
const secret = process.env.API_JWT_SECRET;
if (!secret) {
  console.error("API_JWT_SECRET is not set in .env");
  process.exit(1);
}

const token = await new SignJWT({ email })
  .setProtectedHeader({ alg: "HS256" })
  .setSubject(`dev:${email}`) // same id the dev email login uses
  .setIssuer(API_TOKEN_ISSUER)
  .setAudience(API_TOKEN_AUDIENCE)
  .setIssuedAt()
  .setExpirationTime("1h")
  .sign(new TextEncoder().encode(secret));
console.log(token);
