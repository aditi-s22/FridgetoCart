import { API_TOKEN_AUDIENCE, API_TOKEN_ISSUER, ApiTokenClaims } from "@ftc/shared";
import type { RequestHandler } from "express";
import { jwtVerify } from "jose";
import { prisma } from "./db";
import { env } from "./env";
import { AppError } from "./http";

const secret = new TextEncoder().encode(env.API_JWT_SECRET);
const knownUsers = new Set<string>();

/**
 * The web app signs users in with NextAuth and exchanges the session for a short-lived HS256
 * token (apps/web/app/api/token). Here we verify it and make sure the user row exists.
 */
export const requireUser: RequestHandler = async (req, res, next) => {
  const token = /^Bearer (.+)$/.exec(req.get("Authorization") ?? "")?.[1];
  if (!token) throw new AppError(401, "unauthenticated", "Sign in to continue");
  let claims: ApiTokenClaims;
  try {
    const { payload } = await jwtVerify(token, secret, { algorithms: ["HS256"], issuer: API_TOKEN_ISSUER, audience: API_TOKEN_AUDIENCE });
    claims = ApiTokenClaims.parse(payload);
  } catch {
    throw new AppError(401, "unauthenticated", "Your session expired. Sign in again.");
  }
  if (!knownUsers.has(claims.sub)) {
    await prisma.user.upsert({ where: { id: claims.sub }, create: { id: claims.sub, email: claims.email }, update: { email: claims.email } });
    knownUsers.add(claims.sub);
  }
  res.locals.userId = claims.sub;
  next();
};

export function userIdOf(locals: Record<string, unknown>): string {
  return locals.userId as string;
}
