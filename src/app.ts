import express, { type RequestHandler } from "express";
import cors from "cors";
import helmetImport from "helmet";
import { v1Router } from "./routes/v1/index.js";
import { errorHandler, notFoundHandler } from "./middleware/error.js";

/**
 * Helmet 8 ships dual CJS/ESM; under NodeNext on Vercel the default import
 * is sometimes typed as a module namespace (not callable). Normalize it.
 */
const helmet = (
  typeof helmetImport === "function"
    ? helmetImport
    : (helmetImport as unknown as { default: (...args: never[]) => RequestHandler })
        .default
) as (...args: never[]) => RequestHandler;

export function createApp() {
  const app = express();

  const origins = (process.env.CORS_ORIGINS ?? "http://localhost:5173")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);

  app.use(helmet());
  app.use(
    cors({
      origin: origins,
      credentials: true,
    }),
  );
  app.use(express.json({ limit: "100kb" }));

  app.get("/", (_req, res) => {
    res.json({
      data: {
        name: "Football Star API",
        docs: "/api/v1/health",
      },
    });
  });

  app.use("/api/v1", v1Router);
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
