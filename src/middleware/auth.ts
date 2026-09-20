import type { NextFunction, Request, Response } from "express";
import { createClerkClient, verifyToken } from "@clerk/backend";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { adminUsers, users, type User } from "../db/schema.js";
import { AppError } from "./error.js";

export type AuthenticatedRequest = Request & {
  auth: {
    clerkUserId: string;
    user: User;
  };
};

function getBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return null;
  }
  return header.slice("Bearer ".length).trim() || null;
}

async function resolveInternalUser(
  clerkUserId: string,
  email?: string | null,
): Promise<User> {
  const existing = await db.query.users.findFirst({
    where: eq(users.clerkUserId, clerkUserId),
  });

  if (existing) {
    if (email && existing.email !== email) {
      const [updated] = await db
        .update(users)
        .set({ email, updatedAt: new Date() })
        .where(eq(users.id, existing.id))
        .returning();
      return updated;
    }
    return existing;
  }

  const [created] = await db
    .insert(users)
    .values({
      clerkUserId,
      email: email ?? null,
    })
    .returning();

  return created;
}

export async function requireAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  try {
    const secretKey = process.env.CLERK_SECRET_KEY;
    if (!secretKey) {
      throw new AppError(500, "CLERK_SECRET_KEY is not configured", "CONFIG");
    }

    const token = getBearerToken(req);
    if (!token) {
      throw new AppError(401, "Missing authentication token", "UNAUTHORIZED");
    }

    const payload = await verifyToken(token, { secretKey });
    const clerkUserId = payload.sub;
    if (!clerkUserId) {
      throw new AppError(401, "Invalid authentication token", "UNAUTHORIZED");
    }

    let email: string | null = null;
    try {
      const clerk = createClerkClient({ secretKey });
      const clerkUser = await clerk.users.getUser(clerkUserId);
      email =
        clerkUser.emailAddresses.find(
          (e) => e.id === clerkUser.primaryEmailAddressId,
        )?.emailAddress ??
        clerkUser.emailAddresses[0]?.emailAddress ??
        null;
    } catch {
      // Email enrichment is best-effort; auth still succeeds.
    }

    const user = await resolveInternalUser(clerkUserId, email);
    (req as AuthenticatedRequest).auth = { clerkUserId, user };
    next();
  } catch (err) {
    if (err instanceof AppError) {
      next(err);
      return;
    }
    next(new AppError(401, "Invalid or expired authentication token", "UNAUTHORIZED"));
  }
}

export async function requireAdmin(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  try {
    const authReq = req as AuthenticatedRequest;
    if (!authReq.auth?.user) {
      throw new AppError(401, "Unauthorized", "UNAUTHORIZED");
    }

    const admin = await db.query.adminUsers.findFirst({
      where: eq(adminUsers.userId, authReq.auth.user.id),
    });

    if (!admin) {
      throw new AppError(403, "Admin access required", "FORBIDDEN");
    }

    next();
  } catch (err) {
    next(err);
  }
}
