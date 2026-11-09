import cors from "cors";
import express from "express";
import { ensureDemoUser, requireUser } from "./auth";
import { env } from "./env";
import { getGraph } from "./graph/build";
import { errorHandler } from "./http";
import { prefs } from "./routes/prefs";
import { scanSteps } from "./routes/scanSteps";
import { scans } from "./routes/scans";
import { uploads } from "./routes/uploads";
import { checkEmbeddingDims } from "./startupChecks";

const app = express();
app.use(cors({ origin: env.WEB_ORIGIN }));
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});
app.use("/uploads", uploads);
app.use("/scans", requireUser, scans, scanSteps);
app.use("/prefs", requireUser, prefs);
app.use((_req, res) => {
  res.status(404).json({ error: { code: "not_found", message: "Route not found" } });
});
app.use(errorHandler);

async function main(): Promise<void> {
  await checkEmbeddingDims(); // first: its errors say how to fix a missing or stale schema
  await ensureDemoUser();
  await getGraph(); // creates checkpoint tables on first boot
  app.listen(env.API_PORT, () => console.log(`api listening on :${env.API_PORT}`));
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
