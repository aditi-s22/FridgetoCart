import { Diet, UserPrefs } from "@ftc/shared";
import { Router } from "express";
import { userIdOf } from "../auth";
import { prisma } from "../db";
import { parse } from "../http";

export const prefs = Router();

export async function prefsOf(userId: string): Promise<UserPrefs> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  return { diet: Diet.parse(user.diet), avoid: user.avoid, maxTimeMins: user.maxTimeMins };
}

prefs.get("/", async (_req, res) => {
  res.json(await prefsOf(userIdOf(res.locals)));
});

prefs.put("/", async (req, res) => {
  const body = parse(UserPrefs, req.body);
  const avoid = [...new Set(body.avoid.map((a) => a.trim()).filter(Boolean))];
  await prisma.user.update({ where: { id: userIdOf(res.locals) }, data: { ...body, avoid } });
  res.json({ ...body, avoid });
});
