/**
 * Reads the "6000+ Indian Food Recipes Dataset" (Kanishka Jain, Mendeley Data, CC BY 4.0,
 * doi:10.17632/xsphgmmh7b.1) and keeps quick, home-style Indian recipes.
 */
import { readFileSync } from "node:fs";
import { readCsvRecords } from "./csv";
import { type ParsedLine, parseIngredientLine, splitIngredientLines } from "./ingredientLine";

export type SourceRecipe = {
  srno: string;
  title: string;
  course: string;
  cuisine: string;
  diet: string;
  timeMins: number;
  lines: ParsedLine[];
  instructions: string;
  url: string;
};

const FOREIGN = /continental|italian|mexican|thai|chinese|french|middle eastern|asian|japanese|korean|greek|lebanese|american|european|mediterranean|vietnamese|indonesian|malaysian|british|african|caribbean|arab|sri lankan|nepalese|burmese|fusion|indo chinese|world/i;
const COURSES = new Set([
  "Lunch", "Dinner", "Main Course", "Side Dish", "One Pot Dish", "Snack",
  "South Indian Breakfast", "North Indian Breakfast", "Indian Breakfast",
]);
const MAX_TIME = 60;

/** Machine-translated rows sometimes keep Devanagari; skip anything that isn't plain English. */
const mostlyAscii = (s: string) => s.length > 0 && s.replace(/[\x00-\x7F’‘“”–—°½¼¾]/g, "").length / s.length < 0.01;

export function cleanTitle(raw: string): string {
  return raw
    .split(" - ")[0]!
    .replace(/\([^)]*\)/g, "")
    .replace(/\brecipe\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Machine-translated titles are often garbled ("Aar Macher Jhol" → "And fish soup"), so prefer the
 * original name when it's English, then the name the instructions use, then the translation.
 */
function bestTitle(r: Record<string, string>, instructions: string): string {
  const original = r.RecipeName ?? "";
  if (/^[\x00-\x7F]+$/.test(original)) return cleanTitle(original);
  const fromSteps = /\bmak(?:e|ing)\s+(?:the\s+|this\s+)?([A-Z][^.,]{2,60}?)\s+Recipe\b/.exec(instructions)?.[1];
  return cleanTitle(fromSteps ?? r.TranslatedRecipeName ?? "");
}

export function loadSourceRecipes(csvPath: string): SourceRecipe[] {
  const out: SourceRecipe[] = [];
  for (const r of readCsvRecords(readFileSync(csvPath, "utf8"))) {
    const ingredients = r.TranslatedIngredients ?? "";
    const instructions = (r.TranslatedInstructions ?? "").trim();
    const title = bestTitle(r, instructions);
    const timeMins = Number(r.TotalTimeInMins);
    const cuisine = (r.Cuisine ?? "").replace(/﻿/g, "").trim();
    if (!title || !COURSES.has(r.Course ?? "") || FOREIGN.test(cuisine)) continue;
    if (!Number.isFinite(timeMins) || timeMins <= 0 || timeMins > MAX_TIME) continue;
    if (!mostlyAscii(ingredients) || !mostlyAscii(instructions) || !mostlyAscii(title)) continue;
    const lines = splitIngredientLines(ingredients).map(parseIngredientLine).filter((l): l is ParsedLine => l !== null);
    if (lines.length < 3 || lines.length > 16) continue;
    out.push({
      srno: r.Srno ?? "",
      title,
      course: r.Course ?? "",
      cuisine,
      diet: r.Diet ?? "",
      timeMins,
      lines,
      instructions,
      url: r.URL ?? "",
    });
  }
  return out;
}
