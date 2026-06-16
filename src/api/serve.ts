// ════════════════════════════════════════════════════════════════════════
//  src/api/serve.ts
//
//  Entry point.  Run with:
//    npx tsx src/api/serve.ts
//
//  Boots the Hono app via @hono/node-server on PORT (default 3001).
//  DATABASE_URL must be set (via .env or the shell environment) for
//  any route that touches Prisma.
// ════════════════════════════════════════════════════════════════════════

import { serve } from '@hono/node-server';
import { PrismaClient } from '@prisma/client';
import { buildRoutes, ROUTE_COUNT } from './server';

const PORT = Number(process.env['PORT'] ?? 3001);

async function main(): Promise<void> {
  const prisma = new PrismaClient();

  // Verify the DB connection is reachable before accepting traffic
  try {
    await prisma.$connect();
  } catch (err) {
    console.warn('[adlytic] Warning: database connection failed — DB-backed routes will error.', err);
  }

  const app = buildRoutes(prisma);

  serve(
    { fetch: app.fetch, port: PORT },
    (info) => {
      console.log(`[adlytic] Server listening on http://localhost:${info.port}`);
      console.log(`[adlytic] Routes mounted: ${ROUTE_COUNT}`);
      console.log(`[adlytic] Health:     GET http://localhost:${info.port}/api/health`);
      console.log(`[adlytic] Dashboard:  GET http://localhost:${info.port}/api/dashboard/:workspaceId`);
    }
  );

  // Graceful shutdown
  const shutdown = async (signal: string): Promise<void> => {
    console.log(`\n[adlytic] ${signal} received — shutting down…`);
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on('SIGINT', () => { void shutdown('SIGINT'); });
  process.on('SIGTERM', () => { void shutdown('SIGTERM'); });
}

main().catch((err) => {
  console.error('[adlytic:fatal]', err);
  process.exit(1);
});
