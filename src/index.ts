import "dotenv/config";
import { createApp } from "./app.js";
import { ensureBootstrapData } from "./game/bootstrap.js";

const port = Number(process.env.PORT) || 3001;
const app = createApp();

async function main() {
  if (process.env.DATABASE_URL) {
    try {
      await ensureBootstrapData();
      console.log("Bootstrap data ready (World 1 + skill catalog)");
    } catch (err) {
      console.warn("Bootstrap skipped/failed:", err);
    }
  }

  app.listen(port, () => {
    console.log(`Football Star API listening on http://localhost:${port}`);
  });
}

void main();
