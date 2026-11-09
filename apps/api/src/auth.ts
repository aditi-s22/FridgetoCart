import type { RequestHandler } from "express";
import { prisma } from "./db";

// M1: auth is stubbed with one fixed user. Real NextAuth lands in M4.
export const DEMO_USER = { id: "demo-user", email: "demo@fridgetocart.local" } as const;

export async function ensureDemoUser(): Promise<void> {
  await prisma.user.upsert({ where: { id: DEMO_USER.id }, create: DEMO_USER, update: {} });
}

export const requireUser: RequestHandler = (_req, res, next) => {
  res.locals.userId = DEMO_USER.id;
  next();
};

export function userIdOf(locals: Record<string, unknown>): string {
  return locals.userId as string;
}
