import "dotenv/config";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createApp } from "../src/app.js";
import { ensureBootstrapData } from "../src/game/bootstrap.js";

const app = createApp();
let bootstrapped = false;

async function ensureReady() {
  if (bootstrapped || !process.env.DATABASE_URL) {
    return;
  }
  await ensureBootstrapData();
  bootstrapped = true;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    await ensureReady();
  } catch (err) {
    console.warn("Bootstrap warning:", err);
  }
  return app(req as never, res as never);
}
