import cors from "cors";
import express from "express";
import { requireUser } from "./auth";
import { env } from "./env";
import { getGraph } from "./graph/build";
import { errorHandler } from "./http";
import { cartRoutes } from "./routes/cart";
import { prefs } from "./routes/prefs";
import { scanSteps } from "./routes/scanSteps";
import { scans } from "./routes/scans";
import { traceRoutes } from "./routes/trace";
import { uploads } from "./routes/uploads";
import { checkEmbeddingDims } from "./startupChecks";

const app = express();
app.use(cors({ origin: env.WEB_ORIGIN }));
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});
app.use("/uploads", uploads); // presign requires a user; the local PUT/GET use unguessable keys
app.use("/scans", requireUser, scans, scanSteps, cartRoutes, traceRoutes);
app.use("/prefs", requireUser, prefs);
app.use((_req, res) => {
  res.status(404).json({ error: { code: "not_found", message: "Route not found" } });
});
app.use(errorHandler);

async function main(): Promise<void> {
  await checkEmbeddingDims(); // first: its errors say how to fix a missing or stale schema
  await getGraph(); // creates checkpoint tables on first boot
  app.listen(env.API_PORT, () => console.log(`api listening on :${env.API_PORT}`));
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
