// All API routes must be dynamic (they hit the DB on every request)
// Import this in any route that needs explicit dynamic marking.
// In Next.js 15, route handlers are dynamic by default when they use
// cookies(), headers() or dynamic data — but we export this explicitly
// to prevent any static analysis issues during build.
export const dynamic = "force-dynamic";
export const runtime = "nodejs"; // never Edge (we use Prisma + bcryptjs)
