import express from "express";

// M1 placeholder. Products, carts and idempotent addToCart arrive in M3.
const port = Number(process.env.STORE_PORT ?? 4100);
const app = express();
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.listen(port, () => console.log(`store listening on :${port}`));
