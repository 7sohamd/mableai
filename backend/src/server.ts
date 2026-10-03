import { createApp } from './app';
import { config } from './config/env';
import { getDb, closeDb } from './db/connection';
import { initializeSchema } from './db/schema';

// ---------------------------------------------------------------------------
// Database initialization
// ---------------------------------------------------------------------------
let dbReady = false;
try {
  const db = getDb(config.databasePath);
  initializeSchema(db);
  dbReady = true;
  console.log(`[Mable Backend] Database ready at "${config.databasePath}"`);
} catch (err) {
  console.error('[Mable Backend] Database initialization failed:', (err as Error).message);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// HTTP server
// ---------------------------------------------------------------------------
const app = createApp();

const server = dbReady
  ? app.listen(config.port, () => {
      console.log(`[Mable Backend] Server listening on port ${config.port} (ENV: ${config.nodeEnv})`);
    })
  : (() => { process.exit(1); })();

// ---------------------------------------------------------------------------
// Graceful shutdown — close HTTP server then DB connection
// ---------------------------------------------------------------------------
const shutdown = (): void => {
  console.log('[Mable Backend] Gracefully shutting down...');
  if (server && typeof (server as import('http').Server).close === 'function') {
    (server as import('http').Server).close(() => {
      console.log('[Mable Backend] HTTP server closed.');
      closeDb();
      console.log('[Mable Backend] Database connection closed.');
      process.exit(0);
    });
  } else {
    closeDb();
    process.exit(0);
  }
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

export default server;
