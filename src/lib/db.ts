import { PrismaClient } from "@prisma/client";

// Lazy singleton — PrismaClient is only instantiated when first accessed,
// not at module import time. This prevents build failures when the Prisma
// binary is not yet generated (run `prisma generate` before `next build`).

declare global {
  // eslint-disable-next-line no-var
  var _prisma: PrismaClient | undefined;
}

function getPrisma(): PrismaClient {
  if (!global._prisma) {
    global._prisma = new PrismaClient({
      log: process.env.NODE_ENV === "development"
        ? ["error", "warn"]
        : ["error"],
    });
  }
  return global._prisma;
}

// Proxy that creates the client on first property access
const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    return (getPrisma() as unknown as Record<string | symbol, unknown>)[prop];
  },
});

export default prisma;
