import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";

export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code?: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({
    error: {
      message: "Not found",
      code: "NOT_FOUND",
    },
  });
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: {
        message: err.message,
        code: err.code ?? "APP_ERROR",
      },
    });
    return;
  }

  if (err instanceof ZodError) {
    const first =
      err.issues[0]?.message ??
      err.issues[0]?.path?.join(".") ??
      "Invalid input";
    res.status(400).json({
      error: {
        message: first,
        code: "VALIDATION_ERROR",
        details: err.flatten(),
      },
    });
    return;
  }

  console.error(err);
  res.status(500).json({
    error: {
      message: "Internal server error",
      code: "INTERNAL_ERROR",
    },
  });
}
